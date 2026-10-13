import type { PainFlag, SessionHistoryEntry, SetFeedbackEntry, SetFeel, ReadinessCheck } from '../data/athlete/types';
import { computeAcwr } from './loadMetrics';
import { PAIN_AREA_LABEL, getActivePainFlags } from './painFlags';
import { computeRecoverySummary, type RecoveryLevel, type RecoverySummary } from './recovery';

/**
 * "Cómo estás de recuperado hoy", más allá del check-in: junto a lo que DICES que sientes (60 %) entra cómo te está saliendo
 * el entrenamiento (40 %: RPE reciente frente a tu norma y sensación en las primeras series). Un aviso de molestia activo
 * la baja un poco. La carga que llevas encima (ACWR y días seguidos sin descansar) se calcula aquí pero NO entra en la
 * nota: el Dashboard la enseña aparte, en su propio anillo, para no contarla dos veces. Orientativo: son indicios, no un
 * diagnóstico.
 */

export interface ReadinessPart {
  /** 0-100 (más alto = mejor preparado) o null si todavía no hay datos para esa parte. */
  score: number | null;
  /** Una línea con el porqué, en lenguaje de atleta. */
  detail: string;
}

export interface ReadinessScore {
  total: number | null;
  level: RecoveryLevel | null;
  /** true si no hay check-ins y la nota sale solo de las señales objetivas. */
  estimated: boolean;
  feel: ReadinessPart;
  /** La carga (ACWR): no se promedia con lo demás, solo resta (`loadPenalty`) cuando va alta. */
  load: LoadPart;
  /** Puntos que la carga resta a la nota (0 con carga baja u óptima). */
  loadPenalty: number;
  performance: ReadinessPart;
  pain: { count: number; areas: string[]; penalty: number };
  /** La lectura del check-in (barras por día, ejes...) — la tarjeta la sigue enseñando debajo. */
  checkins: RecoverySummary;
}

/** Peso de las dos partes que se promedian. La carga y la molestia no se promedian: restan (ver `computeReadinessScore`). */
const WEIGHT = { feel: 0.6, performance: 0.4 };
const HIGH_FROM = 65;
const LOW_UNTIL = 40;
const PAIN_PENALTY_EACH = 8;
const PAIN_PENALTY_MAX = 16;
const FEEL_SCORE: Record<SetFeel, number> = { sobro: 100, justo: 75, duro: 40, 'muy-duro': 15 };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

const es1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Qué tan "tuyo" es el check-in: la nota absoluta de la semana, tirando hacia tu propia media si ya la hay (ver `computeRecoverySummary`). */
function feelPart(r: RecoverySummary): ReadinessPart {
  if (r.score === null) return { score: null, detail: 'Contesta «¿Cómo llegas hoy?» al menos dos días esta semana.' };
  const relative = r.baseline !== null ? clamp(50 + (r.score - (r.baseline as number))) : null;
  const score = relative !== null ? clamp(0.6 * r.score + 0.4 * relative) : r.score;
  const vs =
    r.delta === null ? '' : Math.abs(r.delta) < 4 ? ' · como tu media' : ` · ${Math.abs(r.delta)} puntos ${r.delta > 0 ? 'por encima' : 'por debajo'} de tu media`;
  return { score, detail: `${r.checks} check-ins esta semana${vs}` };
}

export type LoadPart = ReadinessPart & { penalty: number };

/** Lo que la carga resta a la nota: nada con carga baja u óptima, y más cuanto más alta o más días seguidos sin descansar. */
const ZONE_PENALTY = { baja: 0, optima: 0, moderada: 10, alta: 20 } as const;
const LOAD_PENALTY_MAX = 25;

