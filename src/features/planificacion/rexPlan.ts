import type { RexAction, RexSuggestion } from '../dashboard/rexDashboard';

/**
 * Rex en Planificación: la frase que resume el estado del día (semáforo, esfuerzo previsto frente al objetivo, dureza, competición,
 * molestias y lo que prioriza el perfil) y el aviso de que el coach tiene algo que contarte. Antes eran una fila de casillas, una línea
 * del perfil y una campana; ahora es una voz con tres atajos y el detalle completo detrás de «Por qué». Puro: lo pinta `RexBar`.
 */

/** Lo que Rex cuenta de la sesión ya completada, en una frase: lo que decidió el coach con los resultados, un PR nuevo o, si no, cómo va la semana. */
export interface PlanCompleted {
  /** Cambios de carga de hoy ya redactados («Press banca sube a 85 kg el próximo día»). */
  changes: string[];
  /** Mensaje de PR nuevo de hoy, si lo hay. */
  prMessage: string | null;
  /** Sugerencias de 1RM por confirmar (están en el resumen). */
  e1rmPending: number;
  streak: number;
  weekDone: number;
  weekPlanned: number;
}

export interface PlanRexContext {
  /** Se puede empezar la sesión (hay bloques que hacer, no es una sesión propia y aún no está hecha). */
  canStart?: boolean;
  /** Se está editando la sesión de hoy: Rex solo ofrece terminar la edición. */
  editing?: boolean;
  /** Hoy es un día de descanso: Rex ofrece, al menos, contarle algo. */
  restDay?: boolean;
  /** La sesión de hoy ya está completada: Rex lo cuenta en vez del estado del día. */
  completed?: PlanCompleted | null;
  /** Hay sesión de entreno hoy (no es descanso, no está hecha y no se está editando). */
  hasTrainingSession: boolean;
  /** Semáforo del día (verde/ámbar/rojo) y su nombre corto ("Día verde"); null si aún no hay check-in. */
  light: { color: 'verde' | 'ambar' | 'rojo'; name: string } | null;
  /** Esfuerzo previsto de la sesión (0-100), o null si no se puede estimar. */
  planned: number | null;
  fit: { kind: 'dentro' | 'se-pasa' | 'se-queda-corta'; diff: number } | null;
  target: { low: number; high: number } | null;
  /** Subida de dureza aplicada (0 = ninguna). */
  hardness: number;
  canHarder: boolean;
  /** Días para competir y fase, si hay una competición cerca. */
  competition: { daysToEvent: number; phase: string } | null;
  /** Zonas con aviso de molestia activo ("Rodilla"). */
  painLabels: string[];
  /** Lo que el diagnóstico del atleta inclina estas semanas ("más motor largo"), si hay. */
  emphasis: string | null;
  /** Avisos del coach que no son una molestia, y si alguno pide una decisión. */
  notices: { count: number; actionable: boolean };
  /** La sesión del programa de fuerza que convive con el macro, si hoy toca ofrecerla o ya se aceptó. */
  program?: PlanProgram | null;
}

/** Lo que Rex dice del programa de fuerza que convive con el macro. */
export interface PlanProgram {
  /** «Press banca · 4×4» */
  title: string;
  /** Número de sesión (1 = la primera) y total (null si no tiene tope). */
  number: number;
  total: number | null;
  /** Ya dijiste «hacerla hoy». */
  accepted: boolean;
  /** Ya tocaba antes y quedó pendiente. */
  late: boolean;
  isTest: boolean;
}

const LIGHT_TONE = { verde: 'good', ambar: 'mid', rojo: 'bad' } as const;
const EMPHASIS_MAX = 90;

