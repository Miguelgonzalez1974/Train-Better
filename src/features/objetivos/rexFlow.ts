import type { AthleteProfile, Goal, GoalEmphasis, GoalType, IntensityRamp, Macrocycle, PersonalRecords, StrengthMethod, StrengthProgram } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { SKILL_PROGRESSION_TARGETS } from '../../data/movements/skillProgressions';
import { HALTERO_TOTAL_WEEKS } from '../../engine/halteroProgram';
import { MAYHEM_BASE_TOTAL_WEEKS, MAYHEM_PICO_TOTAL_WEEKS, MAYHEM_TECNICA_TOTAL_WEEKS } from '../../engine/mayhemProgram';
import { toLocalIsoDate } from '../../engine/periodization';
import { activeEmphasisItems } from '../../engine/programmingEmphasis';
import { DEFAULT_STRENGTH_PROGRAM_LIFTS, TEMPORADA_TOTAL_WEEKS } from '../../engine/strengthPrograms';
import { GOAL_TYPE_META } from './goalMeta';
import { goalFacts, shortDate } from './openItems';
import { STRENGTH_METHOD_META } from './strengthMethodMeta';

/**
 * La conversación de Rex como máquina de estados pura: cada pregunta (`getNode`) depende de lo ya contestado, y cada respuesta
 * suma al estado o termina creando algo (`commitItems`). Lo creado no se guarda al momento: se acumula en "tu plan" y se aplica
 * entero al final (`applyPlan`). Nada de esto toca la pantalla ni el almacenamiento, así se puede probar entera.
 */

export type PhaseStyle = 'clasico' | 'base' | 'pico';
export type ProgramCat = 'slow' | 'back' | 'tech' | 'max' | 'oly' | 'test' | 'auto';
export type CommitKind = 'obj' | 'macro' | 'prog' | 'ramp' | 'season';

export interface FlowState {
  type?: GoalType;
  movementId?: string;
  detail?: string;
  skillLevel?: number;
  weeks?: number;
  targetDate?: string;
  eventEndDate?: string;
  push?: GoalEmphasis;
  why?: string;
  phases?: PhaseStyle;
  startIso?: string;
  /** Nombre que el atleta le pone al macrociclo; vacío = el automático. */
  label?: string;
  cat?: ProgramCat;
  method?: StrengthMethod;
  lifts?: (keyof PersonalRecords)[];
  liftsLabel?: string;
  ramp?: { s: number; o: number; w: number };
}

export interface RexCtx {
  profile: AthleteProfile;
  todayIso: string;
  /** Para pruebas: ids predecibles. */
  newId?: () => string;
}

export type PlanKind = 'Objetivo' | 'Macrociclo' | 'Programa' | 'Rampa';

/** Una cosa que Rex ha preparado: lo que se enseña y lo que se guardará al crear el plan. */
export interface PlanItem {
  id: string;
  kind: PlanKind;
  short: string;
  title: string;
  sub: string;
  fx: string[];
  payload: { goal?: Goal; macro?: Macrocycle; program?: StrengthProgram; ramp?: IntensityRamp };
  /** Fechas de lo que ocupa un rango (macrociclo o programa), para detectar solapes. */
  start?: string;
  end?: string;
}

export interface RexOption {
  label: string;
  set?: Partial<FlowState>;
  next?: string;
  commit?: CommitKind;
  /** Empieza de cero con lo contestado (no toca el plan). */
  reset?: boolean;
}

export interface RexNode {
  text: string;
  options?: RexOption[];
  /** En vez de botones, un texto corto (el nombre de algo), con una propuesta por si lo dejas vacío. */
  input?: { field: 'label'; suggested: string; max: number; commit: CommitKind };
  /** En vez de botones, una fecha. */
  date?: { min?: string; field: 'targetDate' | 'eventEndDate' | 'startIso'; next?: string; commit?: CommitKind };
}

// ---------- fechas ----------

/** El nombre que lleva un macrociclo si el atleta no le pone otro. */
export function macroAutoLabel(weeks: number, startIso: string): string {
  return `Macro ${weeks} semanas · ${shortDate(startIso)}`;
}

