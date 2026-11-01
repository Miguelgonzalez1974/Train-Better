/**
 * La curva de forma (supercompensación): cómo se cruzan lo que has construido y lo que llevas encima.
 *
 * Es el modelo clásico de fitness-fatiga (Banister; en el entrenamiento por carga, CTL / ATL / TSB). Cada día aporta una carga (aquí, el
 * esfuerzo del día en la escala 0-100 de la app) y esa carga alimenta dos cosas a la vez:
 *   - la FORMA FÍSICA, que sube despacio y se va despacio (constante de 42 días);
 *   - la FATIGA, que sube deprisa y se va deprisa (constante de 7 días).
 * Tu FORMA de hoy es la diferencia: forma física menos fatiga, medida al EMPEZAR el día (antes de sumar su carga). Con carga creciente la
 * fatiga adelanta a la forma física y la forma es negativa (vas cargado); cuando bajas la carga la fatiga cae antes y la forma sube por
 * encima de cero: esa es la ventana de supercompensación, el momento de rendir más.
 *
 * Es una ESTIMACIÓN a partir de tus sesiones, no una medición: los tiempos son los típicos, no los tuyos, y el check-in de cada mañana
 * (la preparación) manda sobre ella. Por eso se enseña como orientación y con la previsión punteada.
 */
import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { formatSleep } from './habits';
import { effectiveLoad } from './sessionCost';
import { dayStrain } from './strain';

export const FITNESS_TAU = 42;
export const FATIGUE_TAU = 7;
/** Cuántos días de historial hacen falta (entre la primera sesión y hoy) para que la curva diga algo. */
export const MIN_SPAN_DAYS = 14;
/** Cuántas sesiones registradas hacen falta como mínimo. */
export const MIN_SESSIONS = 6;
/**
 * La ENERGÍA: tu forma pasada a una escala de 0 a 100, que es como se cuenta al atleta (una batería: llena es ir a tope). Se calcula
 * sobre la forma relativa (forma / forma física: un mismo número pesa distinto con 20 de base que con 60): 50 es la mitad de la batería,
 * sin ventaja ni lastre, y cada 10 % de forma relativa mueve la energía unos 17 puntos. Entrenando siempre igual, la energía oscila
 * entre unos 30 y 70 según el día de la semana (nunca "a tope" ni "cansado"): a tope solo llega al bajar la carga unos días, y el
 * 100 % exige una forma un 30 % por encima de tu forma física, algo raro (tras una semana de descarga larga).
 */
export const ENERGY_BASE = 50;
export const ENERGY_SCALE = 500 / 3;
/** Desde esta energía se está a tope (en ventana de supercompensación), y hasta esta, cansado. */
export const ENERGY_TOP = 75;
export const ENERGY_LOW = 25;
/** Carga que se supone a un día de competición en la previsión del plan. */
export const COMPETITION_DAY_LOAD = 80;
/** Días de recuperación tras la competición, con la carga recortada, antes de volver al ritmo normal. */
export const POST_COMPETITION_DAYS = 3;

export type FormState = 'ventana' | 'equilibrio' | 'cargado';

export interface FormPoint {
  iso: string;
  /** Carga del día (esfuerzo 0-100); en un día futuro, la prevista. */
  load: number;
  fitness: number;
  fatigue: number;
  /** Forma al empezar el día: forma física menos fatiga, sin la carga de ese día. */
  form: number;
  future: boolean;
  /** Lo que suma (o resta) a la energía el sueño de esa noche y las dos anteriores, en puntos (0 sin check-in; los días futuros no tienen). */
  sleep?: number;
  /** Media de horas dormidas y noches que entran en ella (solo los días con check-in). */
  sleepAvg?: number;
  sleepNights?: number;
  /** La energía (0-100) que tendría ese día con la carga pura (RPE × duración), sin el coste real de las sesiones. */
  energyNoCost?: number;
}

export interface FormSeries {
  points: FormPoint[];
  todayIndex: number;
  /** ¿Hay datos suficientes para fiarse de la curva? */
  ready: boolean;
  /** Sesiones registradas y días entre la primera y hoy (para decir cuánto falta). */
  sessions: number;
  spanDays: number;
}