function stop(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** La frase del estado del día: el semáforo como verbo en color y, detrás, lo que lo explica. */
export function planStateSuggestion(ctx: PlanRexContext): RexSuggestion | null {
  if (!ctx.hasTrainingSession) return null;
  const parts: string[] = [];
  const range = ctx.target ? `${ctx.target.low}–${ctx.target.high}` : null;
  if (ctx.planned !== null) {
    const p = `Esfuerzo previsto ~${Math.round(ctx.planned)}`;
    if (ctx.fit && range) {
      parts.push(
        ctx.fit.kind === 'dentro'
          ? `${p}, dentro de tu objetivo (${range}).`
          : ctx.fit.kind === 'se-pasa'
            ? ctx.program?.accepted
              ? `${p} con el programa de fuerza: se pasa ${ctx.fit.diff} de tu objetivo (${range}). Di «hoy sin accesorio» o aplaza el programa.`
              : `${p}: se pasa ${ctx.fit.diff} de tu objetivo (${range}).`
            : `${p}: te deja margen sobre tu objetivo (${range}).`,
      );
    } else parts.push(`${p}.`);
  }
  if (ctx.hardness > 0) parts.push(`Más dura +${ctx.hardness}.`);
  if (ctx.competition) parts.push(`A ${ctx.competition.daysToEvent} ${ctx.competition.daysToEvent === 1 ? 'día' : 'días'} de competir (${ctx.competition.phase}).`);
  if (ctx.painLabels.length > 0) parts.push(`Cuidando ${ctx.painLabels.map((l) => l.toLowerCase()).join(' y ')}.`);
  if (ctx.emphasis && ctx.emphasis.length <= EMPHASIS_MAX) parts.push(stop(ctx.emphasis));
  if (ctx.program) parts.push(ctx.program.accepted ? 'Tu programa de fuerza va en tu día.' : `Debajo tienes tu programa de fuerza (sesión ${ctx.program.number}).`);

  const lead = ctx.light ? `${ctx.light.name}.` : 'Sesión de hoy.';
  const tone = ctx.light ? LIGHT_TONE[ctx.light.color] : 'info';
  // Empezar es el botón principal; los cambios (más dura, me duele algo, otro WOD…) viven en RexLab.
  const actions: RexAction[] = [];
  if (ctx.canStart) actions.push({ label: 'Empezar sesión', target: 'plan-empezar' });
  actions.push({ label: 'Por qué', target: 'plan-detalle' });
  return {
    id: 'plan-estado',
    priority: 95,
    lead,
    tone,
    text: [lead, ...parts].join(' '),
    mood: tone === 'good' ? 'happy' : tone === 'info' ? 'idle' : 'think',
    actions,
    dismissible: false,
  };
}

/** La sesión ya hecha: una frase con lo que importa y el resumen completo a un toque (ya no ocupa la pantalla al entrar). */
export function planCompletedSuggestion(c: PlanCompleted | null | undefined): RexSuggestion | null {
  if (!c) return null;
  const lead = 'Sesión completada.';
  const week = c.weekPlanned > 0 ? `Esta semana llevas ${c.weekDone} de ${c.weekPlanned}.` : '';
  const body = c.changes.length > 0 ? stop(c.changes.slice(0, 2).join(' ')) : c.prMessage ? stop(c.prMessage) : c.streak > 1 ? `Buen trabajo: ${c.streak} días seguidos sin fallar. ${week}`.trim() : `Buen trabajo. ${week}`.trim();
  const pending = c.e1rmPending > 0 ? ` Tengo ${c.e1rmPending === 1 ? 'una sugerencia' : `${c.e1rmPending} sugerencias`} de 1RM por confirmar.` : '';
  return {
    id: 'plan-completada',
    priority: 95,
    lead,
    tone: 'good',
    text: `${lead} ${body}${pending}`.trim(),
    mood: 'happy',
    actions: [{ label: 'Ver resumen', target: 'plan-resumen' }],
    dismissible: false,
  };
}

/** Mientras se edita la sesión: una frase y la salida, que antes estaba en el menú de los tres puntos. */
export function planEditingSuggestion(editing: boolean | undefined): RexSuggestion | null {
  if (!editing) return null;
  const lead = 'Editando la sesión.';
  return {
    id: 'plan-editando',
    priority: 100,
    lead,
    tone: 'info',
    text: `${lead} Toca un ejercicio para cambiarlo y usa los botones de cada bloque para añadir o quitar.`,
    mood: 'think',
    actions: [{ label: 'Terminar edición', target: 'plan-terminar' }],
    dismissible: false,
  };
}

/** Un día de descanso: Rex sigue ahí para lo que haga falta (me duele algo, voy a faltar unos días…). */
export function planRestSuggestion(restDay: boolean | undefined): RexSuggestion | null {
  if (!restDay) return null;
  const lead = 'Día de descanso.';
  return {
    id: 'plan-descanso',
    priority: 92,
    lead,
    tone: 'info',
    text: `${lead} Aprovecha para recuperar. Si algo ha pasado, cuéntamelo.`,
    mood: 'idle',
    actions: [],
    dismissible: false,
  };
}

/** Rex avisa de que el coach tiene algo para ti (una propuesta que decidir o una nota); la molestia ya se dice en la frase del estado. */
export function planNoticesSuggestion(notices: PlanRexContext['notices']): RexSuggestion | null {
  if (notices.count <= 0) return null;
  const text = notices.actionable
    ? notices.count === 1
      ? 'El coach tiene una propuesta para ti y quiere que la decidas.'
      : `El coach tiene ${notices.count} avisos para ti y alguno pide que decidas.`
    : notices.count === 1
      ? 'Tengo un aviso del coach para ti.'
      : `Tengo ${notices.count} avisos del coach para ti.`;
  return {
    id: 'plan-avisos',
    priority: 90,
    text,
    mood: 'think',
    actions: [{ label: notices.count === 1 ? 'Verlo' : 'Verlos', target: 'plan-avisos' }],
  };
}

/** La frase corta del programa, para decirla sola o pegada a la del día. */
export function programSentence(p: PlanProgram): string {
  const n = p.total ? `${p.number} de ${p.total}` : `${p.number}`;
  if (p.accepted) return `Tu programa de fuerza está en tu día: ${p.title}.`;
  if (p.isTest) return `Hoy toca test de tu programa de fuerza (sesión ${n}): ${p.title}. Es la única que no se salta.`;
  if (p.late) return `Te quedó pendiente la sesión ${n} de tu programa de fuerza: ${p.title}.`;
  return `Hoy toca la sesión ${n} de tu programa de fuerza: ${p.title}.`;
}

/** El programa de fuerza que convive con el macro: Rex lo anuncia y lleva a su tarjeta (bajo la sesión). */
export function planProgramSuggestion(p: PlanProgram | null | undefined, light?: PlanRexContext['light']): RexSuggestion | null {
  if (!p) return null;
  const lead = p.isTest ? 'Test.' : p.accepted ? 'Programa en tu día.' : 'Programa de fuerza.';
  // El semáforo avisa pero no decide: con ámbar o rojo Rex lo dice y deja la elección al usuario (se puede estar fuerte y haber dormido poco).
  const warn = !p.accepted && light && light.color !== 'verde' ? ` Ojo: hoy es ${light.name.toLowerCase()}. Tú decides.` : '';
  return {
    id: 'plan-programa',
    priority: 94,
    lead,
    tone: !p.accepted && light?.color === 'rojo' ? 'bad' : !p.accepted && light?.color === 'ambar' ? 'mid' : p.isTest ? 'info' : 'gold',
    text: `${lead} ${programSentence(p)}${p.accepted ? '' : ' ¿La hacemos hoy?'}${warn}`,
    mood: 'lift',
    actions: [{ label: p.accepted ? 'Ver el programa' : 'Verla', target: 'plan-programa' }],
    dismissible: !p.isTest,
  };
}

/** Todo lo que Rex tiene que decir en Planificación, de más a menos importante. Vacío = la barra no se enseña. */
export function buildPlanRexSuggestions(ctx: PlanRexContext): RexSuggestion[] {
  return [
    planEditingSuggestion(ctx.editing),
    planCompletedSuggestion(ctx.completed),
    planStateSuggestion(ctx),
    planProgramSuggestion(ctx.program, ctx.light),
    planRestSuggestion(ctx.restDay),
    planNoticesSuggestion(ctx.notices),
  ]
    .filter((s): s is RexSuggestion => s !== null)
    .sort((a, b) => b.priority - a.priority);
}
