import type { DailySession } from '../data/athlete/types';

/**
 * Dureza de la sesión: el coach programa, pero si te ves bien puedes subirla («+1» o «+2») aunque la competición esté cerca; el coach
 * avisa de lo que pasa y tú decides. Aquí viven las reglas (cuándo se ofrece, qué cambia según la fase y qué dice el aviso); el
 * motor las aplica en `generateSession` y la pantalla enseña el efecto con el esfuerzo previsto.
 */

export type HardnessLevel = 0 | 1 | 2;

/**
 * Qué significa subir la dureza: lejos de la competición y fuera de la descarga, MÁS VOLUMEN (series y rondas); con una competición cerca
 * (pico, taper) o en la semana de descarga, MÁS INTENSIDAD con el mismo volumen (algo más de carga): ahí el volumen extra se paga el día D.
 */
export type HardnessMode = 'volume' | 'intensity';

export function hardnessMode(input: { competition: boolean; week: number }): HardnessMode {
  return input.competition || input.week === 4 ? 'intensity' : 'volume';
}

/** Cuánto sube cada nivel. */
export const HARDNESS_WOD_VOLUME: Record<HardnessLevel, number> = { 0: 1, 1: 1.12, 2: 1.25 };
/** Factor sobre la dosis de series (fuerza y accesorio): «una serie más» y «dos series más» para unas 4 series. */
export const HARDNESS_SETS: Record<HardnessLevel, number> = { 0: 1, 1: 1.25, 2: 1.5 };
/** Series extra de la parte olímpica (series rectas y complejo). */
export const HARDNESS_OLY_SETS: Record<HardnessLevel, number> = { 0: 0, 1: 1, 2: 2 };
/** Más intensidad: factor sobre las cargas de fuerza, oly y WOD. */
export const HARDNESS_LOAD: Record<HardnessLevel, number> = { 0: 1, 1: 1.025, 2: 1.05 };

/** Lo que el nivel añade al RPE esperado en el cálculo del esfuerzo previsto (más intensidad pesa más que más volumen). */
export const HARDNESS_RPE_BUMP: Record<HardnessMode, number> = { volume: 0.15, intensity: 0.35 };

/**
 * ¿Se ofrece «más dura» en esta sesión? No en un día de descanso, en una sesión propia, el día de un test de máximos ni en los días
 * que ya son cortos y técnicos por la competición (activación y simulacro), ni la víspera o el propio día; tampoco con el semáforo en
 * rojo (la sesión ya es de recuperación) ni si el día ya está registrado.
 */
export function hardnessAvailable(session: Pick<DailySession, 'isRestDay' | 'source' | 'blocks' | 'competition' | 'dayLight'>): boolean {
  if (session.isRestDay || session.source === 'custom' || session.blocks.length === 0) return false;
  if (session.dayLight?.color === 'rojo') return false;
  const phase = session.competition?.phase;
  if (phase === 'vispera' || phase === 'evento' || phase === 'activacion' || phase === 'post') return false;
  if (session.competition?.simulacro || session.competition?.eventDay) return false;
  if (session.blocks.some((b) => b.format === 'Test 1RM')) return false;
  return true;
}

export type HardnessSituation = 'normal' | 'ambar' | 'pico' | 'taper' | 'descarga';

export interface HardnessContext {
  light: 'verde' | 'ambar' | null;
  /** Fase de la competición de hoy, si hay una cerca. */
  phase: NonNullable<DailySession['competition']>['phase'] | null;
  daysToEvent: number | null;
  /** Semana de descarga del bloque. */
  deload: boolean;
}

export function hardnessSituation(ctx: HardnessContext): HardnessSituation {
  if (ctx.phase === 'taper') return 'taper';
  if (ctx.phase === 'pico' || ctx.phase === 'pico-1') return 'pico';
  if (ctx.deload) return 'descarga';
  if (ctx.light === 'ambar') return 'ambar';
  return 'normal';
}

export interface HardnessAdvice {
  tone: 'good' | 'warn' | 'strong';
  title: string;
  text: string;
  /** Pide un paso más de confirmación antes de aplicar. */
  confirm: boolean;
  /** Lo que el coach sabe de ti para esta situación y nivel (ver `hardnessLearning.ts`), si ya hay datos. */
  personal?: string;
}

/** Lo que ha aprendido el coach de cómo aguantas este nivel en esta situación (ver `personalHardnessNote`). */
export interface HardnessPersonal {
  tier: 'aguanta' | 'regular' | 'paga';
  line: string;
}

/**
 * Lo que dice el coach al elegir un nivel. `fit` es dónde cae el esfuerzo previsto con ese nivel frente al objetivo de hoy
 * (`se-pasa` si lo supera con margen). Siempre es un aviso, nunca un bloqueo.
 */
