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
  /** La ficha donde el coach propone mover un día de la semana (según tu curva de forma). */
  | 'semana-mover'
  | 'revision-enfasis'
  | 'constancia'
  | 'volumen'
  | 'analisis'
  | 'perfil'
  | 'objetivos'
  | 'nutricion'
  | 'peso'
  | 'forma'
  /** La pestaña Preparación del Dashboard. */
  | 'preparacion'
  | 'planificacion'
  /** Volver al día de hoy en el selector de día. */
  | 'hoy'
  /** Marcar hoy como descanso, o deshacerlo. */
  | 'descanso'
  /** El balance del día cerrado (previsto frente a hecho). */
  | 'detalle-dia'
  /** Planificación: el detalle del estado del día, la hoja de dureza, el aviso de molestia y los avisos del coach. */
  | 'plan-detalle'
  | 'plan-dureza'
  | 'plan-molestia'
  | 'plan-avisos'
  /** Planificación: abrir el resumen de la sesión completada, y el chat «¿Cambiar algo?». */
  | 'plan-resumen'
  /** Planificación: volver a apuntar los datos de una sesión ya completada (borra el registro de hoy y abre el cierre). */
  | 'plan-corregir'
  | 'plan-cambiar'
  /** Planificación: empezar la sesión (modo enfocado) y terminar la edición de la sesión. */
  | 'plan-empezar'
  | 'plan-terminar'
  /** Planificación: ir a la tarjeta del programa de fuerza que convive con el macro. */
  | 'plan-programa'
  /** La rutina de movilidad y estiramientos con Rex. */
  | 'movilidad'
  /** Nutrición: ir a la caja «He comido…». Objetivos: hablar con Rex (el asistente). */
  | 'nutri-comido'
  | 'objetivos-hablar'
  /** Cerrar la competición que acaba de pasar con Rex (en Objetivos) y montar el camino a la siguiente. */
  | 'competicion-cierre'
  /** Confirmar la fecha de una competición provisional con Rex (en Objetivos). */
  | 'competicion-fecha'
  /** Ir a una pestaña de la app (desde RexLab de cualquier pantalla). */
  | 'ir-dashboard'
  | 'ir-planificacion'
  | 'ir-nutricion'
  | 'ir-objetivos'
  /** La pantalla «Mis marcas» (en el Dashboard), y la misma desde otra pantalla: va al Dashboard y la abre. */
  | 'marcas'
  | 'ir-marcas'

export type RexBarMood = 'idle' | 'think' | 'happy' | 'lift';

export interface RexAction {
  label: string;
  target: RexTarget;
  /** Si lleva, en la respuesta de RexLab el botón no se va a ningún sitio: hace esa pregunta ahí mismo. */
  ask?: string;
}

export interface RexSuggestion {
  id: string;
  /** Mayor = antes. */
  priority: number;
  /** La frase entera. Si lleva `lead`, empieza por él. */
  text: string;
  /** El arranque de la frase (el verbo del consejo), que se pinta en el color de su tono. */
  lead?: string;
  tone?: 'good' | 'mid' | 'bad' | 'info' | 'gold';
  mood: RexBarMood;
  actions: RexAction[];
  /** false: sin «Ahora no» (el consejo y el comentario del día no se apartan). */
  dismissible?: boolean;
}

/** El consejo del día tal como lo calcula `dayAdvice`, más si la sesión se pasa del objetivo. */
export interface RexAdvice {
  lead: string;
  reason: string;
  tone: 'good' | 'mid' | 'bad' | 'info' | 'gold';
  /** La sesión prevista se pasa del objetivo de esfuerzo: el atajo principal es ajustarla. */
  overTarget: boolean;
}

