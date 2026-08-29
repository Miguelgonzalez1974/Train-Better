import type { BodyweightEntry, PrLogEntry, SessionHistoryEntry, SetFeedbackEntry } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';
import { computeAcwr, daysBetween } from './loadMetrics';
import { SET_FEEL_SCORE } from './setFeedback';

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

/**
 * Via rapida a `confident`: un atleta que ademas valora sus primeras series en cada sesion le da
 * al coach una senal mucho mas densa que un solo RPE al dia — con datos de sobra para individualizar
 * antes de las 8 semanas. Sigue exigiendo varias semanas y muchas sesiones; solo adelanta el momento.
 */
const RESPONSE_FAST_WEEKS = 5;
const RESPONSE_FAST_SESSIONS = 14;
const RESPONSE_FAST_SETFEEL = 16;

/** Feedback de la 1ª serie: valoraciones minimas por levantamiento y cuantas de las mas recientes se promedian. */
const SETFEEL_MIN_OBS = 4;
const SETFEEL_RECENT = 8;
/** Cada punto de sensacion media (justo = 0, "muy duro" = +2) mueve la carga de trabajo ~3%, acotado a [-6%, +4%]. */
const SETFEEL_KG_PER_POINT = 0.03;

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

/**
 * Recuperacion: dias tras un pico de ACWR "alto" para volver a zona buena. El ACWR es una media
 * movil 7/28, asi que incluso un pico "normal" tarda ~10-15 dias en decaer solo por el suavizado —
 * por eso el umbral de "lento" esta en 18 y el de "rapido" en 9, no mas bajos.
 */
const RECOVERY_SLOW_DAYS = 18;
const RECOVERY_FAST_DAYS = 9;

const RX_MIN_SESSIONS = 8;
const RX_TREND_DELTA = 0.15;

/** Peso corporal: puntos minimos y dias que deben abarcar para fiarse de una tendencia; ventana que se mira. */
const BW_MIN_POINTS = 4;
const BW_MIN_SPAN_DAYS = 21;
const BW_WINDOW_DAYS = 42;
/** Umbral de %/semana (sobre el peso medio) para considerar que sube o baja de verdad y no es ruido de bascula. */
const BW_TREND_PCT_PER_WEEK = 0.5;
/** Ajuste de carga cuando el atleta pierde peso durante un bloque de fuerza — menos margen de recuperacion. Solo baja. */
const BW_LOAD_FACTOR_LOSING = 0.97;

export type LiftTier = 'rapido' | 'normal' | 'lento' | 'regresion';
export type RecoveryTier = 'rapido' | 'normal' | 'lento';
export type RxTrend = 'subiendo' | 'estable' | 'bajando';
export type BodyweightTrend = 'subiendo' | 'estable' | 'bajando';

export interface LiftResponse {
  key: string;
  label: string;
  /** % de mejora por mes (puede ser negativo). */
  ratePerMonthPct: number;
  tier: LiftTier;
}

