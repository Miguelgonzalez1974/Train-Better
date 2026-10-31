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
import type { SessionHistoryEntry } from '../data/athlete/types';
import { dayStrain } from './strain';

export const FITNESS_TAU = 42;
export const FATIGUE_TAU = 7;
/** Cuántos días de historial hacen falta (entre la primera sesión y hoy) para que la curva diga algo. */
export const MIN_SPAN_DAYS = 14;
/** Cuántas sesiones registradas hacen falta como mínimo. */
export const MIN_SESSIONS = 6;
/** Forma relativa (forma / forma física) desde la que se entra en la ventana de supercompensación, y hasta la que se va cargado. */
export const WINDOW_FROM = 0.15;
export const LOADED_UNTIL = -0.25;
/** Carga que se supone a un día de competición en la previsión del plan. */
export const COMPETITION_DAY_LOAD = 80;

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

/** El estado de una forma, relativo a la forma física (un mismo número pesa distinto con 20 de base que con 60). */
export function formStateOf(form: number, fitness: number): FormState {
  const rel = form / Math.max(10, fitness);
  return rel >= WINDOW_FROM ? 'ventana' : rel <= LOADED_UNTIL ? 'cargado' : 'equilibrio';
}

export interface BuildInput {
  history: SessionHistoryEntry[];
  todayIso: string;
  /** Días pasados que se enseñan, contando hoy (por defecto 28). */
  pastDays?: number;
  /** Cargas previstas de los días que vienen, empezando por mañana. */
  future?: number[];
}

/**
 * La serie día a día: de los últimos `pastDays` días (o desde la primera sesión, si es más tarde) a los días de `future`. La forma
 * física y la fatiga arrancan en tu carga media de las dos primeras semanas de datos, así que no hay una subida falsa al principio.
 */
export function buildFormSeries({ history, todayIso, pastDays = 28, future = [] }: BuildInput): FormSeries {
  const byDate = new Map<string, number>();
  for (const e of history) {
    if (e.date > todayIso) continue;
    byDate.set(e.date, Math.max(byDate.get(e.date) ?? 0, dayStrain(e) ?? 0));
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
  for (let i = 0; i < seedDays; i++) seedSum += byDate.get(dayToIso(firstDay + i)) ?? 0;
  const seed = seedSum / Math.max(1, seedDays);
  let fitness = seed;
  let fatigue = seed;
  const dF = Math.exp(-1 / FITNESS_TAU);
  const dG = Math.exp(-1 / FATIGUE_TAU);

  const windowStart = Math.max(firstDay, today - (pastDays - 1));
  const points: FormPoint[] = [];
  for (let day = firstDay; day <= today + future.length; day++) {
    const iso = dayToIso(day);
    const isFuture = day > today;
    const load = isFuture ? Math.max(0, future[day - today - 1] ?? 0) : (byDate.get(iso) ?? 0);
    const form = fitness - fatigue; // al empezar el día
    fitness = fitness * dF + load * (1 - dF);
    fatigue = fatigue * dG + load * (1 - dG);
    if (day >= windowStart) points.push({ iso, load, fitness, fatigue, form, future: isFuture });
  }
  return { points, todayIndex: points.findIndex((p) => p.iso === todayIso), ready: sessions >= MIN_SESSIONS && spanDays >= MIN_SPAN_DAYS, sessions, spanDays };
}

/**
 * La carga que seguirías llevando "sin bajar el ritmo": para cada día que viene, la media de ese mismo día de la semana en las
 * últimas cuatro semanas (así los descansos siguen siendo descansos).
 */
export function steadyLoads(history: SessionHistoryEntry[], todayIso: string, days: number): number[] {
  const byDate = new Map(history.map((e) => [e.date, dayStrain(e) ?? 0]));
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
    if (iso > comp.eventEnd) return Math.round(load * 0.4);
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
/** Hasta cuántos días por delante se mira para decir "tu próxima ventana" sin competición (más allá es solo orientativo). */
const NEAR_DAYS = 14;

const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "6 de noviembre". */
export const longDate = (iso: string) => `${Number(iso.slice(8, 10))} de ${MONTH[Number(iso.slice(5, 7)) - 1]}`;

// ---------------------------------------------------------------------------------------------
// Las ventanas: cuándo se abren (y vuelven a abrirse)
// ---------------------------------------------------------------------------------------------

/** Una ventana de supercompensación: varios días seguidos con la forma por encima del umbral. */
export interface FormWindow {
  start: string;
  end: string;
  days: number;
  /** El día de mejor forma de la ventana y cuánto vale. */
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
      const peak = run.reduce((b, p) => (p.form > b.form ? p : b), run[0]);
      out.push({ start: run[0].iso, end: run[run.length - 1].iso, days: run.length, peakIso: peak.iso, peak: Math.round(peak.form) });
    }
    run = [];
  };
  for (const p of series.points) {
    if (formStateOf(p.form, p.fitness) === 'ventana') run.push(p);
    else flush();
  }
  flush();
  return afterIso ? out.filter((w) => w.end > afterIso) : out;
}

