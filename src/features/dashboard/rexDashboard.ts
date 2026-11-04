/**
 * Rex en el Dashboard: la lógica pura de qué te dice y qué atajos te ofrece arriba del todo. Lee datos que la app ya calcula
 * (check-in, revisión semanal, nutrición, racha, objetivos, molestias, peso) y devuelve una lista ordenada de sugerencias; el
 * componente enseña la primera que no hayas dejado para luego hoy. Sin React, sin reloj propio y sin almacenamiento: todo entra
 * por parámetros, para poder probarlo.
 */

/** A dónde lleva un atajo. El Dashboard traduce cada destino a abrir una ventana, una pestaña o una pantalla. */
export type RexTarget =
  | 'checkin'
  | 'semana'
  | 'revision-enfasis'
  | 'constancia'
  | 'volumen'
  | 'analisis'
  | 'perfil'
  | 'objetivos'
  | 'nutricion'
  | 'peso'
  | 'forma'
  | 'planificacion'
  /** Volver al día de hoy en el selector de día. */
  | 'hoy';

export type RexBarMood = 'idle' | 'think' | 'happy' | 'lift';

export interface RexAction {
  label: string;
  target: RexTarget;
}

export interface RexSuggestion {
  id: string;
  /** Mayor = antes. */
  priority: number;
  text: string;
  mood: RexBarMood;
  actions: RexAction[];
  /** false: sin «Ahora no» (el comentario del día que se mira no se aparta). */
  dismissible?: boolean;
}

/** El día que se está mirando cuando no es hoy: Rex lo comenta en vez de hablar de hoy. */
export interface RexViewDay {
  iso: string;
  /** Cómo se nombra en una frase: «Ayer» o «El mié 14». */
  label: string;
  trained: boolean;
  /** Se marcó como «Hoy descanso». */
  rested: boolean;
  /** Esfuerzo real de ese día (0-100), null si no entrenó. */
  strain: number | null;
  /** El rango de esfuerzo que tocaba ese día. */
  low: number | null;
  high: number | null;
}

export interface RexContext {
  /** Si se mira un día pasado, Rex solo habla de ese día. */
  viewDay?: RexViewDay | null;
  /** Hora local (0-23). */
  hour: number;
  /** Solo se sugiere sobre hoy: mirando un día pasado el contexto llega con `isToday` a false y Rex se queda en lo tranquilo. */
  isToday: boolean;
  hasCheckIn: boolean;
  trainedToday: boolean;
  /** Hoy hay sesión prevista (no es descanso ni está marcado como descanso). */
  hasSessionToday: boolean;
  restMarked: boolean;
  /** Texto de las fechas de la semana a repasar ("2 nov al 8 nov"), o null si no hay revisión pendiente. */
  weeklyReviewRange: string | null;
  /** Revisión de 4 semanas de lo que prioriza el coach, sin ver ni avisar. */
  emphasisReviewPending: boolean;
  nutritionPercent: number | null;
  /** Días de entreno previstos cumplidos seguidos. */
  streak: number;
  /** Cuántos objetivos van por detrás o les falta un test. */
  goalsBehind: number;
  painLabels: string[];
  /** Días desde el último peso apuntado, o null si nunca se apuntó. */
  daysSinceWeight: number | null;
}

export const GREETING = (hour: number): string => (hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches');

/** "2026-11-02", "2026-11-08" → "2 nov al 8 nov". */
export function weekRangeText(from: string, to: string): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${fmt(from)} al ${fmt(to)}`;
}

const STREAK_MIN = 4;
export const NUTRITION_HOUR = 15;
export const NUTRITION_LOW = 60;
const WEIGHT_STALE_DAYS = 14;

/** Lo que dice Rex cuando no hay nada que sugerir: se queda a disposición con los atajos de siempre. */
export const QUIET_SUGGESTION: RexSuggestion = {
  id: 'quiet',
  priority: 0,
  text: 'Todo en orden por hoy. Aquí estoy si me necesitas.',
  mood: 'idle',
  actions: [
    { label: 'Ver mi constancia', target: 'constancia' },
    { label: 'Volumen por día', target: 'volumen' },
  ],
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Rex comenta el día pasado que se mira: si entrenó, cómo salió el esfuerzo frente al objetivo de ese día; si no, qué hubo. */
export function daySuggestion(day: RexViewDay): RexSuggestion {
  const actions: RexAction[] = [
    { label: 'Volumen por día', target: 'volumen' },
    { label: 'Volver a hoy', target: 'hoy' },
  ];
  const id = `dia-${day.iso}`;
  if (!day.trained) {
    const text = day.rested ? `${day.label} fue de descanso. Recuperar también es entrenar.` : `${day.label} no hay ninguna sesión registrada.`;
    return { id, priority: 100, text, mood: 'idle', actions: [actions[1]], dismissible: false };
  }
  const real = day.strain;
  if (real === null) return { id, priority: 100, text: `${day.label} entrenaste.`, mood: 'happy', actions, dismissible: false };
  if (day.low === null || day.high === null) return { id, priority: 100, text: `${day.label} entrenaste, con un esfuerzo de ${real}.`, mood: 'happy', actions, dismissible: false };
  const range = `${day.low}–${day.high}`;
  if (real > day.high) return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, por encima de tu objetivo (${range}). Un día así pide cuidar el siguiente.`, mood: 'think', actions, dismissible: false };
  if (real < day.low) return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, por debajo de tu objetivo (${range}). Se quedó corto, sin problema.`, mood: 'idle', actions, dismissible: false };
  return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, dentro de tu objetivo (${range}). Justo lo que tocaba.`, mood: 'happy', actions, dismissible: false };
}