export const LABEL_MAX = 60;

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

/** El lunes que viene (si hoy es lunes, el siguiente). */
export function nextMondayIso(todayIso: string): string {
  const day = new Date(`${todayIso}T12:00:00`).getDay();
  return addDaysIso(todayIso, ((8 - day) % 7) || 7);
}

const newIdDefault = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

// ---------- catálogo de opciones ----------

const STRENGTH_LIFTS: { label: string; id: string }[] = [
  { label: 'Sentadilla trasera', id: 'back-squat' },
  { label: 'Press banca', id: 'bench-press' },
  { label: 'Peso muerto', id: 'deadlift' },
  { label: 'Press militar', id: 'strict-press' },
];
const OLY_LIFTS: { label: string; id: string }[] = [
  { label: 'Snatch', id: 'snatch' },
  { label: 'Clean & jerk', id: 'clean-and-jerk' },
];

/** Cuánto dura cada método que trae las semanas fijas. */
export const METHOD_WEEKS: Partial<Record<StrengthMethod, number>> = {
  haltero: HALTERO_TOTAL_WEEKS,
  temporada: TEMPORADA_TOTAL_WEEKS,
  'mayhem-base': MAYHEM_BASE_TOTAL_WEEKS,
  'mayhem-tecnica': MAYHEM_TECNICA_TOTAL_WEEKS,
  'mayhem-pico': MAYHEM_PICO_TOTAL_WEEKS,
};

export const PROGRAM_CATS: { cat: ProgramCat; label: string; methods: StrengthMethod[] }[] = [
  { cat: 'slow', label: 'Progresión lenta y sostenible', methods: ['531', 'juggernaut'] },
  { cat: 'back', label: 'Volver tras un parón', methods: ['lineal'] },
  { cat: 'tech', label: 'Frecuencia alta y técnica', methods: ['ruso', 'ondulante'] },
  { cat: 'max', label: 'Fuerza máxima', methods: ['conjugado', 'texas'] },
  { cat: 'oly', label: 'Halterofilia de competición', methods: ['haltero', 'mayhem-tecnica', 'mayhem-base', 'mayhem-pico'] },
  { cat: 'test', label: 'Medir antes y después', methods: ['temporada'] },
  { cat: 'auto', label: 'Que lo regule yo', methods: ['dieSet'] },
];

const LIFT_SETS: { label: string; lifts: (keyof PersonalRecords)[] }[] = [
  { label: 'Los 4 clásicos (sentadilla, banca, peso muerto, press)', lifts: [...DEFAULT_STRENGTH_PROGRAM_LIFTS] },
  { label: 'Solo sentadilla y peso muerto', lifts: ['backSquat', 'deadlift'] },
  { label: 'Solo banca y press militar', lifts: ['benchPress', 'strictPress'] },
];

const RAMP_BY_GAP: { label: string; ramp: { s: number; o: number; w: number } }[] = [
  { label: 'Menos de 3 semanas', ramp: { s: 2, o: 2, w: 1 } },
  { label: 'De 3 a 6 semanas', ramp: { s: 4, o: 4, w: 3 } },
  { label: 'Más de 6 semanas', ramp: { s: 6, o: 6, w: 4 } },
];

/**
 * Reparto de fases de un macrociclo de `total` semanas. El orden es fijo en la app (acumulación, intensificación, pico y descarga),
 * así que "con el pico hacia el final" significa mucha base y un pico antes de una descarga corta. `undefined` = el ciclo clásico de
 * 4 semanas en bucle.
 */
export function phaseWeeksFor(total: number, style: PhaseStyle): [number, number, number, number] | undefined {
  if (style === 'clasico' || total < 4) return undefined;
  const share = style === 'base' ? [0.55, 0.25, 0.12] : [0.45, 0.3, 0.15];
  let a = Math.max(1, Math.round(total * share[0]));
  let i = Math.max(1, Math.round(total * share[1]));
  let p = Math.max(1, Math.round(total * share[2]));
  while (a + i + p > total - 1) {
    if (a >= i && a > 1) a--;
    else if (i > 1) i--;
    else if (p > 1) p--;
    else break;
  }
  return [a, i, p, total - a - i - p];
}