/** El estado de cada día de la serie, por fecha (para pintar el calendario de ventanas). */
export function stateByDay(series: FormSeries): Map<string, FormState> {
  return new Map(series.points.map((p) => [p.iso, formStateOf(p.form, p.fitness)]));
}

// ---------------------------------------------------------------------------------------------
// Lo que se cuenta al atleta
// ---------------------------------------------------------------------------------------------

export interface FormToday {
  state: FormState;
  value: number;
  /** Titular corto ("Ventana abierta"). */
  title: string;
  /** Una frase de coach. */
  sentence: string;
}

const TITLE: Record<FormState, string> = { ventana: 'Ventana abierta', equilibrio: 'En equilibrio', cargado: 'Aún cargado' };
const SENTENCE: Record<FormState, string> = {
  ventana: 'Ventana de supercompensación abierta: buen día para empujar.',
  equilibrio: 'Ni cargado ni fresco: sigue el plan del día.',
  cargado: 'Aún cargado: un día suave y entrarás en la ventana.',
};
export const FORM_STATE_WORD: Record<FormState, string> = { ventana: 'en ventana', equilibrio: 'en equilibrio', cargado: 'aún cargado' };

export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;

/** La forma de hoy; null si no hay datos suficientes (la fila dice cuánto falta). */
export function formToday(series: FormSeries): FormToday | null {
  if (!series.ready || series.todayIndex < 0) return null;
  const p = series.points[series.todayIndex];
  const state = formStateOf(p.form, p.fitness);
  return { state, value: Math.round(p.form), title: TITLE[state], sentence: SENTENCE[state] };
}

/** Lo que falta para tener curva: sesiones y días de historial. */
export function formMissing(series: FormSeries): { sessions: number; days: number } {
  return { sessions: Math.max(0, MIN_SESSIONS - series.sessions), days: Math.max(0, MIN_SPAN_DAYS - series.spanDays) };
}

/** Cómo llegas el primer día de la competición con una serie, si ese día está en la previsión. */
export function atCompetition(series: FormSeries, comp: CompetitionWindow | null): { form: number; state: FormState } | null {
  if (!comp) return null;
  const p = series.points.find((x) => x.iso === comp.eventStart && x.future);
  return p ? { form: Math.round(p.form), state: formStateOf(p.form, p.fitness) } : null;
}

/**
 * La frase de decisión de la ventana, sobre tu plan. Con una competición cerca: cómo llegas el primer día y qué hacer. Sin competición:
 * cuándo se abre tu próxima ventana.
 */
export function formDecision(plan: FormSeries, comp: CompetitionWindow | null, todayIso: string): string {
  const atEvent = atCompetition(plan, comp);
  if (comp && atEvent) {
    const lead = `llegas el ${longDate(comp.eventStart)} con ${signed(atEvent.form)}, ${FORM_STATE_WORD[atEvent.state]}`;
    if (atEvent.state === 'ventana') return `Sigue el plan: ${lead}.`;
    if (atEvent.state === 'cargado') return `Con tu plan ${lead}: no añadas carga extra estos días.`;
    return `Con tu plan ${lead}: respeta el taper y duerme bien.`;
  }
  const near = formWindows(plan, todayIso).find((w) => w.start <= addDays(todayIso, NEAR_DAYS));
  if (near) {
    return near.start <= todayIso
      ? `Tu ventana está abierta hasta el ${longDate(near.end)}: buen momento para empujar.`
      : `Tu próxima ventana va del ${longDate(near.start)} al ${longDate(near.end)}, con hasta ${signed(near.peak)}.`;
  }
  return 'Con tu plan no se abre ninguna ventana en las próximas dos semanas.';
}
/** Qué hacer hoy, en una línea: según cómo estás y, si hay competición, en qué punto de la cuenta atrás. */
export function formAdvice(state: FormState, comp: CompetitionWindow | null, todayIso: string): string {
  if (comp && todayIso >= comp.eventStart && todayIso <= comp.eventEnd) return 'Hoy compites: la forma ya está hecha. Dosifica y disfruta.';
  if (comp && todayIso < comp.eventStart) {
    const toStart = isoToDay(comp.eventStart) - isoToDay(todayIso);
    if (toStart <= 7) return 'Estás en el taper: sin carga extra y a dormir bien. Cada día suave te acerca a tu ventana.';
  }
  if (state === 'ventana') return 'Estás en ventana: si el plan trae una sesión dura, es el momento de apretarla.';
  if (state === 'cargado') return 'Aún cargado: hoy sin carga extra. Mueve lo justo y deja que la fatiga baje.';
  return 'En equilibrio: sigue el plan del día, ni más ni menos.';
}
