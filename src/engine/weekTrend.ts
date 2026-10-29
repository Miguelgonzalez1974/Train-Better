/**
 * La tendencia de esfuerzo y preparación de los últimos días (la gráfica de "Tu semana" del Dashboard): el esfuerzo de cada día
 * frente a su objetivo y la preparación con la que se llegó. Aquí viven las cuentas (zonas, tramos de los histogramas y la frase
 * que resume la semana) para que la pantalla solo dibuje.
 */

export interface TrendPoint {
  iso: string;
  /** Esfuerzo real (0-100). 0 = día sin sesión (descanso); null = aún sin datos (hoy antes de entrenar, o antes de usar la app). */
  strain: number | null;
  /** Objetivo de ese día, si se fijó. */
  target: { low: number; high: number } | null;
  /** Preparación de esa mañana (0-100), o null si no se pudo calcular. */
  readiness: number | null;
  /** Solo hoy, si aún no has entrenado: el esfuerzo que cuesta la sesión prevista. */
  planned: number | null;
}

export type ReadinessBand = 'good' | 'mid' | 'low';

/** Mismos cortes que el color de la preparación en toda la app: con ganas desde 65, cansancio hasta 40. */
export function readinessBand(r: number): ReadinessBand {
  return r >= 65 ? 'good' : r <= 40 ? 'low' : 'mid';
}

export type EffortFit = 'rest' | 'below' | 'within' | 'over' | 'unknown';

export function effortFit(p: Pick<TrendPoint, 'strain' | 'target'>): EffortFit {
  if (p.strain === null) return 'unknown';
  if (p.strain <= 0) return 'rest';
  if (!p.target) return 'unknown';
  return p.strain > p.target.high ? 'over' : p.strain < p.target.low ? 'below' : 'within';
}

/** Días con algún dato real (sesión o preparación): sin al menos 4 la gráfica no dice nada. */
export const MIN_TREND_DAYS = 4;
/** Con 7 o más días con datos los dos histogramas ya cuentan algo. */
export const MIN_HISTOGRAM_DAYS = 7;

export function dataDays(points: TrendPoint[]): number {
  return points.filter((p) => (p.strain !== null && p.strain > 0) || p.readiness !== null).length;
}

export interface TrendBins {
  /** Días con sesión por debajo / dentro / por encima de su objetivo. */
  effort: [number, number, number];
  /** Días de preparación en cansancio / normal / con ganas. */
  readiness: [number, number, number];
}

/** `todayIso`: hoy el día no ha terminado, así que un esfuerzo bajo todavía no cuenta como "debajo" (puede que aún falte sesión). */
export function trendBins(points: TrendPoint[], todayIso?: string): TrendBins {
  const effort: [number, number, number] = [0, 0, 0];
  const readiness: [number, number, number] = [0, 0, 0];
  for (const p of points) {
    const fit = effortFit(p);
    if (fit === 'below' && p.iso !== todayIso) effort[0]++;
    else if (fit === 'within') effort[1]++;
    else if (fit === 'over') effort[2]++;
    if (p.readiness !== null) {
      const band = readinessBand(p.readiness);
      readiness[band === 'low' ? 0 : band === 'mid' ? 1 : 2]++;
    }
  }
  return { effort, readiness };
}
const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function dayWord(iso: string, long: boolean): string {
  const name = DAY_NAME[new Date(`${iso}T12:00:00`).getDay()];
  return long ? `el ${name} ${Number(iso.slice(8, 10))}` : `el ${name}`;
}

/**
 * Una frase que lee la semana: dónde empujaste de más con poca preparación, si te quedaste corto con el cuerpo listo, o que vas
 * acompasado. null si hay pocos datos. Hoy (`todayIso`) no se juzga por debajo: el día no ha terminado.
 */
export function trendSentence(points: TrendPoint[], todayIso?: string): string | null {
  if (dataDays(points) < MIN_TREND_DAYS) return null;
  const long = points.length > 7;
  const trained = points.filter((p) => p.strain !== null && p.strain > 0 && p.target);
  const over = trained.filter((p) => p.strain! > p.target!.high);
  // Te pasaste con el cuerpo sin ganas: lo que de verdad cuesta recuperar.
  const rough = over.filter((p) => p.readiness !== null && readinessBand(p.readiness) !== 'good');
  if (rough.length === 1) {
    const p = rough[0];
    return `Te pasaste del objetivo ${dayWord(p.iso, long)} con la preparación en ${Math.round(p.readiness!)}: es el tipo de día que cuesta recuperar.`;
  }
  if (rough.length > 1) {
    const last = rough[rough.length - 1];
    return `Te pasaste del objetivo ${rough.length} días con la preparación justa, el último ${dayWord(last.iso, long)}. Conviene dejar un día suave.`;
  }
  if (over.length >= 2) return `Te pasaste del objetivo ${over.length} días, siempre llegando bien. Mientras la preparación aguante, adelante.`;

  const known = points.filter((p) => p.readiness !== null).map((p) => p.readiness!);
  const avg = known.length > 0 ? Math.round(known.reduce((s, v) => s + v, 0) / known.length) : null;
  if (trained.length === 0) return avg !== null ? `Sin sesiones en estos días. Tu preparación media es ${avg} %.` : 'Sin sesiones en estos días.';
  const good = avg !== null && avg >= 65;
  const tired = avg !== null && avg <= 40;

  // Solo los días ya cerrados: hoy, si va por debajo, aún puede cambiar.
  const closed = trained.filter((p) => !(p.iso === todayIso && p.strain! < p.target!.low));
  if (closed.length === 0) return 'Hoy llevas poco esfuerzo, pero el día no ha terminado.';
  const below = closed.filter((p) => p.strain! < p.target!.low);
  const within = closed.length - below.length - over.length;
  if (below.length > 0) {
    const days = below.length === 1 ? 'un día' : `${below.length} días`;
    if (below.length > within) {
      if (good) return `Te quedaste por debajo del objetivo ${days}: con tan buena preparación hay margen para apretar un poco más.`;
      if (tired) return `Te quedaste por debajo del objetivo ${days}, lo normal con la preparación justa.`;
      return `Te quedaste por debajo del objetivo ${days}.`;
    }
    const who = below.length === 1 ? `${dayWord(below[0].iso, long)}, que quedó por debajo` : `${days} por debajo`;
    return `Esfuerzo dentro de tu objetivo salvo ${who}${good ? ': había margen para más.' : '.'}`;
  }
  if (good) return 'Esfuerzo dentro de tu objetivo y buena preparación: así se gana forma.';
  if (tired) return 'Esfuerzo dentro de tu objetivo, pero llegas justo de preparación: cuida el sueño y el descanso.';
  return 'Esfuerzo dentro de tu objetivo y preparación normal: una semana equilibrada.';
}