function loadPart(history: SessionHistoryEntry[], today: Date, todayIso: string): LoadPart {
  const acwr = computeAcwr(history, today);
  if (acwr.coldStart || acwr.acwr === null) return { score: null, detail: 'Aún sin sesiones suficientes para medir tu carga.', penalty: 0 };
  const base = acwr.zone === 'optima' ? 90 : acwr.zone === 'baja' ? 75 : acwr.zone === 'moderada' ? 45 : 20;

  // Días seguidos entrenando hasta hoy (o hasta ayer, si hoy todavía no).
  const dates = new Set(history.map((h) => h.date));
  let cursor = dates.has(todayIso) ? todayIso : null;
  if (cursor === null) {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    cursor = dates.has(yIso) ? yIso : null;
  }
  let streak = 0;
  while (cursor !== null && dates.has(cursor)) {
    streak++;
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const streakPenalty = streak >= 7 ? 12 : streak >= 5 ? 8 : 0;
  const streakScoreDrop = streak >= 7 ? 25 : streak >= 5 ? 12 : 0;

  const zoneText = acwr.zone === 'optima' ? 'zona óptima' : acwr.zone === 'baja' ? 'carga baja' : acwr.zone === 'moderada' ? 'carga algo alta' : 'carga muy alta';
  const streakText = streak >= 5 ? ` · ${streak} días seguidos sin descansar` : '';
  return {
    score: clamp(base - streakScoreDrop),
    detail: `ACWR ${es1(acwr.acwr)} · ${zoneText}${streakText}`,
    penalty: Math.min(LOAD_PENALTY_MAX, ZONE_PENALTY[acwr.zone] + streakPenalty),
  };
}

function performancePart(history: SessionHistoryEntry[], feedback: SetFeedbackEntry[], todayIso: string): ReadinessPart {
  const parts: { score: number; text: string }[] = [];

  // RPE de las últimas sesiones frente a tu norma de las semanas anteriores: si lo mismo te cuesta más, algo pesa.
  const sorted = [...history].filter((h) => dayDiff(h.date, todayIso) >= 0 && dayDiff(h.date, todayIso) <= 35).sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.filter((h) => dayDiff(h.date, todayIso) <= 10).slice(-3);
  const older = sorted.filter((h) => !recent.includes(h));
  if (recent.length >= 3 && older.length >= 4) {
    const mean = (xs: SessionHistoryEntry[]) => xs.reduce((s, h) => s + h.rpe, 0) / xs.length;
    const diff = mean(recent) - mean(older);
    const text = Math.abs(diff) < 0.5 ? 'RPE reciente como lo habitual' : diff > 0 ? `RPE ${es1(diff)} por encima de lo habitual` : `RPE ${es1(Math.abs(diff))} por debajo de lo habitual`;
    parts.push({ score: clamp(70 - 20 * diff), text });
  }

  // Sensación en la primera serie de trabajo de fuerza/oly, de las últimas dos semanas.
  const feels = feedback.filter((f) => dayDiff(f.date, todayIso) >= 0 && dayDiff(f.date, todayIso) <= 14);
  if (feels.length >= 2) {
    const avg = feels.reduce((s, f) => s + FEEL_SCORE[f.feel], 0) / feels.length;
    const hard = feels.filter((f) => f.feel === 'duro' || f.feel === 'muy-duro').length;
    parts.push({ score: clamp(avg), text: hard === 0 ? 'primeras series con margen' : `${hard} de ${feels.length} primeras series «duras»` });
  }

  if (parts.length === 0) return { score: null, detail: 'Aún sin datos de cómo te están saliendo las sesiones.' };
  return { score: clamp(parts.reduce((s, p) => s + p.score, 0) / parts.length), detail: parts.map((p) => p.text).join(' · ') };
}

export function computeReadinessScore(input: {
  readinessLog: ReadinessCheck[] | undefined;
  history: SessionHistoryEntry[];
  setFeedbackLog: SetFeedbackEntry[] | undefined;
  painFlags: PainFlag[] | undefined;
  today: Date;
}): ReadinessScore {
  const { today } = input;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const checkins = computeRecoverySummary(input.readinessLog, todayIso);
  const feel = feelPart(checkins);
  const load = loadPart(input.history, today, todayIso);
  const performance = performancePart(input.history, input.setFeedbackLog ?? [], todayIso);

  const active = getActivePainFlags(input.painFlags, todayIso);
  const areas = [...new Set(active.map((f) => PAIN_AREA_LABEL[f.area].toLowerCase()))];
  const penalty = Math.min(PAIN_PENALTY_MAX, areas.length * PAIN_PENALTY_EACH);

  const pain = { count: areas.length, areas, penalty };
  const available = (['feel', 'performance'] as const).filter((k) => ({ feel, performance })[k].score !== null);
  if (available.length === 0) {
    return { total: null, level: null, estimated: false, feel, load, loadPenalty: load.penalty, performance, pain, checkins };
  }
  const weightSum = available.reduce((s, k) => s + WEIGHT[k], 0);
  const raw = available.reduce((s, k) => s + ({ feel, performance })[k].score! * WEIGHT[k], 0) / weightSum;
  // La carga no es una parte que se promedie: es un LÍMITE. Una carga alta (o muchos días seguidos sin descansar) resta,
  // y una carga baja u óptima no suma nada — así unos buenos check-ins no pueden tapar que vas pasado de carga.
  const total = clamp(raw - penalty - load.penalty);
  const level: RecoveryLevel = total >= HIGH_FROM ? 'alta' : total <= LOW_UNTIL ? 'baja' : 'normal';
  return { total, level, estimated: feel.score === null, feel, load, loadPenalty: load.penalty, performance, pain, checkins };
}