const DAY_MS = 86_400_000;
const isoToDay = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / DAY_MS);
function dayToIso(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const addDays = (iso: string, delta: number) => dayToIso(isoToDay(iso) + delta);

/** La energía (0-100) de una forma. */
export function energyOf(form: number, fitness: number): number {
  const rel = form / Math.max(10, fitness);
  return Math.max(0, Math.min(100, Math.round(ENERGY_BASE + rel * ENERGY_SCALE)));
}

const stateOfEnergy = (energy: number): FormState => (energy >= ENERGY_TOP ? 'ventana' : energy <= ENERGY_LOW ? 'cargado' : 'equilibrio');

/** El estado de un día según la energía de su carga: a tope (ventana), cansado (cargado) o normal (equilibrio). */
export function formStateOf(form: number, fitness: number): FormState {
  return stateOfEnergy(energyOf(form, fitness));
}

// ---------------------------------------------------------------------------------------------
// El sueño
// ---------------------------------------------------------------------------------------------

/** Las horas de sueño que ni suman ni restan: por encima recargas de más, por debajo debes sueño. */
export const SLEEP_NEUTRAL_HOURS = 7.5;
/** Puntos de energía por hora de más o de menos sobre esa referencia. */
export const SLEEP_POINTS_PER_HOUR = 8;
/** Dormir de sobra suma poco (no se acumula energía infinita); dormir poco puede restar bastante. */
export const SLEEP_MAX_BONUS = 8;
export const SLEEP_MAX_PENALTY = 15;
/** Cuánto pesa cada noche: la de hoy más, y las dos anteriores un poco (la deuda de sueño se acumula). */
const NIGHT_WEIGHTS = [0.5, 0.3, 0.2];
/** Si el check-in no lleva las horas, lo que se supone para cada respuesta de sueño. */
const AXIS_HOURS: Record<ReadinessCheck['sleep'], number> = { bien: 8, regular: 6.75, mal: 5.5 };

export interface SleepReading {
  /** Lo que suma (o resta) a la energía de ese día, en puntos. */
  points: number;
  /** Media (ponderada) de las horas dormidas en las noches que se conocen. */
  avgHours: number;
  /** Cuántas noches (1-3) entran en la media. */
  nights: number;
}

/** Las horas de una noche: las anotadas o, si no, las que sugiere la respuesta de sueño del check-in. */
export const nightHours = (check: ReadinessCheck): number => check.sleepHours ?? AXIS_HOURS[check.sleep];

/**
 * Cuánto suma (o resta) el sueño a la energía de un día: la media ponderada de las horas de esa noche y las dos anteriores frente a 7 h 30,
 * a 8 puntos por hora, de −15 a +8. Solo hay lectura si ese día tienes check-in (la noche de hoy es la que manda). Las horas vienen del
 * check-in: lo de cómo te sientes (agujetas, estrés, ánimo) no entra, es de la Preparación.
 */
export function sleepAdjust(checkByDate: Map<string, ReadinessCheck>, iso: string): SleepReading | null {
  const today = checkByDate.get(iso);
  if (!today) return null;
  let weight = 0;
  let hours = 0;
  let nights = 0;
  NIGHT_WEIGHTS.forEach((w, back) => {
    const check = back === 0 ? today : checkByDate.get(addDays(iso, -back));
    if (!check) return;
    weight += w;
    hours += w * nightHours(check);
    nights++;
  });
  const avgHours = hours / weight;
  const raw = (avgHours - SLEEP_NEUTRAL_HOURS) * SLEEP_POINTS_PER_HOUR;
  // Redondeo simétrico: +7,5 y −7,5 valen lo mismo (Math.round tiraría el negativo hacia arriba).
  const points = Math.max(-SLEEP_MAX_PENALTY, Math.min(SLEEP_MAX_BONUS, Math.sign(raw) * Math.round(Math.abs(raw))));
  return { points, avgHours, nights };
}

/** "7 h 30 de media" o, con una sola noche, "7 h 30 esta noche". */
export function sleepSummary(r: SleepReading): string {
  return r.nights === 1 ? `${formatSleep(r.avgHours)} esta noche` : `${formatSleep(r.avgHours)} de media en ${r.nights} noches`;
}

/** La energía de un día: la de su carga (con el coste real de las sesiones) más lo que suma o resta su sueño (0-100). */
export function pointEnergy(p: Pick<FormPoint, 'form' | 'fitness' | 'sleep'>): number {
  return Math.max(0, Math.min(100, energyOf(p.form, p.fitness) + (p.sleep ?? 0)));
}

/** El estado de un día con su sueño incluido. */
export function pointState(p: Pick<FormPoint, 'form' | 'fitness' | 'sleep'>): FormState {
  return stateOfEnergy(pointEnergy(p));
}

export interface BuildInput {
  history: SessionHistoryEntry[];
  todayIso: string;
  /** Días pasados que se enseñan, contando hoy (por defecto 28). */
  pastDays?: number;
  /** Cargas previstas de los días que vienen, empezando por mañana. */
  future?: number[];
  /** Los check-ins de la mañana: de ellos salen las horas de sueño que suman o restan a la energía de cada día (ver `sleepAdjust`). */
  checks?: ReadinessCheck[];
}

/**
 * La serie día a día: de los últimos `pastDays` días (o desde la primera sesión, si es más tarde) a los días de `future`. La forma
 * física y la fatiga arrancan en tu carga media de las dos primeras semanas de datos, así que no hay una subida falsa al principio.
 * La carga de cada sesión incluye su coste real (`effectiveLoad`); en paralelo se calcula la carga "pura" (RPE × duración) para poder
 * decir cuánto le suma o resta el coste real a la energía de cada día (`energyNoCost`).
 */
export function buildFormSeries({ history, todayIso, pastDays = 28, future = [], checks = [] }: BuildInput): FormSeries {
  const checkByDate = new Map(checks.map((c) => [c.date, c]));
  const byDate = new Map<string, number>();
  const rawByDate = new Map<string, number>();
  for (const e of history) {
    if (e.date > todayIso) continue;
    byDate.set(e.date, Math.max(byDate.get(e.date) ?? 0, effectiveLoad(e)));
    rawByDate.set(e.date, Math.max(rawByDate.get(e.date) ?? 0, dayStrain(e) ?? 0));
  }
  const dates = [...byDate.keys()].sort();
  const sessions = dates.length;
  if (sessions === 0) return { points: [], todayIndex: -1, ready: false, sessions: 0, spanDays: 0 };
  const first = dates[0];
  const today = isoToDay(todayIso);
  const spanDays = today - isoToDay(first);

  // Arranque: la carga media de los primeros 14 días de datos (con los descansos dentro).
  const firstDay = isoToDay(first);
  const seedDays = Math.min(14, spanDays + 1);
  let seedSum = 0;
  let rawSeedSum = 0;
  for (let i = 0; i < seedDays; i++) {
    seedSum += byDate.get(dayToIso(firstDay + i)) ?? 0;
    rawSeedSum += rawByDate.get(dayToIso(firstDay + i)) ?? 0;
  }
  let fitness = seedSum / Math.max(1, seedDays);
  let fatigue = fitness;
  let rawFitness = rawSeedSum / Math.max(1, seedDays);
  let rawFatigue = rawFitness;
  const dF = Math.exp(-1 / FITNESS_TAU);
  const dG = Math.exp(-1 / FATIGUE_TAU);

  const windowStart = Math.max(firstDay, today - (pastDays - 1));
  const points: FormPoint[] = [];
  for (let day = firstDay; day <= today + future.length; day++) {
    const iso = dayToIso(day);
    const isFuture = day > today;
    const futureLoad = isFuture ? Math.max(0, future[day - today - 1] ?? 0) : 0;
    const load = isFuture ? futureLoad : (byDate.get(iso) ?? 0);
    const rawLoad = isFuture ? futureLoad : (rawByDate.get(iso) ?? 0);
    const form = fitness - fatigue; // al empezar el día
    const rawForm = rawFitness - rawFatigue;
    if (day >= windowStart) {
      const reading = isFuture ? null : sleepAdjust(checkByDate, iso);
      points.push({
        iso,
        load,
        fitness,
        fatigue,
        form,
        future: isFuture,
        energyNoCost: energyOf(rawForm, rawFitness),
        ...(reading ? { sleep: reading.points, sleepAvg: reading.avgHours, sleepNights: reading.nights } : { sleep: 0 }),
      });
    }
    fitness = fitness * dF + load * (1 - dF);
    fatigue = fatigue * dG + load * (1 - dG);
    rawFitness = rawFitness * dF + rawLoad * (1 - dF);
    rawFatigue = rawFatigue * dG + rawLoad * (1 - dG);
  }
  return { points, todayIndex: points.findIndex((p) => p.iso === todayIso), ready: sessions >= MIN_SESSIONS && spanDays >= MIN_SPAN_DAYS, sessions, spanDays };
}

/**
 * La carga que seguirías llevando "sin bajar el ritmo": para cada día que viene, la media de ese mismo día de la semana en las
 * últimas cuatro semanas (así los descansos siguen siendo descansos).
 */
export function steadyLoads(history: SessionHistoryEntry[], todayIso: string, days: number): number[] {
  const byDate = new Map(history.map((e) => [e.date, effectiveLoad(e)]));
  return Array.from({ length: days }, (_, i) => {
    const target = isoToDay(todayIso) + i + 1;
    const same: number[] = [];
    for (let w = 1; w <= 4; w++) same.push(byDate.get(dayToIso(target - 7 * w)) ?? 0);
    return Math.round(same.reduce((s, v) => s + v, 0) / same.length);
  });
}

export interface CompetitionWindow {
  eventStart: string;
  eventEnd: string;
}

/**
 * La carga que traería tu plan: tu ritmo de siempre, recortado por la cuenta atrás de la competición (pico: casi igual; taper: el
 * volumen del taper; activación y víspera: casi nada; después: recuperación). `taperScale` es el volumen del taper elegido (0,5-0,65).
 */
export function planLoads(steady: number[], todayIso: string, comp: CompetitionWindow | null, taperScale = 0.6): number[] {
  if (!comp) return steady;
  return steady.map((load, i) => {
    const iso = addDays(todayIso, i + 1);
    if (iso >= comp.eventStart && iso <= comp.eventEnd) return COMPETITION_DAY_LOAD;
    // Tras la competición, tres días de recuperación y se vuelve al ritmo normal (no todos los días siguientes).
    if (iso > comp.eventEnd) return isoToDay(iso) - isoToDay(comp.eventEnd) <= POST_COMPETITION_DAYS ? Math.round(load * 0.4) : load;
    const toStart = isoToDay(comp.eventStart) - isoToDay(iso);
    if (toStart === 1) return Math.round(load * 0.15);
    if (toStart === 2) return Math.round(load * 0.4);
    if (toStart >= 3 && toStart <= 7) return Math.round(load * taperScale);
    if (toStart >= 8 && toStart <= 14) return Math.round(load * 0.95);
    return load;
  });
}

/** Cuántos días por delante se calculan (cinco semanas: lo que enseña el calendario de ventanas). */
export const FORECAST_DAYS = 35;
// ---------------------------------------------------------------------------------------------
// Las ventanas: cuándo se abren (y vuelven a abrirse)
// ---------------------------------------------------------------------------------------------

/** Una ventana de supercompensación: varios días seguidos con la forma por encima del umbral. */
export interface FormWindow {
  start: string;
  end: string;
  days: number;
  /** El día de mejor forma de la ventana y su energía (0-100) ese día. */
  peakIso: string;
  peak: number;
}

/** Días seguidos que hacen falta para llamarlo ventana: un solo día suelto (un descanso suelto) no lo es. */
export const MIN_WINDOW_DAYS = 2;
/** Una ventana dura como mucho una semana: si la carga se queda baja más tiempo, ya no se supercompensa, se pierde forma. */
export const MAX_WINDOW_DAYS = 7;

/**
 * Las ventanas de la serie, de más antigua a más nueva. Una ventana es una racha de al menos `MIN_WINDOW_DAYS` días (y como mucho
 * `MAX_WINDOW_DAYS`, contados desde que se abre) con la forma por encima del umbral (ver `formStateOf`); cada vez que bajas la carga
 * unos días puede abrirse una, y con la carga siempre alta no se abre ninguna. `afterIso` deja solo las que acaban después de esa
 * fecha; `keepIso` conserva la ventana que contiene ese día aunque sea de un solo día (el primer día de una competición).
 */
export function formWindows(series: FormSeries, afterIso?: string, keepIso?: string): FormWindow[] {
  const out: FormWindow[] = [];
  let run: FormPoint[] = [];
  const flush = () => {
    const keep = keepIso !== undefined && run.some((p) => p.iso === keepIso);
    if (run.length > MAX_WINDOW_DAYS) run = run.slice(0, MAX_WINDOW_DAYS);
    if (run.length >= MIN_WINDOW_DAYS || (keep && run.length > 0)) {
      const peak = run.reduce((b, p) => (pointEnergy(p) > pointEnergy(b) ? p : b), run[0]);
      out.push({ start: run[0].iso, end: run[run.length - 1].iso, days: run.length, peakIso: peak.iso, peak: pointEnergy(peak) });
    }
    run = [];
  };
  for (const p of series.points) {
    if (pointState(p) === 'ventana') run.push(p);
    else flush();
  }
  flush();
  return afterIso ? out.filter((w) => w.end > afterIso) : out;
}

// ---------------------------------------------------------------------------------------------
// Lo que se cuenta al atleta
// ---------------------------------------------------------------------------------------------

export interface FormToday {
  state: FormState;
  /** La energía de hoy (0-100). */
  value: number;
  /** Titular corto ("A tope"). */
  title: string;
  /** Una frase de coach. */
  sentence: string;
}

const TITLE: Record<FormState, string> = { ventana: 'A tope', equilibrio: 'Normal', cargado: 'Cansado' };
const SENTENCE: Record<FormState, string> = {
  ventana: 'Estás a tope: buen día para empujar.',
  equilibrio: 'Ni a tope ni cansado: sigue el plan del día.',
  cargado: 'Estás cansado: un día suave y recuperas energía.',
};
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;

/** La energía de hoy; null si no hay datos suficientes (la fila dice cuánto falta). */
export function formToday(series: FormSeries): FormToday | null {
  if (!series.ready || series.todayIndex < 0) return null;
  const p = series.points[series.todayIndex];
  const state = pointState(p);
  return { state, value: pointEnergy(p), title: TITLE[state], sentence: SENTENCE[state] };
}

/** Lo que falta para tener curva: sesiones y días de historial. */
export function formMissing(series: FormSeries): { sessions: number; days: number } {
  return { sessions: Math.max(0, MIN_SESSIONS - series.sessions), days: Math.max(0, MIN_SPAN_DAYS - series.spanDays) };
}

/** Qué hacer hoy, en una línea: según cómo estás y, si hay competición, en qué punto de la cuenta atrás. */
export function formAdvice(state: FormState, comp: CompetitionWindow | null, todayIso: string): string {
  if (comp && todayIso >= comp.eventStart && todayIso <= comp.eventEnd) return 'Hoy compites: la forma ya está hecha. Dosifica y disfruta.';
  if (comp && todayIso < comp.eventStart) {
    const toStart = isoToDay(comp.eventStart) - isoToDay(todayIso);
    if (toStart <= 7) return 'Estás en el taper: sin carga extra y a dormir bien. Cada día suave recarga tu batería.';
  }
  if (state === 'ventana') return 'Estás a tope: si el plan trae una sesión dura, es el momento de apretarla.';
  if (state === 'cargado') return 'Estás cansado: hoy sin carga extra. Mueve lo justo y deja que la fatiga baje.';
  return 'Energía normal: sigue el plan del día, ni más ni menos.';
}