/** El día de hoy ya entrenado: cómo salió el esfuerzo frente al objetivo. */
export interface RexClosing {
  real: number;
  low: number;
  high: number;
  /** Esfuerzo previsto anotado antes de entrenar; null si no se anotó. */
  planned: number | null;
  status: 'por-debajo' | 'dentro' | 'pasado' | 'sin-entrenar';
  /** Lo que no se hizo de la sesión ("Sin el WOD, por la molestia."). */
  notDone: string | null;
  /** Hay balance (previsto frente a hecho) para abrir. */
  hasDetail: boolean;
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
  /** Se puede marcar hoy como descanso (o deshacerlo): hay sesión que descansar y aún no se entrenó. */
  canRest?: boolean;
  /** El consejo de hoy (solo antes de entrenar). Rex lo dice como frase principal. */
  advice?: RexAdvice | null;
  /** Hoy ya entrenado: Rex cuenta cómo salió. */
  closing?: RexClosing | null;
  /** Texto de las fechas de la semana a repasar ("2 nov al 8 nov"), o null si no hay revisión pendiente. */
  weeklyReviewRange: string | null;
  /** Días desde que terminó la última competición aún sin cerrar con Rex, o null si no hay ninguna. */
  competitionClosedDaysAgo?: number | null;
  /** La próxima competición tiene fecha provisional y está a days días: Rex pide confirmarla. */
  provisionalCompetition?: { days: number; dateText: string } | null;
  /** El coach propone mover un día de la semana (ver `lib/weekCoach.ts`): ya viene hecha la sugerencia, solo para hoy. */
  weekMove?: RexSuggestion | null;
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

/** Desde cuántos días antes Rex pide confirmar una competición con fecha provisional. */
export const PROVISIONAL_NUDGE_DAYS = 56;
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
  actions: [{ label: 'Ver mi constancia', target: 'constancia' }],
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Rex comenta el día pasado que se mira: si entrenó, cómo salió el esfuerzo frente al objetivo de ese día; si no, qué hubo. */
export function daySuggestion(day: RexViewDay): RexSuggestion {
  // El volumen por día es un botón de «Más»: aquí solo se ofrece volver a hoy.
  const actions: RexAction[] = [{ label: 'Volver a hoy', target: 'hoy' }];
  const id = `dia-${day.iso}`;
  if (!day.trained) {
    const text = day.rested ? `${day.label} fue de descanso. Recuperar también es entrenar.` : `${day.label} no hay ninguna sesión registrada.`;
    return { id, priority: 100, text, mood: 'idle', actions, dismissible: false };
  }
  const real = day.strain;
  if (real === null) return { id, priority: 100, text: `${day.label} entrenaste.`, mood: 'happy', actions, dismissible: false };
  if (day.low === null || day.high === null) return { id, priority: 100, text: `${day.label} entrenaste, con un esfuerzo de ${real}.`, mood: 'happy', actions, dismissible: false };
  const range = `${day.low}–${day.high}`;
  if (real > day.high) return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, por encima de tu objetivo (${range}). Un día así pide cuidar el siguiente.`, mood: 'think', actions, dismissible: false };
  if (real < day.low) return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, por debajo de tu objetivo (${range}). Se quedó corto, sin problema.`, mood: 'idle', actions, dismissible: false };
  return { id, priority: 100, text: `${day.label} entrenaste con un esfuerzo de ${real}, dentro de tu objetivo (${range}). Justo lo que tocaba.`, mood: 'happy', actions, dismissible: false };
}

const ADVICE_MOOD: Record<RexAdvice['tone'], RexBarMood> = { good: 'happy', mid: 'think', bad: 'think', info: 'idle', gold: 'lift' };

/** El consejo del día como frase de Rex: el verbo en color y el motivo, con los atajos de la sesión y del descanso. */
export function adviceSuggestion(advice: RexAdvice, ctx: Pick<RexContext, 'restMarked' | 'canRest' | 'hasSessionToday'>): RexSuggestion {
  const actions: RexAction[] = [];
  if (ctx.restMarked) {
    actions.push({ label: 'Deshacer: voy a entrenar', target: 'descanso' }, { label: 'Hacer recovery', target: 'movilidad' });
  } else {
    if (ctx.hasSessionToday) actions.push({ label: advice.overTarget ? 'Ajustar sesión' : 'Ver la sesión', target: 'planificacion' });
    if (ctx.canRest) actions.push({ label: 'Hoy descanso', target: 'descanso' });
    // Un día sin sesión es un buen día para moverse sin cargar.
    if (!ctx.hasSessionToday) actions.push({ label: 'Hacer recovery', target: 'movilidad' });
  }
  return {
    id: 'consejo',
    priority: 95,
    lead: advice.lead,
    tone: advice.tone,
    text: advice.reason ? `${advice.lead} ${advice.reason}` : advice.lead,
    mood: ADVICE_MOOD[advice.tone],
    actions,
    dismissible: false,
  };
}