/** El nombre del método en el botón; si no trae las semanas en el nombre y son fijas, se las añade. */
function methodLabel(m: StrengthMethod): string {
  const label = STRENGTH_METHOD_META[m].label;
  const weeks = METHOD_WEEKS[m];
  return weeks && !/semanas/.test(label) ? ` ( sem)` : label;
}

const PHASE_TEXT: Record<PhaseStyle, string> = { clasico: 'fases clásicas de 4 semanas en bucle', base: 'más base al principio', pico: 'con el pico hacia el final' };

// ---------- el plan ----------

function weeksFromToday(ctx: RexCtx, weeks: number): Partial<FlowState> {
  return { weeks, targetDate: addDaysIso(ctx.todayIso, weeks * 7) };
}

function lastEndAfterToday(ranges: { startDate: string; endDate: string }[], todayIso: string, extra: { start?: string; end?: string }[]): string | null {
  const ends = [...ranges.filter((r) => r.endDate >= todayIso).map((r) => r.endDate), ...extra.filter((e) => e.end && e.end >= todayIso).map((e) => e.end as string)];
  return ends.length ? ends.sort()[ends.length - 1] : null;
}

function hub(first: boolean): RexOption[] {
  return [
    { label: 'Un objetivo', next: 'o_type', reset: true },
    { label: 'Un macrociclo', next: 'm_dur', reset: true },
    { label: 'Un programa de fuerza', next: 'p_goal', reset: true },
    { label: 'Una rampa de vuelta', next: 'r_gap', reset: true },
    { label: 'Una temporada completa', next: 't_when', reset: true },
    first ? { label: 'No lo sé, ayúdame', next: 'i_suggest', reset: true } : { label: 'Terminar y revisar', next: 'review' },
  ];
}

const opt = (label: string, set: Partial<FlowState>, next?: string, commit?: CommitKind): RexOption => ({ label, set, next, commit });

/** Lo que Rex propone cuando el perfil ya tiene algo que priorizar (el énfasis de la programación). */
export function suggestionFromProfile(profile: AthleteProfile): { state: Partial<FlowState>; text: string } | null {
  const item = activeEmphasisItems(profile)[0];
  if (!item) return null;
  const lift: Record<string, [string, string]> = {
    backSquat: ['back-squat', 'Sentadilla trasera'],
    frontSquat: ['front-squat', 'Front squat'],
    benchPress: ['bench-press', 'Press banca'],
    deadlift: ['deadlift', 'Peso muerto'],
    strictPress: ['strict-press', 'Press militar'],
  };
  if (item.area === 'fuerza' && lift[item.row]) {
    const [id, name] = lift[item.row];
    return { state: { type: 'elevar-fuerza', movementId: id, detail: name, why: item.why }, text: `subir tu ${name.toLowerCase()}: ${item.why}` };
  }
  if (item.area === 'halterofilia') {
    const snatch = item.row === 'snatch';
    return { state: { type: 'mejorar-potencia', movementId: snatch ? 'snatch' : 'clean-and-jerk', detail: snatch ? 'Snatch' : 'Clean & jerk', why: item.why }, text: `tu ${snatch ? 'snatch' : 'clean & jerk'}: ${item.why}` };
  }
  if (item.area === 'motor') return { state: { type: 'elevar-resistencia', why: item.why }, text: `más resistencia: ${item.why}` };
  return null;
}

