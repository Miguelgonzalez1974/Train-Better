/**
 * El resumen del coach bajo "Tendencia": un titular y unas líneas con las cifras del periodo (7, 14 o 30 días) y su comparación con el
 * periodo anterior de la misma longitud. Todo son reglas fijas sobre los mismos puntos de la gráfica, sin nada inventado: con poca
 * muestra el coach lo dice en vez de afirmar cosas, y el patrón por día de la semana solo sale si se repite al menos tres veces.
 */
import { dataDays, effortFit, plannedSessions, readinessBand, trendSentence, type TrendPoint } from './weekTrend';

/** Un trozo de texto de una línea: normal, en negrita o una etiqueta de comparación (sube / igual / baja). */
export type SummarySeg = string | { b: string } | { delta: 'up' | 'eq' | 'down'; t: string };

export interface SummaryRow {
  label: string;
  segs: SummarySeg[];
}

export interface TrendSummary {
  headline: string | null;
  rows: SummaryRow[];
  /** Lo que se abre con "Ver más". */
  more: SummaryRow[];
}

export interface SummaryOptions {
  range: number;
  todayIso: string;
  /** Días que faltan para la competición (solo si el día mirado es hoy), o null. */
  competitionDays?: number | null;
}

const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAY_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const dow = (iso: string) => new Date(`${iso}T12:00:00`).getDay();
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((s, v) => s + v, 0) / xs.length);

/** Cuántos días de preparación hacen falta en el periodo anterior para compararse con él. */
const MIN_PREV_READINESS = 3;
/** Con menos días de datos que esto, un mes no tiene muestra para comparar ni buscar patrones. */
const MIN_DAYS_FOR_MONTH = 20;
/** Días con preparación necesarios para hablar de patrones por día de la semana. */
const MIN_DAYS_FOR_PATTERN = 21;

interface Closed {
  trained: TrendPoint[];
  within: TrendPoint[];
  over: TrendPoint[];
  below: TrendPoint[];
}

/** Las sesiones ya cerradas: hoy, si va por debajo, todavía puede cambiar y no se juzga. */
function closedSessions(points: TrendPoint[], todayIso: string): Closed {
  const trained = points.filter((p) => p.strain !== null && p.strain > 0 && p.target && !(p.iso === todayIso && p.strain < p.target.low));
  return {
    trained,
    within: trained.filter((p) => effortFit(p) === 'within'),
    over: trained.filter((p) => effortFit(p) === 'over'),
    below: trained.filter((p) => effortFit(p) === 'below'),
  };
}

function readinessAvg(points: TrendPoint[]): { avg: number | null; n: number } {
  const v = points.filter((p) => p.readiness !== null).map((p) => p.readiness!);
  const m = mean(v);
  return { avg: m === null ? null : Math.round(m), n: v.length };
}

function pluralDays(n: number): string {
  return n === 1 ? '1 día' : `${n} días`;
}

function objectiveRow(c: Closed): SummaryRow {
  if (c.trained.length === 0) return { label: 'Objetivo', segs: ['Sin sesiones en estos días.'] };
  const rest: string[] = [];
  if (c.over.length > 0) rest.push(`${c.over.length} por encima`);
  if (c.below.length > 0) rest.push(`${c.below.length} por debajo`);
  const segs: SummarySeg[] = [{ b: `${c.within.length} de ${c.trained.length}` }, ` ${c.trained.length === 1 ? 'sesión dentro' : 'sesiones dentro'} de tu objetivo`];
  if (rest.length > 0) segs.push(`, ${rest.join(' y ')}`);
  segs.push('.');
  return { label: 'Objetivo', segs };
}

