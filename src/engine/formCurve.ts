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
export const WINDOW_FROM = 0.1;
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

/** "Sin bajar el ritmo" también compite el día de la competición. */
export function steadyWithCompetition(steady: number[], todayIso: string, comp: CompetitionWindow | null): number[] {
  if (!comp) return steady;
  return steady.map((l, i) => {
    const iso = addDays(todayIso, i + 1);
    return iso >= comp.eventStart && iso <= comp.eventEnd ? COMPETITION_DAY_LOAD : l;
  });
}

/** Cuántos días enseñar hacia delante: hasta un par de días después de la competición si está cerca, y 10 en otro caso. */
export function projectionDays(todayIso: string, comp: CompetitionWindow | null): number {
  if (!comp) return 10;
  const toEnd = isoToDay(comp.eventEnd) - isoToDay(todayIso);
  return toEnd >= 0 && toEnd <= 21 ? toEnd + 2 : 10;
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

const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const longDate = (iso: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));

/**
 * La frase de la curva: con la competición cerca, cómo llegarías el primer día; si no, cuándo es tu mejor momento de los próximos
 * días. `scenario`: 'plan' (lo que tienes programado) o 'steady' (sin bajar el ritmo).
 */
export function formSentence(series: FormSeries, scenario: 'plan' | 'steady', comp: CompetitionWindow | null): string {
  const future = series.points.filter((p) => p.future);
  if (future.length === 0) return formToday(series)?.sentence ?? '';
  const lead = scenario === 'plan' ? 'Con tu plan' : 'Si no bajas el ritmo';
  if (comp) {
    const day = series.points.find((p) => p.iso === comp.eventStart && p.future);
    if (day) {
      const state = formStateOf(day.form, day.fitness);
      const when = `el ${longDate(comp.eventStart)}`;
      if (state === 'ventana') return `${lead} llegarías ${when} con una forma de ${signed(day.form)}: entrarías en la ventana de supercompensación justo el día de competir.`;
      if (state === 'equilibrio') return `${lead} llegarías ${when} en equilibrio (forma ${signed(day.form)}): ni cargado ni en tu mejor punto.`;
      return `${lead} llegarías ${when} con una forma de ${signed(day.form)}: todavía cargado. Conviene bajar la carga antes.`;
    }
  }
  const best = future.reduce((b, p) => (p.form > b.form ? p : b), future[0]);
  const state = formStateOf(best.form, best.fitness);
  if (state === 'ventana') return `${lead} tu forma sube a ${signed(best.form)} el ${DAY_NAME[new Date(`${best.iso}T12:00:00`).getDay()]}: ese será tu mejor momento para empujar.`;
  if (state === 'cargado') return `${lead} sigues cargado los próximos días (forma ${signed(best.form)} como mucho): conviene aflojar para entrar en la ventana.`;
  return `${lead} tu forma se mantiene en equilibrio los próximos días.`;
}