export function getNode(id: string, s: FlowState, ctx: RexCtx, plan: PlanItem[]): RexNode {
  const weeksOptions = (next: string): RexOption[] => [4, 8, 12, 16].map((w) => opt(`${w} semanas`, weeksFromToday(ctx, w), next));
  switch (id) {
    case 'start':
      return { text: 'Hola, soy Rex, tu coach. ¿Qué montamos hoy? Puedes añadir varias cosas y las creamos todas juntas al final.', options: hub(true) };
    case 'more':
      return { text: '¿Añadimos algo más a tu plan?', options: hub(false) };

    // ----- objetivo -----
    case 'o_type':
      return {
        text: 'Un objetivo. ¿Qué quieres conseguir?',
        options: [
          opt('Subir un PR', { type: 'subir-pr' }, 'o_lift_any'),
          opt('Ser más fuerte en general', { type: 'elevar-fuerza' }, 'o_lift'),
          opt('Mejorar mi halterofilia', { type: 'mejorar-potencia' }, 'o_oly'),
          opt('Dominar un gimnástico', { type: 'mejorar-gimnasticos' }, 'o_skill'),
          opt('Más resistencia', { type: 'elevar-resistencia' }, 'o_when'),
          opt('Prepararme para una competición', { type: 'preparar-competicion' }, 'o_comp'),
        ],
      };
    case 'o_lift_any':
      return { text: 'Subir un PR. ¿De qué levantamiento?', options: [...STRENGTH_LIFTS, ...OLY_LIFTS].map((l) => opt(l.label, { movementId: l.id, detail: l.label }, 'o_when')) };
    case 'o_lift':
      return { text: '¿Qué levantamiento quieres subir?', options: STRENGTH_LIFTS.map((l) => opt(l.label, { movementId: l.id, detail: l.label }, 'o_when')) };
    case 'o_oly':
      return { text: '¿Cuál de los dos?', options: OLY_LIFTS.map((l) => opt(l.label, { movementId: l.id, detail: l.label }, 'o_when')) };
    case 'o_skill':
      return { text: '¿Qué movimiento quieres conseguir?', options: SKILL_PROGRESSION_TARGETS.map((m) => opt(m.name, { movementId: m.id, detail: m.name }, 'o_skill_level')) };
    case 'o_skill_level':
      return {
        text: '¿Desde dónde partes? Así no te programo escalones que ya tienes.',
        options: [opt('Desde cero', { skillLevel: 0 }, 'o_when'), opt('A medias', { skillLevel: 0.5 }, 'o_when'), opt('Casi lo tengo', { skillLevel: 0.8 }, 'o_when')],
      };
    case 'o_comp':
      return { text: '¿Cuándo es la competición? Dime el primer día.', date: { min: ctx.todayIso, field: 'targetDate', next: 'o_comp_days' } };
    case 'o_comp_days':
      return {
        text: '¿Dura más de un día?',
        options: [{ label: 'Un solo día', set: { eventEndDate: undefined }, commit: 'obj' }, { label: 'Varios días', set: {}, next: 'o_comp_end' }],
      };
    case 'o_comp_end':
      return { text: '¿Y el último día?', date: { min: s.targetDate, field: 'eventEndDate', commit: 'obj' } };
    case 'o_when':
      return {
        text: s.type === 'elevar-resistencia' ? 'Más motor, vale. ¿En cuánto tiempo quieres notarlo?' : '¿Para cuándo lo quieres?',
        options: [...weeksOptions('o_push'), opt('Elegir una fecha', {}, 'o_date')],
      };
    case 'o_date':
      return { text: '¿Qué fecha?', date: { min: addDaysIso(ctx.todayIso, 7), field: 'targetDate', next: 'o_push' } };
    case 'o_push':
      return {
        text: '¿Cuánto quieres que mande sobre el resto de tu entreno?',
        options: [
          { label: 'Moderado: se mezcla con lo demás', set: { push: 'moderado' }, commit: 'obj' },
          { label: 'Intensivo: casi todo gira alrededor', set: { push: 'intensivo' }, commit: 'obj' },
        ],
      };

    // ----- macrociclo -----
    case 'm_dur':
      return { text: 'Un macrociclo: el plan de fondo, con sus fases. ¿Cuánto quieres que dure?', options: [8, 12, 24].map((w) => opt(w === 12 ? '12 semanas (3 meses)' : w === 24 ? '24 semanas (6 meses)' : `${w} semanas`, { weeks: w }, 'm_phase')) };
    case 'm_phase':
      return {
        text: '¿Cómo repartimos las fases (acumulación, intensificación, pico y descarga)?',
        options: [
          opt('Clásico: ciclos de 4 semanas en bucle', { phases: 'clasico' }, 'm_start'),
          opt('Base primero: más acumulación al principio', { phases: 'base' }, 'm_start'),
          opt('Con el pico hacia el final', { phases: 'pico' }, 'm_start'),
        ],
      };
    case 'm_start': {
      const after = lastEndAfterToday(ctx.profile.macrocycles, ctx.todayIso, plan.filter((p) => p.kind === 'Macrociclo'));
      const o: RexOption[] = [opt('Hoy', { startIso: ctx.todayIso }, 'm_name'), opt('El lunes que viene', { startIso: nextMondayIso(ctx.todayIso) }, 'm_name')];
      if (after) o.unshift(opt(`Justo después del último (${shortDate(addDaysIso(after, 1))})`, { startIso: addDaysIso(after, 1) }, 'm_name'));
      return { text: '¿Cuándo arranca?', options: o };
    }
    case 'm_name': {
      const suggested = macroAutoLabel(s.weeks ?? 12, s.startIso ?? ctx.todayIso);
      return { text: `Último detalle: ¿cómo lo llamamos? Si lo dejas vacío, lo llamo «${suggested}».`, input: { field: 'label', suggested, max: LABEL_MAX, commit: 'macro' } };
    }

    // ----- programa de fuerza -----
    case 'p_goal':
      return { text: 'Un programa de fuerza. ¿Qué buscas?', options: PROGRAM_CATS.map((c) => opt(c.label, { cat: c.cat }, 'p_method')) };
    case 'p_method': {
      const cat = PROGRAM_CATS.find((c) => c.cat === s.cat) ?? PROGRAM_CATS[0];
      return {
        text: 'Para eso tengo estos. Elige uno y te cuento cómo funciona.',
        options: cat.methods.map((m) => opt(methodLabel(m), { method: m }, METHOD_WEEKS[m] ? 'p_start' : 'p_lifts')),
      };
    }
    case 'p_lifts': {
      const meta = STRENGTH_METHOD_META[s.method ?? '531'];
      return { text: `${meta.label}: ${meta.blurb} ¿Con qué levantamientos?`, options: LIFT_SETS.map((l) => opt(l.label, { lifts: l.lifts, liftsLabel: l.label.split(' (')[0].toLowerCase() }, 'p_dur')) };
    }
    case 'p_dur':
      return { text: '¿Cuánto quieres que dure?', options: [4, 8, 12].map((w) => opt(`${w} semanas`, { weeks: w }, 'p_start')) };
    case 'p_start': {
      const meta = STRENGTH_METHOD_META[s.method ?? '531'];
      const fixed = s.method ? METHOD_WEEKS[s.method] : undefined;
      const after = lastEndAfterToday(ctx.profile.strengthPrograms ?? [], ctx.todayIso, plan.filter((p) => p.kind === 'Programa'));
      const o: RexOption[] = [opt('Hoy', { startIso: ctx.todayIso }, 'p_warn'), opt('El lunes que viene', { startIso: nextMondayIso(ctx.todayIso) }, 'p_warn')];
      if (after) o.unshift(opt(`Justo después del último (${shortDate(addDaysIso(after, 1))})`, { startIso: addDaysIso(after, 1) }, 'p_warn'));
      return { text: `${fixed ? `${meta.label}: ${meta.blurb} Dura ${fixed} semanas. ` : ''}¿Cuándo arrancamos?`, options: o };
    }
    case 'p_warn':
      return {
        text: 'Ojo antes de añadirlo: mientras dure, el programa manda sobre tu macrociclo y tus objetivos quedan en pausa. El WOD solo lo añades tú a mano. Al terminar, vuelves a lo que tengas activo.',
        options: [{ label: 'Entendido, añádelo', set: {}, commit: 'prog' }, { label: 'Mejor no', set: {}, next: 'more' }],
      };

    // ----- rampa -----
    case 'r_gap':
      return {
        text: ctx.profile.intensityRamp ? 'Una rampa de vuelta. Ya tienes una; esta la sustituiría. ¿Cuánto tiempo llevas sin entrenar?' : 'Una rampa de vuelta. ¿Cuánto tiempo llevas sin entrenar?',
        options: RAMP_BY_GAP.map((g) => ({ label: g.label, set: { ramp: g.ramp }, commit: 'ramp' as const })),
      };

    // ----- temporada -----
    case 't_when':
      return {
        text: 'Una temporada completa: monto un macrociclo con el pico hacia el final y una competición en tu fecha clave. ¿Para cuándo es?',
        options: [8, 12, 16].map((w) => opt(`${w} semanas`, weeksFromToday(ctx, w), 't_gap')),
      };
    case 't_gap':
      return {
        text: '¿Vienes de un parón? Si sí, añado también una rampa.',
        options: [{ label: 'No, vengo entrenando', set: { ramp: undefined }, commit: 'season' }, ...RAMP_BY_GAP.slice(1).map((g) => ({ label: `Sí, ${g.label.toLowerCase()}`, set: { ramp: g.ramp }, commit: 'season' as const }))],
      };

    // ----- no lo sé -----
    case 'i_suggest': {
      const sug = suggestionFromProfile(ctx.profile);
      if (!sug) return getNode('i_block', s, ctx, plan);
      return {
        text: `Mirando tu perfil, yo empezaría por ${sug.text}. ¿Te encaja?`,
        options: [opt('Sí, adelante', sug.state, 'o_when'), { label: 'Mejor otra cosa', set: {}, next: 'start', reset: true }],
      };
    }
    case 'i_block':
      return {
        text: 'Sin problema. ¿Qué te frena más hoy?',
        options: [
          opt('Me falta fuerza', { type: 'elevar-fuerza', movementId: 'back-squat', detail: 'Sentadilla trasera', why: 'es lo que más arrastra a todo lo demás' }, 'i_ok'),
          opt('Me canso pronto en los WODs largos', { type: 'elevar-resistencia', why: 'así mejora tu motor aeróbico' }, 'i_ok'),
          opt('Me falla la técnica', { type: 'mejorar-potencia', movementId: 'snatch', detail: 'Snatch', why: 'la técnica de halterofilia se gana con repetición' }, 'i_ok'),
        ],
      };
    case 'i_ok': {
      const name = s.type === 'elevar-resistencia' ? 'más resistencia' : `tu ${(s.detail ?? '').toLowerCase()}`;
      return { text: `Con lo que me cuentas, yo empezaría por ${name}: ${s.why}. ¿Te encaja?`, options: [opt('Sí, adelante', {}, 'o_when'), { label: 'Mejor otra cosa', set: {}, next: 'start', reset: true }] };
    }
    default:
      return { text: '¿Qué montamos?', options: hub(true) };
  }
}

