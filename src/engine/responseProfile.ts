import type { PrLogEntry, SessionHistoryEntry } from '../data/athlete/types';
import { computeAcwr, daysBetween } from './loadMetrics';

/**
 * Perfil de respuesta del atleta: lo que un coach de verdad aprende de alguien tras 2-3 meses —
 * como progresa cada levantamiento, si sus RPE son fiables, y como recupera. Se calcula del
 * historial que la app YA recoge; el motor solo actua sobre el cuando hay datos suficientes
 * (`confident`), con ajustes pequeños y acotados. Hasta entonces todo es neutro: el coach observa,
 * no toca nada.
 */

// ---- Umbrales ----
/** Semanas de historial a partir de las cuales el motor empieza a fiarse del perfil. */
export const RESPONSE_MIN_WEEKS = 8;
export const RESPONSE_MIN_SESSIONS = 20;

/** RPE: sesiones minimas en cada cubo (semanas duras / semanas suaves) para medir si el RPE discrimina. */
const RPE_MIN_PER_BUCKET = 3;
/** Diferencia de RPE esperada entre semanas duras (2-3) y suaves (1-4) en un atleta que calibra bien. */
const RPE_EXPECTED_SPREAD = 1.5;
/** RPE medio esperado en los dias objetivamente mas cargados (ACWR alto). */
const RPE_ANCHOR_HARD = 8.5;
const RPE_MIN_HARD_DAYS = 4;

/** Progresion: puntos minimos de `prLog` para una clave y dias minimos que deben abarcar. */
const PRLOG_MIN_POINTS = 2;
const PRLOG_MIN_SPAN_DAYS = 21;
const WEEKS_PER_MONTH = 4.345;

/** Recuperacion: dias tras un pico de ACWR "alto" para volver a zona buena. */
const RECOVERY_SLOW_DAYS = 12;
const RECOVERY_FAST_DAYS = 6;

const RX_MIN_SESSIONS = 8;
const RX_TREND_DELTA = 0.15;

export type LiftTier = 'rapido' | 'normal' | 'lento' | 'regresion';
export type RecoveryTier = 'rapido' | 'normal' | 'lento';
export type RxTrend = 'subiendo' | 'estable' | 'bajando';

export interface LiftResponse {
  key: string;
  label: string;
  /** % de mejora por mes (puede ser negativo). */
  ratePerMonthPct: number;
  tier: LiftTier;
}

export interface ResponseProfile {
  /** Semanas de historial disponibles. */
  dataWeeks: number;
  /** true cuando hay datos suficientes para que el motor actue sobre el perfil. */
  confident: boolean;
  rpe: {
    /** 0.4-1: cuanto se fia el coach del RPe del atleta (1 = discrimina bien duras/suaves). */
    reliability: number;
    /** Puntos de RPE que el atleta se desvia sistematicamente (negativo = lo reporta bajo / estoico). */
    bias: number;
    observations: number;
  };
  /** Ritmo de progreso por levantamiento (solo los que tienen datos suficientes en `prLog`). */
  perLift: LiftResponse[];
  recovery: {
    tier: RecoveryTier | null;
    avgDays: number | null;
    /** Ciclos pico->recuperacion completos observados. */
    cycles: number;
  };
  rx: {
    trend: RxTrend | null;
    /** Fraccion de sesiones Rx en la mitad reciente del historial. */
    recentRate: number | null;
  };
}

const PR_KEY_LABEL: Record<string, string> = {
  backSquat: 'Back Squat',
  frontSquat: 'Front Squat',
  benchPress: 'Bench Press',
  deadlift: 'Deadlift',
  strictPress: 'Strict Press',
  clean: 'Clean',
  snatch: 'Snatch',
  cleanAndJerk: 'Clean & Jerk',
  sumoDeadlift: 'Sumo Deadlift',
  pushPress: 'Push Press',
  splitJerk: 'Split Jerk',
  overheadSquat: 'Overhead Squat',
  powerSnatch: 'Power Snatch',
  powerClean: 'Power Clean',
};

const OLY_KEYS = new Set(['clean', 'snatch', 'cleanAndJerk', 'powerSnatch', 'powerClean', 'splitJerk']);

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Fiabilidad y sesgo del RPE — ¿discrimina el atleta entre semanas duras y suaves, y a que nivel? */
function analyzeRpe(history: SessionHistoryEntry[]): ResponseProfile['rpe'] {
  const hard = history.filter((e) => e.mesocycleWeek === 2 || e.mesocycleWeek === 3).map((e) => e.rpe);
  const easy = history.filter((e) => e.mesocycleWeek === 1 || e.mesocycleWeek === 4).map((e) => e.rpe);

  let reliability = 1;
  if (hard.length >= RPE_MIN_PER_BUCKET && easy.length >= RPE_MIN_PER_BUCKET) {
    const spread = mean(hard) - mean(easy);
    reliability = clamp(spread / RPE_EXPECTED_SPREAD, 0.4, 1);
  }

  // Sesgo: RPE medio en los dias objetivamente mas cargados frente al ancla esperada.
  let bias = 0;
  const hardDays: number[] = [];
  for (const e of history) {
    if (computeAcwr(history, new Date(`${e.date}T00:00:00`)).zone === 'alta') hardDays.push(e.rpe);
  }
  if (hardDays.length >= RPE_MIN_HARD_DAYS) {
    bias = clamp(mean(hardDays) - RPE_ANCHOR_HARD, -2, 2);
  }

  return { reliability, bias, observations: history.length };
}