export function hardnessAdvice(level: HardnessLevel, ctx: HardnessContext, fit: 'dentro' | 'se-pasa' | 'se-queda-corta', personal?: HardnessPersonal | null): HardnessAdvice {
  const base = generalAdvice(level, ctx, fit);
  if (level === 0 || !personal) return base;
  // Lo que sabe de ti manda sobre el aviso general: si lo pagas, el aviso sube de tono y pide confirmación; si lo aguantas, lo dice.
  const tone: HardnessAdvice['tone'] = personal.tier === 'paga' ? 'strong' : base.tone;
  // Techo personal: si el +2 te ha salido caro, el coach lo desaconseja aunque la regla general lo permitiera.
  const title = personal.tier === 'paga' && level === 2 ? 'Mejor no' : base.title;
  return { ...base, title, tone, confirm: base.confirm || personal.tier === 'paga', personal: personal.line };
}

function generalAdvice(level: HardnessLevel, ctx: HardnessContext, fit: 'dentro' | 'se-pasa' | 'se-queda-corta'): HardnessAdvice {
  if (level === 0) return { tone: 'good', title: 'Como te lo programó el coach', text: 'Es lo que tiene calculado para hoy con tu preparación.', confirm: false };
  const s = hardnessSituation(ctx);
  const days = ctx.daysToEvent;
  switch (s) {
    case 'taper':
      return level === 2
        ? { tone: 'strong', title: 'Mejor no', text: `A ${days} ${days === 1 ? 'día' : 'días'} de competir, +5 % de carga no te hace más fuerte para el día D y sí más cansado.`, confirm: true }
        : { tone: 'strong', title: 'Estás en el taper', text: 'Llevas días bajando el volumen para llegar fresco. Subir la dureza ahora resta frescura el día D. Puedes hacerlo, pero la recomendación es no tocar nada.', confirm: true };
    case 'pico':
      return level === 2
        ? { tone: 'strong', title: 'Cuidado: +5 % en pico', text: 'Es la parte más fuerte del bloque. Hazlo solo si tus últimas sesiones te han salido sobradas.', confirm: true }
        : { tone: 'warn', title: `Quedan ${days} días para competir`, text: 'Aquí «más dura» es más calidad, no más cantidad: mismas series y rondas, algo más de carga. El volumen extra se paga el día D.', confirm: true };
    case 'ambar':
      return level === 2
        ? { tone: 'strong', title: 'No te lo recomiendo', text: 'Con ámbar y +2 acumulas fatiga y te pasas de tu objetivo. El coach lo permite, pero pide confirmación.', confirm: true }
        : { tone: 'warn', title: 'Hoy llegas justo', text: 'Tu preparación está por debajo de lo normal. Más volumen hoy no te hará más fuerte, solo más cansado. Si aun así lo ves claro, hazlo con +1.', confirm: true };
    case 'descarga':
      return { tone: 'warn', title: 'Es semana de descarga', text: 'Estás descargando a propósito. Subes algo la carga, sin más volumen: así mantienes la sensación sin romper la recuperación.', confirm: true };
    default:
      if (fit === 'se-pasa') return { tone: 'warn', title: 'Te pasas de tu objetivo', text: 'Con este nivel el esfuerzo supera lo que te tocaba hoy. Si te encuentras muy bien, adelante; si no, mejor un nivel menos.', confirm: false };
      return { tone: 'good', title: 'Hay margen', text: 'Llegas bien y el día no es de los duros: puedes apretar un poco más.', confirm: false };
  }
}

/** Lo que cambia en cada bloque con un nivel, para enseñarlo antes de aceptar (los mismos textos que el motor aplica). */
export function hardnessChanges(level: 1 | 2, mode: HardnessMode): { label: string; text: string }[] {
  if (mode === 'intensity') {
    const pct = level === 1 ? '2,5' : '5';
    return [
      { label: 'Fuerza', text: `mismas series, +${pct} % de carga` },
      { label: 'Oly', text: `mismas series, +${pct} % de carga` },
      { label: 'WOD', text: `mismo volumen, cargas +${pct} % y más ritmo` },
      { label: 'Accesorio', text: 'sin cambio' },
    ];
  }
  return [
    { label: 'WOD', text: level === 1 ? 'algo más de volumen (una ronda más)' : 'bastante más volumen (dos rondas más)' },
    { label: 'Fuerza', text: level === 1 ? 'una serie más' : 'dos series más' },
    { label: 'Oly', text: level === 1 ? 'una serie más del levantamiento o del complejo' : 'dos series más del levantamiento o del complejo' },
    { label: 'Accesorio', text: level === 1 ? 'una serie más en cada ejercicio' : 'más series en cada ejercicio' },
  ];
}