// ---------- crear ----------

function goalItem(s: FlowState, ctx: RexCtx): PlanItem {
  const type = s.type as GoalType;
  const meta = GOAL_TYPE_META[type];
  const weeks = s.weeks;
  const targetDate = s.targetDate ?? addDaysIso(ctx.todayIso, (weeks ?? 8) * 7);
  const goal: Goal = {
    id: (ctx.newId ?? newIdDefault)(),
    type,
    ...(s.movementId ? { movementId: s.movementId } : {}),
    targetDate,
    ...(type === 'preparar-competicion' && s.eventEndDate ? { eventEndDate: s.eventEndDate } : {}),
    emphasis: s.push ?? 'moderado',
    createdAt: ctx.todayIso,
    ...(type === 'mejorar-gimnasticos' && s.skillLevel !== undefined ? { skillLevel: s.skillLevel } : {}),
  };
  const title = s.detail ? `${meta.label} · ${s.detail}` : meta.label;
  const when = type === 'preparar-competicion' ? `${shortDate(targetDate)}${goal.eventEndDate ? ` al ${shortDate(goal.eventEndDate)}` : ''}` : `${shortDate(targetDate)}${weeks ? ` (${weeks} semanas)` : ''}`;
  return {
    id: goal.id,
    kind: 'Objetivo',
    short: title,
    title,
    sub: `${when}${type === 'preparar-competicion' ? '' : ` · ${goal.emphasis === 'intensivo' ? 'Intensivo' : 'Moderado'}`}`,
    fx: goalFacts(goal, s.detail, false),
    payload: { goal },
  };
}