/** Hoy ya entrenado: «Sesión hecha.» y el esfuerzo frente al objetivo, con el detalle (previsto frente a hecho) a un toque. */
export function closingSuggestion(c: RexClosing | null): RexSuggestion {
  const actions: RexAction[] = [];
  // Estirar es el botón «Recovery» de «Más»: aquí solo el detalle del día.
  if (c?.hasDetail) actions.push({ label: 'Ver detalle', target: 'detalle-dia' });
  const base = { id: 'cierre', priority: 95, lead: 'Sesión hecha.', actions, dismissible: false };
  if (!c) return { ...base, text: 'Sesión hecha. Buen trabajo.', mood: 'happy', tone: 'good' };
  const range = `${c.low}–${c.high}`;
  const planned = c.planned !== null ? ` con ~${c.planned} previstos` : '';
  let body: string;
  let tone: RexSuggestion['tone'] = 'good';
  let mood: RexBarMood = 'happy';
  if (c.status === 'pasado') {
    body = `Esfuerzo ${c.real}${planned}: ${c.real - c.high} por encima de tu objetivo (${range}). Mañana, con cuidado.`;
    tone = 'mid';
    mood = 'think';
  } else if (c.status === 'por-debajo') {
    body = `Esfuerzo ${c.real}${planned}, por debajo de tu objetivo (${range}): había margen.`;
    tone = 'info';
    mood = 'idle';
  } else {
    body = `Esfuerzo ${c.real}${planned}, dentro de tu objetivo (${range}).`;
  }
  const notDone = c.notDone ? ` ${c.notDone}` : '';
  return { ...base, text: `Sesión hecha. ${body}${notDone}`, mood, tone };
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

  if (ctx.isToday && ctx.competitionClosedDaysAgo != null) {
    const when = ctx.competitionClosedDaysAgo === 1 ? 'ayer' : `hace ${ctx.competitionClosedDaysAgo} días`;
    out.push({
      id: 'competicion-cierre',
      priority: 96,
      lead: 'Competición hecha.',
      tone: 'gold',
      text: `Competición hecha. Terminó ${when}: cuéntame cómo fue y te preparo el camino a la siguiente.`,
      mood: 'lift',
      actions: [{ label: 'Contarle cómo fue', target: 'competicion-cierre' }],
    });
  }

  if (ctx.isToday && ctx.provisionalCompetition && ctx.provisionalCompetition.days <= PROVISIONAL_NUDGE_DAYS) {
    const { days, dateText } = ctx.provisionalCompetition;
    out.push({
      id: 'competicion-fecha',
      priority: 70,
      text: `Tu competición del ${dateText} sigue con fecha provisional y faltan ${days} ${days === 1 ? 'día' : 'días'}. ¿Ya sabes la fecha? Confírmala y reajusto los bloques.`,
      mood: 'think',
      actions: [{ label: 'Ya sé la fecha', target: 'competicion-fecha' }],
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

  if (ctx.isToday && ctx.weekMove) out.push(ctx.weekMove);

  if (ctx.emphasisReviewPending) {
    out.push({
      id: 'enfasis',
      priority: 80,
      text: 'He revisado lo que he priorizado en tu programación estas cuatro semanas. ¿Lo vemos?',
      mood: 'think',
      actions: [{ label: 'Ver la revisión', target: 'revision-enfasis' }],
    });
  }

  // La frase principal de hoy: tras entrenar, cómo salió; antes, el consejo del día. Va justo detrás del check-in y no se aparta.
  if (ctx.isToday && ctx.trainedToday) {
    out.push(closingSuggestion(ctx.closing ?? null));
  } else if (ctx.isToday && ctx.advice) {
    out.push(adviceSuggestion(ctx.advice, ctx));
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
export function pickRexSuggestion(list: RexSuggestion[], memory: RexMemory, todayIso: string, cursor = 0): { current: RexSuggestion; waiting: number } {
  const open = list.filter((s) => memory.dismissed[s.id] !== todayIso);
  if (open.length === 0) return { current: QUIET_SUGGESTION, waiting: 0 };
  // `cursor` pasa a la siguiente sin apartar nada («Tengo otra cosa…»); da la vuelta al llegar al final.
  return { current: open[((cursor % open.length) + open.length) % open.length], waiting: open.length - 1 };
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
  // «Constancia y volumen» es una sola ventana con dos pestañas; «volumen» sigue siendo un destino (para la caja de Rex) pero no tiene botón propio.
  { target: 'constancia', label: 'Constancia y volumen' },
  { target: 'movilidad', label: 'Recovery' },
  { target: 'semana', label: 'Tu semana' },
  { target: 'analisis', label: 'Análisis' },
  { target: 'marcas', label: 'Mis marcas' },
  { target: 'forma', label: 'Tu forma' },
  // «Objetivos» ya no está aquí: es una pestaña de la barra de abajo (el punto de la revisión del perfil va en esa pestaña).
  // El peso corporal ya no está aquí: se apunta desde Nutrición (que es donde se usa) y con el aviso de Rex cuando lleva días sin apuntarse.
];

/**
 * La línea de cifras del globo fijo de Rex: el objetivo de esfuerzo del día y, según el momento, lo realizado o lo previsto
 * («Objetivo 45–65 · Previsto ~54», «Objetivo 45–65 · Realizado 50»). null si no hay nada que contar.
 */
export function dockStats(input: { low: number | null; high: number | null; real: number | null; planned: number | null; skipTarget?: boolean }): string | null {
  const parts: string[] = [];
  if (!input.skipTarget && input.low !== null && input.high !== null) parts.push(`Objetivo ${input.low}–${input.high}`);
  if (input.real !== null) parts.push(`Realizado ${Math.round(input.real)}`);
  else if (input.planned !== null && input.planned > 0) parts.push(`Previsto ~${Math.round(input.planned)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
