import type { ReadinessCheck } from '../data/athlete/types';

/**
 * HRV de la mañana (rMSSD en ms, p. ej. el de HRV4Training con la cámara del móvil) y pulso en reposo, leídos como se hace
 * en ese método: no importa el número de un día (la cámara tiene ruido) sino dónde cae frente a TU rango normal. El rango se
 * calcula con tus mediciones de los últimos 60 días en escala logarítmica (media ± 0,75 desviaciones) y se compara con la
 * media de tus últimos 7 días. Hasta reunir `HRV_NEEDED` mediciones el coach no lo usa: solo las guarda y te dice cuántas llevas.
 */

export const HRV_MIN_RMSSD = 15;
export const HRV_MAX_RMSSD = 250;
export const HR_MIN = 30;
export const HR_MAX = 150;

/** Mediciones (sin contar hoy) que hacen falta para tener un rango normal fiable. */
export const HRV_NEEDED = 14;
const HRV_WINDOW_DAYS = 60;
const HRV_BAND_SD = 0.75;
/** Desviación mínima (en logaritmo) para que un rango con mediciones casi idénticas no quede absurdamente estrecho. */
const HRV_MIN_SD = 0.03;
/** Mediciones en los últimos 7 días que hacen falta para hablar de su media. */
const HRV_WEEK_MIN = 3;

const HR_BASELINE_DAYS = 14;
const HR_BASELINE_MIN = 3;
/** Pulso por encima de tu media a partir del cual resta a la nota (ppm). */
const HR_HIGH_DELTA = 5;
const HR_VERY_HIGH_DELTA = 8;

/** La nota de 0 a 10 que enseña HRV4Training: dos veces el logaritmo natural del rMSSD (64 ms → 8,3). */
export function hrvScore(rmssd: number): number {
  return Math.round(Math.log(rmssd) * 20) / 10;
}

export type HrvVs = 'bajo' | 'normal' | 'alto';