function macroItem(args: { weeks: number; startIso: string; phases: PhaseStyle; label?: string }, ctx: RexCtx): PlanItem {
  const { weeks, startIso, phases } = args;
  const endDate = addDaysIso(startIso, weeks * 7 - 1);
  const phaseWeeks = phaseWeeksFor(weeks, phases);
  const macro: Macrocycle = {
    id: (ctx.newId ?? newIdDefault)(),
    label: args.label ?? macroAutoLabel(weeks, startIso),
    startDate: startIso,
    endDate,
    ...(phaseWeeks ? { phaseWeeks } : {}),
  };
  return {
    id: macro.id,
    kind: 'Macrociclo',
    short: `${weeks} semanas`,
    title: `Macrociclo de ${weeks} semanas`,
    sub: `del ${shortDate(startIso)} al ${shortDate(endDate)} · ${PHASE_TEXT[phases]}`,
    fx: [
      phaseWeeks ? `${phaseWeeks[0]} sem acumulación · ${phaseWeeks[1]} intensificación · ${phaseWeeks[2]} pico · ${phaseWeeks[3]} descarga.` : 'Fases de 4 semanas en bucle: acumulación, intensificación, pico y descarga.',
      'Solo hay un macrociclo activo cada día; los demás esperan su fecha.',
    ],
    payload: { macro },
    start: startIso,
    end: endDate,
  };
}