/** Todas las sugerencias que tocan ahora, de más a menos importante. Nunca incluye la tranquila (`QUIET_SUGGESTION`). */
export function buildRexSuggestions(ctx: RexContext): RexSuggestion[] {
  if (ctx.viewDay) return [daySuggestion(ctx.viewDay)];
  const out: RexSuggestion[] = [];

  if (ctx.isToday && !ctx.hasCheckIn && ctx.hour < 22) {
    out.push({
      id: 'checkin',
      priority: 100,
      text: `${GREETING(ctx.hour)}. Antes de nada, cuéntame cómo estás: con el check-in ajusto el esfuerzo de hoy.`,
      mood: 'idle',
      actions: [{ label: 'Hacer el check-in', target: 'checkin' }],
    });
  }

  if (ctx.weeklyReviewRange) {
    out.push({
      id: 'semana',
      priority: 90,
      text: `Tu semana pasada (${ctx.weeklyReviewRange}) está lista para repasar. Te la cuento en un minuto.`,
      mood: 'think',
      actions: [{ label: 'Repasar con Rex', target: 'semana' }],
    });
  }

  if (ctx.emphasisReviewPending) {
    out.push({
      id: 'enfasis',
      priority: 80,
      text: 'He revisado lo que he priorizado en tu programación estas cuatro semanas. ¿Lo vemos?',
      mood: 'think',
      actions: [{ label: 'Ver la revisión', target: 'revision-enfasis' }],
    });
  }

  if (ctx.isToday && ctx.trainedToday) {
    out.push({
      id: 'sesion-hecha',
      priority: 70,
      text: 'Sesión hecha, buen trabajo. ¿Quieres ver cómo ha quedado el volumen o cómo estás de forma?',
      mood: 'happy',
      actions: [
        { label: 'Volumen por día', target: 'volumen' },
        { label: 'Tu forma', target: 'forma' },
      ],
    });
  }

  if (ctx.isToday && ctx.nutritionPercent !== null && ctx.hour >= NUTRITION_HOUR && ctx.nutritionPercent < NUTRITION_LOW) {
    out.push({
      id: 'nutricion',
      priority: 65,
      text: `Llevas un ${ctx.nutritionPercent} % de la nutrición de hoy. ¿Lo repasamos?`,
      mood: 'idle',
      actions: [{ label: 'Abrir nutrición', target: 'nutricion' }],
    });
  }

  if (ctx.painLabels.length > 0) {
    const zones = ctx.painLabels.join(' y ');
    out.push({
      id: 'molestia',
      priority: 60,
      text: `Sigues con aviso de molestia en ${zones.toLowerCase()}. Si ha cambiado, díselo a Rex en Planificación.`,
      mood: 'idle',
      actions: [{ label: 'Ir a Planificación', target: 'planificacion' }],
    });
  }

  if (ctx.goalsBehind > 0) {
    out.push({
      id: 'objetivos-atrasados',
      priority: 55,
      text: `${ctx.goalsBehind} ${plural(ctx.goalsBehind, 'objetivo va', 'objetivos van')} por detrás o ${plural(ctx.goalsBehind, 'le falta', 'les faltan')} un test. ¿Lo miramos?`,
      mood: 'think',
      actions: [{ label: 'Ver objetivos', target: 'objetivos' }],
    });
  }

  if (ctx.isToday && ctx.restMarked && !ctx.trainedToday) {
    out.push({
      id: 'descanso',
      priority: 45,
      text: 'Hoy toca descanso. Aprovecha para recuperar: duerme bien y come con ganas.',
      mood: 'idle',
      actions: [{ label: 'Ver mi forma', target: 'forma' }],
    });
  }

  if (ctx.streak >= STREAK_MIN) {
    out.push({
      id: 'racha',
      priority: 50,
      text: `Llevas ${ctx.streak} días de entreno seguidos sin fallar. ¿Quieres ver tu constancia?`,
      mood: 'lift',
      actions: [{ label: 'Ver constancia', target: 'constancia' }],
    });
  }

  if (ctx.daysSinceWeight === null || ctx.daysSinceWeight >= WEIGHT_STALE_DAYS) {
    out.push({
      id: 'peso',
      priority: 35,
      text:
        ctx.daysSinceWeight === null
          ? 'Aún no tengo tu peso: me hace falta para ajustar la nutrición. ¿Lo apuntas?'
          : `Hace ${ctx.daysSinceWeight} días que no apuntas tu peso. ¿Lo anotamos para ajustar la nutrición?`,
      mood: 'idle',
      actions: [{ label: 'Apuntar peso', target: 'peso' }],
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Lo que Rex recuerda en este dispositivo: lo que dejaste para luego (por día) y lo que ya escribió con animación. */
export interface RexMemory {
  /** id de la sugerencia → día en que se dejó para luego. Solo vale ese día. */
  dismissed: Record<string, string>;
  /** `id|día` de las frases ya escritas con animación: no se repiten. */
  typed: string[];
}

export const EMPTY_REX_MEMORY: RexMemory = { dismissed: {}, typed: [] };

const TYPED_LIMIT = 30;

/** Elige la sugerencia a enseñar: la primera no dejada para luego hoy; si no queda ninguna, la tranquila. */
export function pickRexSuggestion(list: RexSuggestion[], memory: RexMemory, todayIso: string): { current: RexSuggestion; waiting: number } {
  const open = list.filter((s) => memory.dismissed[s.id] !== todayIso);
  if (open.length === 0) return { current: QUIET_SUGGESTION, waiting: 0 };
  return { current: open[0], waiting: open.length - 1 };
}

/** Deja una sugerencia para luego (hoy). No muta la memoria. */
export function dismissSuggestion(memory: RexMemory, id: string, todayIso: string): RexMemory {
  if (id === QUIET_SUGGESTION.id) return memory;
  // Lo dejado en otros días ya no sirve: se limpia para que la memoria no crezca.
  const dismissed: Record<string, string> = { [id]: todayIso };
  for (const [k, day] of Object.entries(memory.dismissed)) if (day === todayIso) dismissed[k] = day;
  return { ...memory, dismissed };
}

export function typedKey(id: string, todayIso: string): string {
  return `${id}|${todayIso}`;
}

export function wasTyped(memory: RexMemory, id: string, todayIso: string): boolean {
  return memory.typed.includes(typedKey(id, todayIso));
}

export function withTyped(memory: RexMemory, id: string, todayIso: string): RexMemory {
  const key = typedKey(id, todayIso);
  if (memory.typed.includes(key)) return memory;
  return { ...memory, typed: [...memory.typed, key].slice(-TYPED_LIMIT) };
}

const MEMORY_KEY = 'tb-rex-dashboard-v1';

/** Lee la memoria del dispositivo. Cualquier fallo (sin almacenamiento, datos rotos) devuelve la memoria vacía. */
export function loadRexMemory(storage: Pick<Storage, 'getItem'> | null): RexMemory {
  try {
    const raw = storage?.getItem(MEMORY_KEY);
    if (!raw) return EMPTY_REX_MEMORY;
    const parsed = JSON.parse(raw) as Partial<RexMemory>;
    const dismissed: Record<string, string> = {};
    if (parsed.dismissed && typeof parsed.dismissed === 'object') {
      for (const [k, v] of Object.entries(parsed.dismissed)) if (typeof v === 'string') dismissed[k] = v;
    }
    const typed = Array.isArray(parsed.typed) ? parsed.typed.filter((t): t is string => typeof t === 'string') : [];
    return { dismissed, typed };
  } catch {
    return EMPTY_REX_MEMORY;
  }
}

export function saveRexMemory(storage: Pick<Storage, 'setItem'> | null, memory: RexMemory): void {
  try {
    storage?.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): Rex simplemente no recuerda.
  }
}

/** Los módulos que se abren desde «Más» (los botones que antes vivían sueltos arriba). */
export const REX_MODULES: { target: RexTarget; label: string }[] = [
  { target: 'nutricion', label: 'Nutrición' },
  { target: 'constancia', label: 'Constancia' },
  { target: 'volumen', label: 'Volumen por día' },
  { target: 'analisis', label: 'Análisis' },
  { target: 'forma', label: 'Tu forma' },
  { target: 'perfil', label: 'Mi perfil' },
  { target: 'objetivos', label: 'Objetivos' },
  { target: 'peso', label: 'Peso corporal' },
];
