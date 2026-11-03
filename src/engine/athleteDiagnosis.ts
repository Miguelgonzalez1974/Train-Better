import type { AthleteProfile, DiagnosisAreaKey, DiagnosisCheck, PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';
import { computeYearConsistency } from './yearConsistency';
import { wodPerformanceSamples } from './wodTargets';

/**
 * Diagnóstico del atleta: lo que el coach deduce de ti con tus marcas, tus series y tus WODs, por áreas (fuerza, halterofilia,
 * motor, gimnásticos y constancia), con cuántos datos hay detrás de cada conclusión y qué priorizaría. Es PURO: no escribe nada y
 * solo lee. Hoy solo informa; todavía no cambia las sesiones.
 *
 * Reglas que lo sostienen:
 *  - Nada se afirma sin datos reales: una marca que nunca has tocado (el valor de fábrica) no cuenta, y un área con pocos datos dice
 *    qué le falta en lugar de opinar.
 *  - Las referencias no dependen de tu sexo ni de tu edad: la fuerza se compara con lo que tu sentadilla permite, la halterofilia con
 *    las proporciones habituales entre levantamientos y el motor con lo que el coach estimó para cada WOD.
 *  - Un día malo no mueve nada: se usan medianas y hace falta un mínimo de muestras.
 */

export type { DiagnosisAreaKey } from '../data/athlete/types';
export type Tone = 'good' | 'mid' | 'low' | 'none';
export type Confidence = 'sin-datos' | 'provisional' | 'fiable';
export type AreaTrend = 'sube' | 'estable' | 'baja' | 'sin-datos';

export interface DiagnosisRow {
  id: string;
  label: string;
  /** Lo que se enseña a la derecha ("1,7× tu peso", "−12 %", "0,81"). */
  value: string;
  /** Frente a lo esperable: 1 = en lo esperable, menos = por detrás, más = por delante. null si no hay referencia. */
  ratio: number | null;
  tone: Tone;
}

export interface DiagnosisArea {
  key: DiagnosisAreaKey;
  title: string;
  confidence: Confidence;
  trend: AreaTrend;
  tone: Tone;
  /** 0-100 para el radar; null sin datos. La referencia ("lo esperable") cae en `REFERENCE_SCORE`. */
  score: number | null;
  verdict: string;
  rows: DiagnosisRow[];
  /** Cuántos datos hay detrás (series, WODs, sesiones...): con más datos que cuando respondiste "No cuadra", se vuelve a preguntar. */
  samples: number;
  /** Lo que falta para poder opinar, si no hay datos suficientes. */
  need: string | null;
  /** La fila más floja frente a lo esperable: de ella sale qué priorizar. */
  weakest: DiagnosisRow | null;
}

export interface DiagnosisFocus {
  key: DiagnosisAreaKey;
  kind: 'prioridad' | 'mantener';
  action: string;
  why: string;
}

export interface AthleteDiagnosis {
  headline: string;
  confidence: Confidence;
  sessions: number;
  wods: number;
  areas: DiagnosisArea[];
  focus: DiagnosisFocus[];
}

/** Mínimos para opinar y para fiarse. */
const MIN_WOD_SAMPLES = 3;
const MIN_GYM_SESSIONS = 6;
const RELIABLE_WOD_SAMPLES = 8;
/** Con tantos datos nuevos como esto desde que dijiste "No cuadra", se vuelve a preguntar. */
export const REVIEW_STEP = 3;

/** Escala del radar: el ratio 1 ("esperable") cae en `REFERENCE_SCORE`; por debajo de 0,4 es el centro y desde 1,25 el borde. */
const RATIO_MIN = 0.4;
const RATIO_MAX = 1.25;
export const REFERENCE_SCORE = Math.round(((1 - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)) * 100);

const GOOD_AT = 0.93;
const MID_AT = 0.8;
const WINDOW_DAYS = 56;

/** Proporciones de referencia entre levantamientos (las habituales en halterofilia y fuerza; no dependen del sexo). */
const REF = {
  deadliftOverSquat: 1.15,
  benchOverSquat: 0.75,
  pressOverSquat: 0.5,
  snatchOverCj: 0.8,
  cleanOverSquat: 0.78,
  cjOverClean: 0.96,
  /** Un buen atleta hace en Rx más del 70 % de los WODs con gimnásticos. */
  gymRxRate: 0.7,
  /** Asistir a un 85 % de los días previstos es una constancia sólida. */
  consistency: 0.85,
} as const;

const GYM_SKILL_IDS = new Set([
  'strict-pull-up',
  'kipping-pull-up',
  'chest-to-bar-pull-up',
  'butterfly-pull-up',
  'toes-to-bar',
  'knees-to-elbow',
  'handstand-push-up',
  'kipping-hspu',
  'ring-dip',
  'bar-muscle-up',
  'ring-muscle-up',
  'handstand-walk',
  'wall-walk',
  'rope-climb',
]);

const toneOf = (ratio: number): Tone => (ratio >= GOOD_AT ? 'good' : ratio >= MID_AT ? 'mid' : 'low');
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const num1 = (x: number) => x.toFixed(1).replace('.', ',');
const num2 = (x: number) => x.toFixed(2).replace('.', ',');
const pctSigned = (ratio: number) => {
  const p = Math.round((ratio - 1) * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`;
};

/** El ratio del área: mitad media y mitad la fila más floja, para que un punto débil no se diluya entre los buenos. */
function aggregate(rows: DiagnosisRow[]): number | null {
  const ratios = rows.filter((r) => r.ratio !== null).map((r) => r.ratio!);
  if (ratios.length === 0) return null;
  return 0.5 * mean(ratios) + 0.5 * Math.min(...ratios);
}

function scoreOf(rows: DiagnosisRow[]): number | null {
  const a = aggregate(rows);
  if (a === null) return null;
  return Math.round(((clamp(a, RATIO_MIN, RATIO_MAX) - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)) * 100);
}

function areaTone(rows: DiagnosisRow[]): Tone {
  const a = aggregate(rows);
  return a === null ? 'none' : toneOf(a);
}

function weakestOf(rows: DiagnosisRow[]): DiagnosisRow | null {
  const withRatio = rows.filter((r) => r.ratio !== null);
  if (withRatio.length === 0) return null;
  return withRatio.reduce((a, b) => (b.ratio! < a.ratio! ? b : a));
}

function emptyArea(key: DiagnosisAreaKey, title: string, verdict: string, need: string, samples = 0): DiagnosisArea {
  return { key, title, confidence: 'sin-datos', trend: 'sin-datos', tone: 'none', score: null, verdict, rows: [], samples, need, weakest: null };
}

// ---------- Marcas reales ----------

interface RealPrs {
  /** La marca cuenta como real: el atleta la ha puesto o cambiado él, o la ha probado en un test. */
  has: (key: keyof PersonalRecords) => boolean;
  /** Cambios de marca anotados de esas claves (para fiarse y para la tendencia). */
  log: { date: string; key: string; kg: number }[];
  tests: number;
}

function realPrs(profile: AthleteProfile, history: SessionHistoryEntry[]): RealPrs {
  const tested = new Set<string>();
  let tests = 0;
  for (const e of history) {
    if (e.testLoadKg == null) continue;
    tests++;
    for (const id of e.movementIds) {
      if (id.startsWith('benchmark:')) continue;
      const m = getMovementById(id);
      const k = m && (resolveStrengthPRKey(m) ?? resolveOlyPRKey(m));
      if (k) tested.add(k);
    }
  }
  const logged = new Set((profile.prLog ?? []).map((l) => l.key));
  // Con el alta hecha, las marcas las puso el atleta; sin ella, solo cuentan las cambiadas o probadas.
  const onboarded = Boolean(profile.onboardedAt);
  return { has: (key) => onboarded || logged.has(key) || tested.has(key), log: profile.prLog ?? [], tests };
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);
}

/** Tendencia de las marcas de unas claves: si alguna subió o bajó en las últimas 8 semanas; "estable" si hay cambios anteriores pero ninguno reciente. */
function prTrend(log: RealPrs['log'], keys: string[], todayIso: string): AreaTrend {
  const mine = log.filter((l) => keys.includes(l.key)).sort((a, b) => a.date.localeCompare(b.date));
  if (mine.length === 0) return 'sin-datos';
  const last: Record<string, number> = {};
  let up = 0;
  let down = 0;
  for (const l of mine) {
    const prev = last[l.key];
    last[l.key] = l.kg;
    if (prev === undefined || daysBetween(l.date, todayIso) > WINDOW_DAYS) continue;
    if (l.kg > prev) up++;
    else if (l.kg < prev) down++;
  }
  return up > down ? 'sube' : down > up ? 'baja' : mine.length >= 2 ? 'estable' : 'sin-datos';
}

// ---------- Áreas ----------

function strengthArea(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): DiagnosisArea {
  const title = 'Fuerza';
  const real = realPrs(profile, history);
  const { prs } = profile;
  if (!real.has('backSquat') || prs.backSquat <= 0) {
    return emptyArea('fuerza', title, 'Aún sin marcas reales para compararlas.', 'Anota tu sentadilla y tus levantamientos básicos (en Planificación → Tu perfil).');
  }
  const bw = [...(profile.bodyweightLog ?? [])].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg;
  const fmt = (kg: number) => (bw ? `${num1(kg / bw)}× tu peso` : `${Math.round(kg)} kg`);
  const rows: DiagnosisRow[] = [{ id: 'backSquat', label: 'Sentadilla', value: fmt(prs.backSquat), ratio: null, tone: 'none' }];
  const rel: [keyof PersonalRecords, string, number][] = [
    ['deadlift', 'Peso muerto', REF.deadliftOverSquat],
    ['benchPress', 'Press banca', REF.benchOverSquat],
    ['strictPress', 'Press estricto', REF.pressOverSquat],
  ];
  for (const [key, label, ref] of rel) {
    if (!real.has(key) || prs[key] <= 0) continue;
    const ratio = prs[key] / (prs.backSquat * ref);
    rows.push({ id: key, label, value: fmt(prs[key]), ratio, tone: toneOf(ratio) });
  }
  const measured = rows.filter((r) => r.ratio !== null);
  const keys = ['backSquat', 'deadlift', 'benchPress', 'strictPress'];
  const samples = real.log.filter((l) => keys.includes(l.key)).length + real.tests;
  const base = bw ? `Sentadilla ${num1(prs.backSquat / bw)}× tu peso.` : `Sentadilla ${Math.round(prs.backSquat)} kg.`;
  let verdict: string;
  const weakest = weakestOf(rows);
  if (measured.length === 0) verdict = `${base} Faltan marcas reales de peso muerto y press para compararlas.`;
  else if (weakest && weakest.ratio! < GOOD_AT) {
    verdict = `${base} ${weakest.label} va por detrás de lo que tu sentadilla permite (${Math.round(weakest.ratio! * 100)} % de lo esperable).`;
  } else verdict = `${base} Equilibrada: tus levantamientos guardan la proporción esperada con tu sentadilla.`;
  const confidence: Confidence = measured.length >= 2 && samples >= 2 ? 'fiable' : 'provisional';
  return {
    key: 'fuerza',
    title,
    confidence,
    trend: prTrend(real.log, keys, todayIso),
    tone: areaTone(rows),
    score: scoreOf(rows),
    verdict,
    rows,
    samples,
    need: null,
    weakest,
  };
}

function weightliftingArea(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): DiagnosisArea {
  const title = 'Halterofilia';
  const real = realPrs(profile, history);
  const { prs } = profile;
  if (!real.has('snatch') || !real.has('cleanAndJerk') || prs.snatch <= 0 || prs.cleanAndJerk <= 0) {
    return emptyArea('halterofilia', title, 'Aún sin marcas reales de arrancada y dos tiempos.', 'Anota tu arrancada, tu clean y tu clean & jerk.');
  }
  const rows: DiagnosisRow[] = [];
  const sn = prs.snatch / prs.cleanAndJerk;
  rows.push({ id: 'snatch', label: 'Arrancada / C&J', value: num2(sn), ratio: sn / REF.snatchOverCj, tone: toneOf(sn / REF.snatchOverCj) });
  if (real.has('clean') && prs.clean > 0) {
    const jerk = prs.cleanAndJerk / prs.clean;
    rows.push({ id: 'jerk', label: 'C&J / clean', value: num2(jerk), ratio: jerk / REF.cjOverClean, tone: toneOf(jerk / REF.cjOverClean) });
    if (real.has('backSquat') && prs.backSquat > 0) {
      const cl = prs.clean / prs.backSquat;
      rows.push({ id: 'clean', label: 'Clean / sentadilla', value: num2(cl), ratio: cl / REF.cleanOverSquat, tone: toneOf(cl / REF.cleanOverSquat) });
    }
  }
  const keys = ['snatch', 'clean', 'cleanAndJerk'];
  const samples = real.log.filter((l) => keys.includes(l.key)).length + real.tests;
  const weakest = weakestOf(rows);
  const sentence: Record<string, string> = {
    snatch: 'tu arrancada va por detrás de tu dos tiempos: ahí manda la técnica de recibo y la velocidad más que la fuerza.',
    jerk: 'tu dos tiempos queda por debajo de tu clean: el jerk (recepción o empuje) es lo que limita.',
    clean: 'tu clean va por detrás de lo que tu sentadilla permite: hay kilos por ganar en el tirón.',
  };
  const verdict =
    weakest && weakest.ratio! < GOOD_AT
      ? `Con ${num2(sn)} de arrancada sobre dos tiempos, ${sentence[weakest.id]}`
      : `Buena: arrancada ${num2(sn)} de tu dos tiempos${rows.length > 1 ? ' y proporciones normales entre tus levantamientos' : ''}.`;
  return {
    key: 'halterofilia',
    title,
    confidence: rows.length >= 3 && samples >= 2 ? 'fiable' : 'provisional',
    trend: prTrend(real.log, keys, todayIso),
    tone: areaTone(rows),
    score: scoreOf(rows),
    verdict,
    rows,
    samples,
    need: null,
    weakest,
  };
}

const MOTOR_GROUPS: { id: string; label: string; system: NonNullable<SessionHistoryEntry['energySystem']> }[] = [
  { id: 'potencia', label: 'WOD corto', system: 'potencia' },
  { id: 'umbral', label: 'WOD medio', system: 'umbral' },
  { id: 'base-aerobica', label: 'WOD largo', system: 'base-aerobica' },
];

function engineArea(history: SessionHistoryEntry[]): DiagnosisArea {
  const title = 'Motor';
  const samples = wodPerformanceSamples(history);
  if (samples.length < MIN_WOD_SAMPLES) {
    return emptyArea('motor', title, 'Aún pocos WODs puntuados en Rx para medir tu motor.', `Necesito ${MIN_WOD_SAMPLES} WODs con resultado hechos en Rx; llevas ${samples.length}.`, samples.length);
  }
  const rows: DiagnosisRow[] = [];
  for (const g of MOTOR_GROUPS) {
    const mine = samples.filter((s) => s.energySystem === g.system);
    if (mine.length >= 2) {
      const perf = median(mine.map((s) => s.perf));
      rows.push({ id: g.id, label: g.label, value: `${pctSigned(perf)} · ${mine.length}`, ratio: perf, tone: toneOf(perf) });
    }
  }
  if (rows.length === 0) {
    const perf = median(samples.map((s) => s.perf));
    rows.push({ id: 'todos', label: 'Tus WODs', value: `${pctSigned(perf)} · ${samples.length}`, ratio: perf, tone: toneOf(perf) });
  }
  const weakest = weakestOf(rows);
  const verdict =
    weakest && weakest.ratio! < GOOD_AT
      ? rows.length > 1
        ? `Tu punto flojo es el ${weakest.label}: rindes un ${Math.abs(Math.round((weakest.ratio! - 1) * 100))} % por debajo de lo que el coach estimó.`
        : `Rindes un ${Math.abs(Math.round((weakest.ratio! - 1) * 100))} % por debajo de lo que el coach estimó para tus WODs.`
      : 'Rindes en línea con lo que el coach estimó, en todos los formatos que has probado.';
  // Tendencia: la segunda mitad de los WODs frente a la primera.
  let trend: AreaTrend = 'sin-datos';
  if (samples.length >= 4) {
    const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.floor(sorted.length / 2);
    const diff = median(sorted.slice(half).map((s) => s.perf)) - median(sorted.slice(0, half).map((s) => s.perf));
    trend = diff > 0.04 ? 'sube' : diff < -0.04 ? 'baja' : 'estable';
  }
  return {
    key: 'motor',
    title,
    confidence: samples.length >= RELIABLE_WOD_SAMPLES ? 'fiable' : 'provisional',
    trend,
    tone: areaTone(rows),
    score: scoreOf(rows),
    verdict,
    rows,
    samples: samples.length,
    need: null,
    weakest,
  };
}

function gymnasticsArea(history: SessionHistoryEntry[]): DiagnosisArea {
  const title = 'Gimnásticos';
  const sessions = history.filter((e) => e.movementIds.some((id) => GYM_SKILL_IDS.has(id)));
  if (sessions.length < MIN_GYM_SESSIONS) {
    return emptyArea('gimnasticos', title, 'Aún sin conclusión clara.', `Necesito ${MIN_GYM_SESSIONS} sesiones con dominadas, pino o muscle-ups; llevas ${sessions.length}.`, sessions.length);
  }
  const rx = sessions.filter((e) => e.rxOrScaled === 'rx').length / sessions.length;
  const ratio = rx / REF.gymRxRate;
  const rest = history.filter((e) => !e.movementIds.some((id) => GYM_SKILL_IDS.has(id)));
  const rpeGym = mean(sessions.map((e) => e.rpe));
  const rpeRest = rest.length >= 3 ? mean(rest.map((e) => e.rpe)) : null;
  const rows: DiagnosisRow[] = [
    { id: 'rx', label: 'Hechos en Rx', value: `${Math.round(rx * 100)} % · ${sessions.length}`, ratio, tone: toneOf(ratio) },
  ];
  if (rpeRest !== null) rows.push({ id: 'rpe', label: 'Esfuerzo vs el resto', value: `${rpeGym - rpeRest >= 0 ? '+' : '−'}${Math.abs(rpeGym - rpeRest).toFixed(1).replace('.', ',')} RPE`, ratio: null, tone: 'none' });
  const scaled = sessions.length - Math.round(rx * sessions.length);
  const verdict =
    rx < 0.5
      ? `Los escalas en ${scaled} de ${sessions.length} sesiones: es donde más margen tienes.`
      : rx < 0.8
        ? `Los haces en Rx ${Math.round(rx * 100)} % de las veces; ${scaled} de ${sessions.length} los escalaste.`
        : `Los haces casi siempre como está escrito (${Math.round(rx * 100)} % en Rx): sólido.`;
  let trend: AreaTrend = 'sin-datos';
  if (sessions.length >= 8) {
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.floor(sorted.length / 2);
    const r = (xs: SessionHistoryEntry[]) => xs.filter((e) => e.rxOrScaled === 'rx').length / xs.length;
    const diff = r(sorted.slice(half)) - r(sorted.slice(0, half));
    trend = diff > 0.15 ? 'sube' : diff < -0.15 ? 'baja' : 'estable';
  }
  return {
    key: 'gimnasticos',
    title,
    confidence: sessions.length >= 10 ? 'fiable' : 'provisional',
    trend,
    tone: toneOf(ratio),
    score: scoreOf(rows),
    verdict,
    rows,
    samples: sessions.length,
    need: null,
    weakest: rows[0],
  };
}

function consistencyArea(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): DiagnosisArea {
  const title = 'Constancia';
  const y = computeYearConsistency(profile, history, today);
  if (y.pct === null || y.planned < 5 || y.days === 0) {
    return emptyArea('constancia', title, 'Aún pocos días para medir tu constancia.', `Necesito 5 días de entreno previstos; llevas ${y.planned}.`, y.planned);
  }
  const ratio = y.pct / 100 / REF.consistency;
  const rows: DiagnosisRow[] = [{ id: 'dias', label: 'Días entrenados', value: `${y.days}/${y.planned}`, ratio, tone: toneOf(ratio) }];
  const verdict =
    ratio >= GOOD_AT
      ? `Muy constante: has entrenado ${y.days} de ${y.planned} días previstos.`
      : ratio >= MID_AT
        ? `Bastante constante (${y.pct} %). Un día suelto sin entrenar no cambia nada.`
        : `Entrenas ${y.days} de ${y.planned} días previstos, menos de los que programas. Es solo un dato: saltarte un día no cambia nada.`;
  return {
    key: 'constancia',
    title,
    confidence: y.planned >= 14 ? 'fiable' : 'provisional',
    trend: 'sin-datos',
    tone: toneOf(ratio),
    score: scoreOf(rows),
    verdict,
    rows,
    samples: y.planned,
    need: null,
    weakest: rows[0],
  };
}

// ---------- Qué priorizaría ----------

const ACTION: Record<string, string> = {
  deadlift: 'Más bisagra de cadera y tirón (peso muerto)',
  benchPress: 'Más empuje horizontal (press banca)',
  strictPress: 'Más empuje vertical (press estricto)',
  snatch: 'Más técnica y velocidad de arrancada',
  jerk: 'Más trabajo de jerk',
  clean: 'Más fuerza de tirón para el clean',
  potencia: 'Más potencia y WODs cortos',
  umbral: 'Más trabajo a umbral (WODs de 8 a 15 minutos)',
  'base-aerobica': 'Más trabajo aeróbico y WODs largos',
  todos: 'Más trabajo de acondicionamiento',
  rx: 'Más gimnásticos de base (progresiones y volumen técnico)',
};

const MANTENER: Record<DiagnosisAreaKey, string> = {
  fuerza: 'Mantener la fuerza como está',
  halterofilia: 'Mantener la halterofilia, sin subir más volumen',
  motor: 'Mantener el motor como está',
  gimnasticos: 'Mantener los gimnásticos como están',
  constancia: 'Mantener el ritmo de entrenos',
};

function whyOf(area: DiagnosisArea, row: DiagnosisRow): string {
  switch (area.key) {
    case 'motor':
      return `${row.label}: ${row.value.split(' · ')[0]} frente a lo estimado, la mayor diferencia con tu fuerza.`;
    case 'fuerza':
      return `${row.label} está al ${Math.round(row.ratio! * 100)} % de lo que tu sentadilla permite.`;
    case 'halterofilia':
      return `${row.label}: ${row.value}, por debajo de la proporción habitual.`;
    case 'gimnasticos':
      return `Solo ${row.value.split(' % ')[0]} % de tus sesiones con gimnásticos van en Rx.`;
    default:
      return area.verdict;
  }
}

/** Estado de lo que el atleta dijo de un área: null si no ha dicho nada; "revisar" si hay datos nuevos desde que dijo "No cuadra". */
export function checkState(area: DiagnosisArea, check: DiagnosisCheck | undefined): 'cuadra' | 'no-cuadra' | 'revisar' | null {
  if (!check) return null;
  if (check.verdict === 'cuadra') return 'cuadra';
  return area.samples >= check.samples + REVIEW_STEP ? 'revisar' : 'no-cuadra';
}

function buildFocus(areas: DiagnosisArea[], checks: AthleteProfile['diagnosisChecks']): DiagnosisFocus[] {
  const measured = areas.filter((a) => a.score !== null && checkState(a, checks?.[a.key]) !== 'no-cuadra');
  // Lo que el atleta dijo que no cuadra no se prioriza hasta que haya datos nuevos.
  const training = measured.filter((a) => a.key !== 'constancia');
  const weakOnes = training
    .filter((a) => (a.tone === 'low' || a.tone === 'mid') && a.weakest)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 2);
  const priority = (a: DiagnosisArea): DiagnosisFocus => ({ key: a.key, kind: 'prioridad', action: ACTION[a.weakest!.id] ?? `Reforzar ${a.title.toLowerCase()}`, why: whyOf(a, a.weakest!) });
  const out: DiagnosisFocus[] = weakOnes.map(priority);
  const best = training.filter((a) => a.tone === 'good' && !weakOnes.includes(a)).sort((a, b) => b.score! - a.score!)[0];
  if (best && out.length < 3) out.push({ key: best.key, kind: 'mantener', action: MANTENER[best.key], why: best.verdict });
  return out;
}

// ---------- El diagnóstico entero ----------

const STRONG_PHRASE: Record<DiagnosisAreaKey, string> = {
  fuerza: 'Eres un atleta de fuerza',
  halterofilia: 'Lo más sólido en ti es la halterofilia',
  motor: 'Lo más sólido en ti es el motor',
  gimnasticos: 'Lo más sólido en ti son los gimnásticos',
  constancia: 'Lo más sólido en ti es la constancia',
};

const MARGIN_PHRASE: Record<DiagnosisAreaKey, string> = {
  fuerza: 'tu fuerza',
  halterofilia: 'tu halterofilia',
  motor: 'tu motor',
  gimnasticos: 'tu técnica gimnástica',
  constancia: 'tu constancia',
};

function headlineFor(areas: DiagnosisArea[], confidence: Confidence): string {
  const scored = areas.filter((a) => a.score !== null && a.key !== 'constancia');
  if (scored.length === 0) return 'Aún no tengo datos suficientes para describirte: necesito marcas reales y algunas sesiones con resultado.';
  if (scored.length === 1) return `De momento solo puedo decir algo de ${scored[0].title.toLowerCase()}: ${scored[0].verdict}`;
  const best = scored.reduce((a, b) => (b.score! > a.score! ? b : a));
  const worst = scored.reduce((a, b) => (b.score! < a.score! ? b : a));
  const tail = confidence !== 'fiable' ? ' Es una primera lectura, con pocos datos.' : '';
  if (best.score! - worst.score! < 10) return `Estás equilibrado: ninguna zona destaca claramente por detrás de las demás.${tail}`;
  return `${STRONG_PHRASE[best.key]}. Lo que más margen tiene es ${MARGIN_PHRASE[worst.key]}.${tail}`;
}

export function computeAthleteDiagnosis(input: { profile: AthleteProfile; history: SessionHistoryEntry[]; today?: Date }): AthleteDiagnosis {
  const { profile, history } = input;
  const today = input.today ?? new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const areas = [
    strengthArea(profile, history, todayIso),
    weightliftingArea(profile, history, todayIso),
    engineArea(history),
    gymnasticsArea(history),
    consistencyArea(profile, history, today),
  ];
  const sessions = history.length;
  const confidence: Confidence = sessions >= 20 ? 'fiable' : sessions >= 8 ? 'provisional' : 'sin-datos';
  return {
    headline: headlineFor(areas, confidence),
    confidence,
    sessions,
    wods: wodPerformanceSamples(history).length,
    areas,
    focus: buildFocus(areas, profile.diagnosisChecks),
  };
}