export interface SetFeelCalibration {
  /** Clave de PR (`keyof PersonalRecords` o `keyof VariantPersonalRecords`). */
  key: string;
  label: string;
  /** Media de la sensacion de la 1ª serie: justo = 0, "me sobro" = -1, "duro" = +1, "muy duro" = +2 (ultimas ~8). */
  feelBias: number;
  observations: number;
  /** Factor de carga acotado que el motor aplica a la serie de trabajo de este levantamiento (<1 baja, >1 sube). */
  loadFactor: number;
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
  /**
   * Calibracion de carga por levantamiento a partir del feedback de la 1ª serie (`setFeedbackLog`) —
   * si el atleta marca "me sobro" repetido en un lift, su peso de trabajo va corto y se sube un poco;
   * si marca "duro/muy duro", se baja. Solo lifts con >= `SETFEEL_MIN_OBS` valoraciones recientes.
   * A diferencia del resto del perfil, esto sigue vivo aunque `confident` sea false: es una senal
   * directa que el atleta da a proposito y va acotada por lift.
   */
  setFeel: SetFeelCalibration[];
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
  /**
   * Tendencia de peso corporal en las ultimas ~6 semanas. Un coach lo vigila: perder peso durante
   * un bloque de fuerza es una senal de recuperacion/nutricion insuficiente y el motor baja algo la
   * carga; ganar peso es buena base para ganar fuerza (no cambia nada, ya lo cubre la
   * autorregulacion). null si no hay pesajes suficientes.
   */
  bodyweight: {
    trend: BodyweightTrend | null;
    /** Cambio con signo en % del peso medio por semana. */
    pctPerWeek: number | null;
    points: number;
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

/**
 * Calibracion de carga por levantamiento a partir del feedback en caliente de la 1ª serie. Agrupa
 * por `prKey` (la clave de PR que el motor usara al prescribir ese lift), promedia la sensacion de
 * las valoraciones mas recientes y la traduce a un factor de carga muy acotado. Un `feelBias`
 * positivo (mas duro que "justo") baja la carga; negativo la sube.
 */
function analyzeSetFeel(log: SetFeedbackEntry[]): SetFeelCalibration[] {
  const byKey = new Map<string, SetFeedbackEntry[]>();
  for (const entry of log) {
    if (!entry.prKey) continue;
    const list = byKey.get(entry.prKey) ?? [];
    list.push(entry);
    byKey.set(entry.prKey, list);
  }

  const out: SetFeelCalibration[] = [];
  for (const [key, raw] of byKey) {
    const recent = [...raw].sort((a, b) => a.date.localeCompare(b.date)).slice(-SETFEEL_RECENT);
    if (recent.length < SETFEEL_MIN_OBS) continue;
    const feelBias = mean(recent.map((e) => SET_FEEL_SCORE[e.feel]));
    const loadFactor = clamp(1 - feelBias * SETFEEL_KG_PER_POINT, 0.94, 1.04);
    out.push({ key, label: PR_KEY_LABEL[key] ?? key, feelBias, observations: recent.length, loadFactor });
  }
  // El levantamiento que peor lo pasa primero (feelBias mas alto).
  out.sort((a, b) => b.feelBias - a.feelBias);
  return out;
}

/**
 * Tendencia de peso corporal en la ventana reciente por regresion lineal simple sobre (dia, kg),
 * expresada en % del peso medio por semana. Solo se clasifica como sube/baja si supera
 * `BW_TREND_PCT_PER_WEEK` — por debajo es ruido de bascula.
 */
function analyzeBodyweight(log: BodyweightEntry[], today: Date): ResponseProfile['bodyweight'] {
  const none = { trend: null, pctPerWeek: null, points: 0 } as const;
  const recent = log
    .filter((e) => e.kg > 0 && daysBetween(e.date, today) >= 0 && daysBetween(e.date, today) <= BW_WINDOW_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (recent.length < BW_MIN_POINTS) return none;

  const spanDays = daysBetween(recent[0].date, new Date(`${recent[recent.length - 1].date}T00:00:00`));
  if (spanDays < BW_MIN_SPAN_DAYS) return none;

  // Regresion lineal: x = dias desde el primer pesaje, y = kg.
  const x0 = recent[0].date;
  const xs = recent.map((e) => daysBetween(x0, new Date(`${e.date}T00:00:00`)));
  const ys = recent.map((e) => e.kg);
  const mx = mean(xs);
  const my = mean(ys);
  const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (denom === 0) return none;
  const slopePerDay = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom;
  const pctPerWeek = ((slopePerDay * 7) / my) * 100;

  const trend: BodyweightTrend =
    pctPerWeek >= BW_TREND_PCT_PER_WEEK ? 'subiendo' : pctPerWeek <= -BW_TREND_PCT_PER_WEEK ? 'bajando' : 'estable';
  return { trend, pctPerWeek, points: recent.length };
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
  setFeedbackLog: SetFeedbackEntry[] = [],
  bodyweightLog: BodyweightEntry[] = [],
): ResponseProfile {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const dataWeeks = sorted.length > 0 ? Math.max(0, daysBetween(sorted[0].date, today) / 7) : 0;
  const confident =
    (dataWeeks >= RESPONSE_MIN_WEEKS && sorted.length >= RESPONSE_MIN_SESSIONS) ||
    (dataWeeks >= RESPONSE_FAST_WEEKS &&
      sorted.length >= RESPONSE_FAST_SESSIONS &&
      setFeedbackLog.length >= RESPONSE_FAST_SETFEEL);

  return {
    dataWeeks,
    confident,
    rpe: analyzeRpe(sorted),
    perLift: analyzePerLift(prLog ?? []),
    setFeel: analyzeSetFeel(setFeedbackLog),
    recovery: analyzeRecovery(sorted),
    rx: analyzeRx(sorted),
    bodyweight: analyzeBodyweight(bodyweightLog, today),
  };
}

/** Perfil neutro — el motor lo usa cuando `confident` es false (equivale a "no ajustar nada"). */
export const NEUTRAL_RESPONSE_PROFILE: ResponseProfile = {
  dataWeeks: 0,
  confident: false,
  rpe: { reliability: 1, bias: 0, observations: 0 },
  perLift: [],
  setFeel: [],
  recovery: { tier: null, avgDays: null, cycles: 0 },
  rx: { trend: null, recentRate: null },
  bodyweight: { trend: null, pctPerWeek: null, points: 0 },
};

/**
 * El perfil que el motor debe aplicar: el real si `confident`, si no el neutro — salvo `setFeel`,
 * que se conserva siempre. La calibracion por feedback de la 1ª serie va acotada por lift y con su
 * propio minimo de observaciones, y es una senal que el atleta da a proposito: no necesita esperar
 * a las 8 semanas del resto del perfil.
 */
export function engineResponseProfile(profile: ResponseProfile): ResponseProfile {
  if (profile.confident) return profile;
  return { ...NEUTRAL_RESPONSE_PROFILE, setFeel: profile.setFeel };
}

/** tier de progreso de una clave de PR concreta, o null si no hay dato suficiente. */
export function liftTierFor(profile: ResponseProfile, key: string): LiftTier | null {
  return profile.perLift.find((l) => l.key === key)?.tier ?? null;
}

/**
 * Factor de carga por tendencia de peso corporal: si el atleta viene perdiendo peso durante el
 * bloque, el motor baja un poco la carga (menos recuperacion, menos palanca). Ganar o mantener peso
 * no cambia nada — la autorregulacion ya cubre el dia a dia. Solo actua con perfil `confident`.
 */
export function bodyweightLoadFactor(profile: ResponseProfile): number {
  return profile.bodyweight.trend === 'bajando' ? BW_LOAD_FACTOR_LOSING : 1;
}

/**
 * Factor de carga [0.94, 1.04] a aplicar a la serie de trabajo de un levantamiento segun como el
 * atleta ha venido valorando su 1ª serie. 1 (sin efecto) si no hay clave o no hay datos suficientes.
 */
export function setFeelLoadFactor(profile: ResponseProfile, key: string | null | undefined): number {
  if (!key) return 1;
  return profile.setFeel.find((c) => c.key === key)?.loadFactor ?? 1;
}

const STALLED_TIERS = new Set<LiftTier>(['lento', 'regresion']);

/** Clave de PR de fuerza -> patron de movimiento (los 4 que el motor cicla). */
const PR_KEY_STRENGTH_PATTERN: Record<string, MovementPattern> = {
  backSquat: 'squat',
  frontSquat: 'squat',
  deadlift: 'hinge',
  benchPress: 'horizontalPush',
  strictPress: 'verticalPush',
};

/**
 * Patron de fuerza cuyo levantamiento raiz viene estancado/en caida en el historial de PRs — para
 * darle mas frecuencia aunque no sea el objetivo del atleta. `perLift` ya viene ordenado
 * problemas-primero, asi que el primero que casa es el peor. null si no hay ninguno.
 */
export function stalledStrengthPattern(profile: ResponseProfile): MovementPattern | null {
  for (const lift of profile.perLift) {
    if (!STALLED_TIERS.has(lift.tier)) continue;
    const pattern = PR_KEY_STRENGTH_PATTERN[lift.key];
    if (pattern) return pattern;
  }
  return null;
}

/** Familia de oly (snatch/clean) con un levantamiento estancado/en caida en el historial de PRs, o null. */
export function stalledOlyFamily(profile: ResponseProfile): 'snatch' | 'clean' | null {
  for (const lift of profile.perLift) {
    if (!STALLED_TIERS.has(lift.tier)) continue;
    if (lift.key === 'snatch' || lift.key === 'powerSnatch') return 'snatch';
    if (lift.key === 'clean' || lift.key === 'cleanAndJerk' || lift.key === 'powerClean') return 'clean';
  }
  return null;
}