export interface HrvStatus {
  /** `sin-datos`: ninguna medición; `reuniendo`: aún no hay para el rango; `listo`: ya hay rango normal. */
  state: 'sin-datos' | 'reuniendo' | 'listo';
  /** Mediciones (con la de hoy) dentro de la ventana de 60 días. El rango sale de las de antes de hoy: hacen falta `needed`. */
  n: number;
  needed: number;
  /** La medición de hoy (si la hay) y dónde cae frente a tu rango. */
  today: { rmssd: number; score: number; vs: HrvVs | null } | null;
  /** Media de los últimos 7 días (con hoy) y dónde cae frente a tu rango. */
  week: { avg: number; n: number; vs: HrvVs | null } | null;
  /** Tu rango normal en ms (null hasta tener `needed` mediciones). */
  range: { low: number; high: number } | null;
  /** Pulso de hoy, tu media de 14 días y la diferencia (null si falta alguno). */
  hr: { today: number | null; baseline: number | null; delta: number | null };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function vsRange(value: number, range: { low: number; high: number } | null): HrvVs | null {
  if (!range) return null;
  return value < range.low ? 'bajo' : value > range.high ? 'alto' : 'normal';
}

/** Tu pulso en reposo medio de las últimas dos semanas (sin contar hoy); null si hay menos de 3 mediciones. */
export function restingHrBaseline(log: ReadinessCheck[] | undefined, todayIso: string): number | null {
  const fromIso = isoMinus(todayIso, HR_BASELINE_DAYS);
  const values = (log ?? []).filter((c) => c.restingHr !== undefined && c.date >= fromIso && c.date < todayIso).map((c) => c.restingHr as number);
  if (values.length < HR_BASELINE_MIN) return null;
  return Math.round(mean(values));
}

/** Dónde está tu HRV y tu pulso de hoy frente a tu rango y tu media, con lo que haya en el registro hasta `todayIso`. */
export function computeHrvStatus(log: ReadinessCheck[] | undefined, todayIso: string): HrvStatus {
  const entries = (log ?? []).filter((c) => c.date <= todayIso);
  const withHrv = entries.filter((c) => c.hrv !== undefined && c.hrv > 0);
  const todayCheck = entries.find((c) => c.date === todayIso);

  const windowFrom = isoMinus(todayIso, HRV_WINDOW_DAYS);
  const baseline = withHrv.filter((c) => c.date >= windowFrom && c.date < todayIso).map((c) => Math.log(c.hrv as number));
  let range: HrvStatus['range'] = null;
  if (baseline.length >= HRV_NEEDED) {
    const mu = mean(baseline);
    const sd = Math.max(HRV_MIN_SD, Math.sqrt(mean(baseline.map((v) => (v - mu) ** 2))));
    range = { low: Math.round(Math.exp(mu - HRV_BAND_SD * sd)), high: Math.round(Math.exp(mu + HRV_BAND_SD * sd)) };
  }

  const todayRmssd = todayCheck?.hrv;
  const today = todayRmssd !== undefined ? { rmssd: todayRmssd, score: hrvScore(todayRmssd), vs: vsRange(todayRmssd, range) } : null;

  const weekFrom = isoMinus(todayIso, 6);
  const weekValues = withHrv.filter((c) => c.date >= weekFrom).map((c) => Math.log(c.hrv as number));
  const weekAvg = weekValues.length >= HRV_WEEK_MIN ? Math.round(Math.exp(mean(weekValues))) : null;
  const week = weekAvg !== null ? { avg: weekAvg, n: weekValues.length, vs: vsRange(weekAvg, range) } : null;

  const hrToday = todayCheck?.restingHr ?? null;
  const hrBase = restingHrBaseline(log, todayIso);
  const hr = { today: hrToday, baseline: hrBase, delta: hrToday !== null && hrBase !== null ? hrToday - hrBase : null };

  const state: HrvStatus['state'] = range ? 'listo' : withHrv.length > 0 ? 'reuniendo' : 'sin-datos';
  const n = withHrv.filter((c) => c.date >= windowFrom).length;
  return { state, n, needed: HRV_NEEDED, today, week, range, hr };
}

/** El `hrvVs` que se guarda en el check-in: la media de 7 días frente a tu rango si la hay, y si no la medición de hoy. */
export function hrvVsOf(status: HrvStatus): HrvVs | undefined {
  if (status.state !== 'listo') return undefined;
  return status.week?.vs ?? status.today?.vs ?? undefined;
}

export interface HrvPart {
  /** Puntos que HRV y pulso restan a la nota de preparación (0 hasta tener rango). */
  penalty: number;
  hrvPenalty: number;
  hrPenalty: number;
  status: HrvStatus;
  /** Una línea con el porqué ("" si no hay ninguna medición). */
  detail: string;
}

const HRV_PENALTY_WEEK = 6;
const HRV_PENALTY_TODAY_EXTRA = 2;
const HRV_PENALTY_TODAY_ONLY = 3;
const HRV_PENALTY_MAX = 10;

/**
 * Lo que HRV y pulso restan a la nota de hoy (nunca suman: un HRV alto no significa estar mejor). Con la media de 7 días por
 * debajo de tu rango resta 6, y 2 más si hoy también cae por debajo; una medición baja suelta, con la semana normal, resta 3.
 * El pulso 5 ppm por encima de tu media resta 2, y 8 o más, 3 (tiene su propia media de 14 días, con 3 mediciones). Tope 10.
 * Sin rango de HRV, la HRV no resta nada.
 */
export function computeHrvPart(log: ReadinessCheck[] | undefined, todayIso: string): HrvPart {
  const status = computeHrvStatus(log, todayIso);
  // El pulso tiene su propia media (3 mediciones), así que resta aunque la HRV aún esté reuniendo datos.
  const delta = status.hr.delta;
  const hrPenalty = delta !== null && delta >= HR_VERY_HIGH_DELTA ? 3 : delta !== null && delta >= HR_HIGH_DELTA ? 2 : 0;
  const pulse = status.hr.today !== null ? `pulso ${status.hr.today}${status.hr.baseline !== null ? ` (tu media ${status.hr.baseline})` : ''}` : null;

  if (status.state !== 'listo') {
    const parts: string[] = [];
    if (status.state === 'reuniendo') {
      parts.push(status.n >= status.needed ? 'Mañana ya tendrás tu rango normal de HRV' : `Llevas ${status.n} de ${status.needed} mediciones para calcular tu rango normal de HRV`);
    }
    if (pulse) parts.push(pulse.charAt(0).toUpperCase() + pulse.slice(1));
    return { penalty: hrPenalty, hrvPenalty: 0, hrPenalty, status, detail: parts.length > 0 ? `${parts.join(' · ')}.` : '' };
  }

  let hrvPenalty = 0;
  if (status.week?.vs === 'bajo') hrvPenalty = HRV_PENALTY_WEEK + (status.today?.vs === 'bajo' ? HRV_PENALTY_TODAY_EXTRA : 0);
  else if (status.today?.vs === 'bajo') hrvPenalty = HRV_PENALTY_TODAY_ONLY;
  const penalty = Math.min(HRV_PENALTY_MAX, hrvPenalty + hrPenalty);

  const range = status.range!;
  const parts: string[] = [];
  if (status.today) parts.push(`HRV ${status.today.rmssd} ms (${VS_WORD[status.today.vs ?? 'normal']})`);
  if (status.week) parts.push(`media de 7 días ${status.week.avg} ms`);
  parts.push(`rango normal ${range.low}–${range.high} ms`);
  if (pulse) parts.push(pulse);
  return { penalty, hrvPenalty, hrPenalty, status, detail: `${parts.join(' · ')}.` };
}

export const VS_WORD: Record<HrvVs, string> = { bajo: 'por debajo de tu rango', normal: 'dentro de tu rango', alto: 'por encima de tu rango' };