function programItem(s: FlowState, ctx: RexCtx): PlanItem {
  const method = s.method as StrengthMethod;
  const meta = STRENGTH_METHOD_META[method];
  const weeks = METHOD_WEEKS[method] ?? s.weeks ?? 8;
  const startIso = s.startIso ?? ctx.todayIso;
  const endDate = addDaysIso(startIso, weeks * 7 - 1);
  const program: StrengthProgram = { id: (ctx.newId ?? newIdDefault)(), startDate: startIso, endDate, method, lifts: s.lifts ?? [...DEFAULT_STRENGTH_PROGRAM_LIFTS] };
  return {
    id: program.id,
    kind: 'Programa',
    short: meta.label,
    title: `${meta.label} · ${weeks} semanas`,
    sub: `del ${shortDate(startIso)} al ${shortDate(endDate)}${METHOD_WEEKS[method] ? '' : ` · ${s.liftsLabel ?? 'los 4 clásicos'}`}`,
    fx: [meta.blurb, 'Un levantamiento por día, con calentamiento y core.', 'Mientras dura no usa el énfasis del perfil ni la progresión por resultados.'],
    payload: { program },
    start: startIso,
    end: endDate,
  };
}

function rampItem(r: { s: number; o: number; w: number }, ctx: RexCtx): PlanItem {
  const ramp: IntensityRamp = { startDate: ctx.todayIso, strengthWeeks: r.s, olyWeeks: r.o, wodWeeks: r.w };
  return {
    id: 'ramp',
    kind: 'Rampa',
    short: `${r.s}/${r.o}/${r.w} sem`,
    title: 'Rampa de vuelta',
    sub: `fuerza ${r.s} · oly ${r.o} · WOD ${r.w} semanas, desde hoy`,
    fx: ['La carga de fuerza y oly sube poco a poco desde hoy.', 'La exigencia del WOD también.', 'Se apaga sola al terminar las semanas.'],
    payload: { ramp },
  };
}