function readinessRow(points: TrendPoint[], prev: TrendPoint[], range: number): SummaryRow | null {
  const cur = readinessAvg(points);
  if (cur.avg === null) return null;
  const segs: SummarySeg[] = ['Media ', { b: `${cur.avg} %` }];
  const before = readinessAvg(prev);
  if (before.avg !== null && before.n >= MIN_PREV_READINESS) {
    const diff = cur.avg - before.avg;
    if (Math.abs(diff) <= 2) segs.push(' ', { delta: 'eq', t: `igual que los ${range} días anteriores` });
    else segs.push(' ', { delta: diff > 0 ? 'up' : 'down', t: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs los ${range} días anteriores` });
  }
  return { label: 'Preparación', segs };
}

/** "Ahora" (7 días): cómo llegas y qué conviene, con la competición por delante si la hay. */
function nowRow(points: TrendPoint[], opts: SummaryOptions): SummaryRow | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const label = last.iso === opts.todayIso ? 'Ahora' : 'Ese día';
  const near = opts.competitionDays != null && opts.competitionDays > 0 && opts.competitionDays <= 10;
  if (near) return { label, segs: ['Fase de afinado: no añadas carga y cuida el sueño.'] };
  if (last.readiness === null) return null;
  const r = Math.round(last.readiness);
  const yesterday = points[points.length - 2];
  const yOver = yesterday ? effortFit(yesterday) === 'over' : false;
  const band = readinessBand(last.readiness);
  if (band === 'low') return { label, segs: [`Llegas justo (${r} de preparación${yOver ? ' después de un día pasado' : ''}): conviene ir suave.`] };
  if (band === 'good') return { label, segs: [`Llegas bien (${r}): hay margen para entrenar fuerte.`] };
  return { label, segs: [`Llegas normal (${r}): sigue el plan.`] };
}

/** "Tendencia" (14 días): hacia dónde va el periodo entre su primera y su segunda mitad. */
function trendRow(points: TrendPoint[], c: Closed): SummaryRow | null {
  if (dataDays(points) < 10) return null;
  const lastThree = c.trained.slice(-3);
  const overLast = lastThree.filter((p) => effortFit(p) === 'over').length;
  if (lastThree.length === 3 && overLast >= 2) return { label: 'Tendencia', segs: [`Te pasas más hacia el final: ${overLast} de las últimas 3 sesiones. Vigílalo.`] };
  const half = Math.floor(points.length / 2);
  const a = readinessAvg(points.slice(0, half));
  const b = readinessAvg(points.slice(half));
  if (a.avg !== null && b.avg !== null && a.n >= 3 && b.n >= 3) {
    if (b.avg - a.avg >= 5) return { label: 'Tendencia', segs: ['Tu preparación sube hacia el final del periodo.'] };
    if (a.avg - b.avg >= 5) return { label: 'Tendencia', segs: ['Tu preparación baja hacia el final del periodo: no estires más el ritmo.'] };
  }
  return { label: 'Tendencia', segs: ['Estable durante todo el periodo.'] };
}

/** "Patrón" (30 días): un día de la semana en que llegas peor, si se repite al menos tres veces. */
function patternRow(points: TrendPoint[]): SummaryRow {
  const known = points.filter((p) => p.readiness !== null);
  if (known.length < MIN_DAYS_FOR_PATTERN) return { label: 'Patrón', segs: ['Aún pocas semanas para ver patrones por día.'] };
  const overall = mean(known.map((p) => p.readiness!))!;
  let best: { day: number; avg: number; below: number; obs: number } | null = null;
  for (let d = 0; d < 7; d++) {
    const obs = known.filter((p) => dow(p.iso) === d);
    if (obs.length < 3) continue;
    const avg = mean(obs.map((p) => p.readiness!))!;
    const below = obs.filter((p) => p.readiness! < overall - 3).length;
    if (avg <= overall - 8 && below >= 3 && below >= Math.ceil(obs.length * 0.7) && (!best || avg < best.avg)) best = { day: d, avg, below, obs: obs.length };
  }
  if (!best) return { label: 'Patrón', segs: ['Sin un patrón claro por día de la semana.'] };
  return { label: 'Patrón', segs: [`Los ${DAY_PLURAL[best.day]} llegas con la preparación más baja (${best.below} de ${best.obs} semanas).`] };
}

function effortRow(c: Closed): SummaryRow | null {
  if (c.trained.length === 0) return null;
  const avg = Math.round(mean(c.trained.map((p) => p.strain!))!);
  const tgt = Math.round(mean(c.trained.map((p) => (p.target!.low + p.target!.high) / 2))!);
  return { label: 'Esfuerzo', segs: ['Medio ', { b: String(avg) }, ` frente a un objetivo medio de ${tgt}.`] };
}

/** A partir de qué diferencia entre lo hecho y lo previsto se cuenta como quedarse por debajo o pasarse (en puntos de esfuerzo). */
const PLAN_GAP = 10;

/** "Previsto": cuántas sesiones cerradas quedaron lejos de lo que el coach esperaba. null con menos de 2 sesiones con previsto. */
function planRow(points: TrendPoint[], todayIso: string): SummaryRow | null {
  const s = plannedSessions(points, todayIso);
  if (s.length < 2) return null;
  const under = s.filter((x) => x.diff <= -PLAN_GAP).length;
  const over = s.filter((x) => x.diff >= PLAN_GAP).length;
  const close = s.length - under - over;
  const avg = Math.round(mean(s.map((x) => x.diff))!);
  if (under === 0 && over === 0) return { label: 'Previsto', segs: [{ b: `${s.length} de ${s.length}` }, ' sesiones a menos de 10 puntos de lo previsto.'] };
  const sessions = s.length;
  const segs: SummarySeg[] =
    over === 0
      ? ['Te quedas por debajo de lo previsto en ', { b: `${under} de ${sessions}` }, ' sesiones']
      : under === 0
        ? ['Te pasas de lo previsto en ', { b: `${over} de ${sessions}` }, ' sesiones']
        : ['Te quedas por debajo en ', { b: String(under) }, ' y te pasas en ', { b: String(over) }, ` de ${sessions} sesiones`];
  segs.push(`. De media ${avg > 0 ? '+' : avg < 0 ? '−' : ''}${Math.abs(avg)} puntos${close > 0 ? `; ${close} ${close === 1 ? 'quedó' : 'quedaron'} dentro de 10` : ''}.`);
  return { label: 'Previsto', segs };
}

/** Una frase para el titular cuando la mayoría de las sesiones se quedan por debajo de lo previsto (y al menos dos); null si no es el caso. */
function planClause(points: TrendPoint[], todayIso: string): string | null {
  const s = plannedSessions(points, todayIso);
  const under = s.filter((x) => x.diff <= -PLAN_GAP);
  if (under.length < 2 || under.length * 2 < s.length) return null;
  const last = under.slice(-2).map((x) => `el ${DAY_NAME[dow(x.iso)]} ${x.real} de ${x.plan}`);
  return `Te quedas por debajo de lo previsto: ${last.join(' y ')}.`;
}

function restRow(points: TrendPoint[]): SummaryRow | null {
  const rest = points.filter((p) => p.strain === 0).length;
  if (rest === 0) return null;
  return { label: 'Descanso', segs: [`${pluralDays(rest)} sin sesión.`] };
}

/** El titular: la frase de la semana, o, con la competición cerca, lo que importa a esas alturas. */
function headlineFor(points: TrendPoint[], c: Closed, opts: SummaryOptions): string | null {
  if (dataDays(points) < 4) return null;
  const d = opts.competitionDays;
  if (opts.range === 7 && d != null && d > 0 && d <= 10) {
    const over = c.over[c.over.length - 1];
    if (over) return `A ${d} días de competir te pasaste del objetivo el ${DAY_NAME[dow(over.iso)]}: ahora importa llegar fresco, no ganar forma.`;
    const { avg } = readinessAvg(points);
    return avg !== null && avg >= 65
      ? `A ${d} días de competir vas bien: mantén la preparación y no añadas carga.`
      : `A ${d} días de competir tu preparación va justa: cuida el sueño y no añadas carga.`;
  }
  return trendSentence(points, opts.todayIso);
}

export function trendSummary(points: TrendPoint[], prev: TrendPoint[], opts: SummaryOptions): TrendSummary {
  const c = closedSessions(points, opts.todayIso);
  const days = dataDays(points);
  const tooShortForMonth = opts.range >= 30 && days < MIN_DAYS_FOR_MONTH;
  if (tooShortForMonth) {
    return {
      headline: `Aún poca muestra para un mes: llevas ${days} días con datos. Con 28 podré compararte con el mes anterior y buscar patrones por día de la semana.`,
      rows: [objectiveRow(c), readinessRow(points, [], opts.range)].filter((r): r is SummaryRow => r !== null),
      more: [],
    };
  }
  const third = opts.range <= 7 ? nowRow(points, opts) : opts.range <= 14 ? trendRow(points, c) : patternRow(points);
  const rows = [objectiveRow(c), readinessRow(points, prev, opts.range), third].filter((r): r is SummaryRow => r !== null);
  const more = [planRow(points, opts.todayIso), effortRow(c), restRow(points)].filter((r): r is SummaryRow => r !== null);
  const headline = headlineFor(points, c, opts);
  // Con la competición cerca el titular ya habla de llegar fresco: no se le añade nada.
  const near = opts.range === 7 && opts.competitionDays != null && opts.competitionDays > 0 && opts.competitionDays <= 10;
  const clause = headline && !near ? planClause(points, opts.todayIso) : null;
  return { headline: clause ? `${headline} ${clause}` : headline, rows, more };
}