/** Ritmo de progreso por levantamiento a partir del historial de PRs. */
function analyzePerLift(prLog: PrLogEntry[]): LiftResponse[] {
  const byKey = new Map<string, PrLogEntry[]>();
  for (const entry of prLog) {
    if (entry.kg <= 0) continue;
    const list = byKey.get(entry.key) ?? [];
    list.push(entry);
    byKey.set(entry.key, list);
  }

  const out: LiftResponse[] = [];
  for (const [key, rawList] of byKey) {
    const list = [...rawList].sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < PRLOG_MIN_POINTS) continue;
    const first = list[0];
    const last = list[list.length - 1];
    const spanDays = daysBetween(first.date, new Date(`${last.date}T00:00:00`));
    if (spanDays < PRLOG_MIN_SPAN_DAYS || first.kg <= 0) continue;

    const gainPct = ((last.kg - first.kg) / first.kg) * 100;
    const ratePerMonthPct = (gainPct * WEEKS_PER_MONTH) / (spanDays / 7);

    // Ritmos de referencia (% de mejora al mes) para un intermedio: la fuerza basica progresa
    // ~1-2%/mes, el trabajo olimpico algo mas lento. Por debajo de `slowAt` el levantamiento esta
    // practicamente estancado.
    const isOly = OLY_KEYS.has(key);
    const fastAt = isOly ? 1.0 : 1.5;
    const slowAt = isOly ? 0.25 : 0.4;
    let tier: LiftTier;
    if (ratePerMonthPct < -0.5) tier = 'regresion';
    else if (ratePerMonthPct >= fastAt) tier = 'rapido';
    else if (ratePerMonthPct <= slowAt) tier = 'lento';
    else tier = 'normal';

    out.push({ key, label: PR_KEY_LABEL[key] ?? key, ratePerMonthPct, tier });
  }
  // Los "problema" primero (regresion, luego lento), luego el resto por ritmo.
  const rank: Record<LiftTier, number> = { regresion: 0, lento: 1, normal: 2, rapido: 3 };
  out.sort((a, b) => rank[a.tier] - rank[b.tier] || b.ratePerMonthPct - a.ratePerMonthPct);
  return out;
}

/** Dias medios para volver a zona de ACWR buena tras entrar en zona "alta". */
function analyzeRecovery(history: SessionHistoryEntry[]): ResponseProfile['recovery'] {
  if (history.length < 6) return { tier: null, avgDays: null, cycles: 0 };
  const dates = [...new Set(history.map((e) => e.date))].sort();
  const zoneByDate = new Map<string, string>();
  for (const d of dates) zoneByDate.set(d, computeAcwr(history, new Date(`${d}T00:00:00`)).zone);

  const windows: number[] = [];
  let spikeDate: string | null = null;
  let prevHigh = false;
  for (const d of dates) {
    const high = zoneByDate.get(d) === 'alta';
    if (high && !prevHigh) spikeDate = d;
    if (!high && spikeDate && (zoneByDate.get(d) === 'optima' || zoneByDate.get(d) === 'baja')) {
      windows.push(daysBetween(spikeDate, new Date(`${d}T00:00:00`)));
      spikeDate = null;
    }
    prevHigh = high;
  }

  if (windows.length === 0) return { tier: null, avgDays: null, cycles: 0 };
  const avgDays = mean(windows);
  const tier: RecoveryTier = avgDays >= RECOVERY_SLOW_DAYS ? 'lento' : avgDays <= RECOVERY_FAST_DAYS ? 'rapido' : 'normal';
  return { tier, avgDays, cycles: windows.length };
}

/** Tendencia de la tasa de sesiones Rx (¿escala menos que antes?). */
function analyzeRx(history: SessionHistoryEntry[]): ResponseProfile['rx'] {
  if (history.length < RX_MIN_SESSIONS) return { trend: null, recentRate: null };
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2);
  const rate = (xs: SessionHistoryEntry[]) => xs.filter((e) => e.rxOrScaled === 'rx').length / xs.length;
  const early = rate(sorted.slice(0, mid));
  const recent = rate(sorted.slice(mid));
  const delta = recent - early;
  const trend: RxTrend = delta >= RX_TREND_DELTA ? 'subiendo' : delta <= -RX_TREND_DELTA ? 'bajando' : 'estable';
  return { trend, recentRate: recent };
}

export function computeResponseProfile(
  history: SessionHistoryEntry[],
  prLog: PrLogEntry[] | undefined,
  today: Date = new Date(),
): ResponseProfile {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const dataWeeks = sorted.length > 0 ? Math.max(0, daysBetween(sorted[0].date, today) / 7) : 0;
  const confident = dataWeeks >= RESPONSE_MIN_WEEKS && sorted.length >= RESPONSE_MIN_SESSIONS;

  return {
    dataWeeks,
    confident,
    rpe: analyzeRpe(sorted),
    perLift: analyzePerLift(prLog ?? []),
    recovery: analyzeRecovery(sorted),
    rx: analyzeRx(sorted),
  };
}

/** Perfil neutro — el motor lo usa cuando `confident` es false (equivale a "no ajustar nada"). */
export const NEUTRAL_RESPONSE_PROFILE: ResponseProfile = {
  dataWeeks: 0,
  confident: false,
  rpe: { reliability: 1, bias: 0, observations: 0 },
  perLift: [],
  recovery: { tier: null, avgDays: null, cycles: 0 },
  rx: { trend: null, recentRate: null },
};

/** El perfil que el motor debe aplicar: el real si `confident`, si no el neutro. */
export function engineResponseProfile(profile: ResponseProfile): ResponseProfile {
  return profile.confident ? profile : NEUTRAL_RESPONSE_PROFILE;
}

/** tier de progreso de una clave de PR concreta, o null si no hay dato suficiente. */
export function liftTierFor(profile: ResponseProfile, key: string): LiftTier | null {
  return profile.perLift.find((l) => l.key === key)?.tier ?? null;
}