/** Lo que crea una respuesta final. Una temporada son varias cosas a la vez. */
export function commitItems(kind: CommitKind, s: FlowState, ctx: RexCtx): PlanItem[] {
  if (kind === 'obj') return [goalItem(s, ctx)];
  if (kind === 'macro') return [macroItem({ weeks: s.weeks ?? 12, startIso: s.startIso ?? ctx.todayIso, phases: s.phases ?? 'clasico', label: s.label?.trim().slice(0, LABEL_MAX) || undefined }, ctx)];
  if (kind === 'prog') return [programItem(s, ctx)];
  if (kind === 'ramp') return [rampItem(s.ramp ?? { s: 4, o: 4, w: 3 }, ctx)];
  const weeks = s.weeks ?? 12;
  const out: PlanItem[] = [];
  if (s.ramp) out.push(rampItem(s.ramp, ctx));
  const macro = macroItem({ weeks, startIso: ctx.todayIso, phases: 'pico', label: `Temporada ${weeks} semanas · ${shortDate(ctx.todayIso)}` }, ctx);
  out.push(macro);
  out.push(goalItem({ type: 'preparar-competicion', targetDate: macro.end, weeks }, ctx));
  return out;
}

/** Aplica el plan al perfil: suma objetivos, macrociclos y programas, y la rampa sustituye a la que hubiera. */
export function applyPlan(profile: AthleteProfile, items: PlanItem[]): AthleteProfile {
  const goals = items.flatMap((i) => (i.payload.goal ? [i.payload.goal] : []));
  const macros = items.flatMap((i) => (i.payload.macro ? [i.payload.macro] : []));
  const programs = items.flatMap((i) => (i.payload.program ? [i.payload.program] : []));
  const ramp = [...items].reverse().find((i) => i.payload.ramp)?.payload.ramp;
  return {
    ...profile,
    goals: [...profile.goals, ...goals],
    macrocycles: [...profile.macrocycles, ...macros],
    strengthPrograms: [...(profile.strengthPrograms ?? []), ...programs],
    ...(ramp ? { intensityRamp: ramp } : {}),
  };
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end;

/** Avisos de la revisión final: lo que conviene saber antes de crear (pausas, solapes, lo que se sustituye). */
export function reviewNotes(items: PlanItem[], profile: AthleteProfile, todayIso: string): string[] {
  const notes: string[] = [];
  const planPrograms = items.filter((i) => i.kind === 'Programa' && i.start && i.end);
  const planMacros = items.filter((i) => i.kind === 'Macrociclo' && i.start && i.end);
  const hasOthers = items.some((i) => i.kind === 'Objetivo' || i.kind === 'Macrociclo') || profile.macrocycles.length > 0 || profile.goals.length > 0;
  for (const p of planPrograms) {
    if (hasOthers) notes.push(`Del ${shortDate(p.start as string)} al ${shortDate(p.end as string)} manda el programa de fuerza: el macrociclo y los objetivos esperan hasta que acabe.`);
  }
  const existingPrograms = (profile.strengthPrograms ?? []).filter((p) => p.endDate >= todayIso);
  for (const p of planPrograms) {
    const clash = existingPrograms.find((e) => overlaps({ start: p.start as string, end: p.end as string }, { start: e.startDate, end: e.endDate })) ?? planPrograms.find((o) => o !== p && overlaps({ start: p.start as string, end: p.end as string }, { start: o.start as string, end: o.end as string }));
    if (clash) notes.push('Dos programas de fuerza se pisan en las mismas fechas: ese día el motor usa el primero que encuentra. Mejor encadenarlos.');
  }
  const existingMacros = profile.macrocycles.filter((m) => m.endDate >= todayIso);
  for (const m of planMacros) {
    const clash = existingMacros.find((e) => overlaps({ start: m.start as string, end: m.end as string }, { start: e.startDate, end: e.endDate }));
    if (clash) notes.push(`«${m.title}» se pisa con «${clash.label}»: ese día manda el primero. Mejor que arranque justo después.`);
  }
  if (planMacros.length > 1) notes.push('Los macrociclos van uno detrás de otro: solo hay uno activo cada día.');
  if (items.some((i) => i.kind === 'Rampa') && profile.intensityRamp) notes.push('La rampa nueva sustituye a la que tenías.');
  return [...new Set(notes)];
}

/** Para pruebas y para la UI: un nombre corto de un levantamiento por id. */
export function movementLabel(id: string | undefined): string | undefined {
  return id ? getMovementById(id)?.name : undefined;
}
