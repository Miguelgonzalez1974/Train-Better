import { CalendarRange, Gauge, type LucideIcon } from 'lucide-react';
import type { AthleteProfile, Goal, Macrocycle, SessionHistoryEntry, StrengthProgram } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { getGoalProgress, getPerformanceProgress, getTimeProgress, isGoalBehindSchedule } from '../../engine/goalProgress';
import { describeRampStatus } from '../../engine/intensityRamp';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { currentWeekInRange, getActiveMacrocycle, resolveMacrocyclePhase, totalMacrocycleWeeks, weeksSinceStart } from '../../engine/periodization';
import { getActiveStrengthProgram } from '../../engine/strengthPrograms';
import { GOAL_TYPE_COLOR, GOAL_TYPE_META } from './goalMeta';
import { STRENGTH_METHOD_COLOR, STRENGTH_METHOD_META } from './strengthMethodMeta';

/**
 * Lo que el atleta tiene abierto, listo para pintar: objetivos con su avance, el plan de fondo (programa de fuerza, macrociclo y
 * rampa), lo que viene y lo ya terminado. Es una lectura pura del perfil: no decide nada, solo ordena lo que el motor ya usa
 * (el avance de un objetivo, la semana del macrociclo, la pausa que impone un programa de fuerza).
 */

export type ChipTone = 'good' | 'warn' | 'accent' | 'muted';
export type OpenKind = 'objetivo' | 'macro' | 'programa' | 'rampa';
export type OpenAction = 'editar' | 'plan' | 'terminar' | 'quitar' | 'eliminar';

export interface OpenItem {
  id: string;
  kind: OpenKind;
  /** Id del objetivo, macrociclo o programa; la rampa no lo necesita. */
  refId?: string;
  Icon: LucideIcon;
  color: string;
  title: string;
  sub: string;
  chip: { text: string; tone: ChipTone };
  /** 0-100, o null si no tiene barra. */
  pct: number | null;
  /** Dónde debería ir según el tiempo (0-100): la raya de la barra. Solo en los objetivos con un levantamiento que medir. */
  tick: number | null;
  /** Barra apagada: está en pausa. */
  dim: boolean;
  legend?: string;
  facts: string[];
  actions: OpenAction[];
}

export interface OpenGroups {
  objetivos: OpenItem[];
  fondo: OpenItem[];
  viene: OpenItem[];
  terminados: OpenItem[];
  /** Cuántas cosas hay abiertas (sin contar las terminadas). */
  total: number;
  /** Aviso cuando un programa de fuerza deja en pausa el macrociclo y los objetivos. */
  pauseNote: string | null;
}

const MACRO_COLOR = '#d4af37';
const RAMP_COLOR = '#38bdf8';
const DAY_MS = 86_400_000;

/** "2026-11-12" → "12 nov". */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

function daysUntil(iso: string, todayIso: string): number {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / DAY_MS);
}

const inDays = (d: number) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);

function goalFacts(goal: Goal, name: string | undefined, behind: boolean): string[] {
  const n = name ?? 'tu levantamiento';
  switch (goal.type) {
    case 'subir-pr':
    case 'elevar-fuerza':
      return [
        `${n} sale como principal en el ${goal.emphasis === 'intensivo' ? '90-95' : '60-75'} % de los días de su patrón.`,
        behind ? 'Como vas por detrás, su prioridad es alta (90 % o más).' : 'Si vas por detrás del plan, el coach sube su prioridad solo.',
        ...(goal.emphasis === 'moderado' ? ['En el último tercio del plazo pasa a intensivo.'] : []),
      ];
    case 'mejorar-potencia':
      return [`La familia de ${n} abre la alternancia de oly.`, behind ? 'Como vas por detrás, su prioridad es alta (90 % o más).' : 'Si vas por detrás, el coach sube su prioridad solo.'];
    case 'mejorar-gimnasticos':
      return ['La habilidad lidera un WOD más a la semana.', `Se progresa por escalones hasta ${n.toLowerCase()}.`];
    case 'elevar-resistencia':
      return ['Sube el cardio cíclico en tus WODs (1-2 movimientos por WOD).', 'Con más de la mitad del plazo, sube a 2.'];
    case 'preparar-competicion':
      return ['Cuenta atrás por fases, con taper, simulacro y día libre de la prueba.', 'El énfasis del perfil se aparta mientras tanto.'];
  }
}

function goalItem(goal: Goal, history: SessionHistoryEntry[], todayIso: string, today: Date, program: StrengthProgram | undefined): { item: OpenItem; overdue: boolean } {
  const meta = GOAL_TYPE_META[goal.type];
  const movement = goal.movementId ? getMovementById(goal.movementId) : undefined;
  const days = daysUntil(goal.targetDate, todayIso);
  const overdue = days < 0;
  const tracks = Boolean(goal.movementId);
  const performance = tracks ? getPerformanceProgress(goal, history) : null;
  const behind = tracks && isGoalBehindSchedule(goal, history, today);
  const isComp = goal.type === 'preparar-competicion';

  let chip: OpenItem['chip'];
  if (overdue) chip = { text: 'Vencido', tone: 'muted' };
  else if (program) chip = { text: 'En pausa', tone: 'muted' };
  else if (isComp) chip = { text: days === 0 ? 'Es hoy' : `Faltan ${days} d`, tone: 'accent' };
  else if (behind) chip = { text: performance === null ? 'Falta un test' : 'Va por detrás', tone: 'warn' };
  else chip = { text: tracks ? 'Va al día' : 'En marcha', tone: 'good' };

  const dateText = isComp && goal.eventEndDate ? `del ${shortDate(goal.targetDate)} al ${shortDate(goal.eventEndDate)}` : `${isComp ? 'el' : 'vence el'} ${shortDate(goal.targetDate)}`;
  const facts: string[] = overdue
    ? ['La fecha ya pasó: este objetivo no influye en tus sesiones.']
    : program
      ? [`Pausado mientras dure el programa de fuerza (hasta el ${shortDate(program.endDate)}).`, 'Después vuelve solo y recupera su prioridad.']
      : goalFacts(goal, movement?.name, behind);
  if (!overdue && !program && behind && performance === null) facts.push('Con más de la mitad del plazo y sin ningún test registrado, el coach ya lo trata como atrasado: haz un test para ajustarlo.');

  return {
    overdue,
    item: {
      id: `goal:${goal.id}`,
      kind: 'objetivo',
      refId: goal.id,
      Icon: meta.Icon,
      color: GOAL_TYPE_COLOR[goal.type],
      title: movement ? `${meta.label} · ${movement.name}` : meta.label,
      sub: overdue ? `venció el ${shortDate(goal.targetDate)}` : `${dateText} · ${inDays(days)}`,
      chip,
      pct: overdue || isComp ? null : Math.round(getGoalProgress(goal, history, today) * 100),
      tick: tracks && !overdue && !isComp ? Math.round(getTimeProgress(goal, today) * 100) : null,
      dim: Boolean(program) || overdue,
      legend: tracks && !overdue && !isComp ? 'Barra: tu avance · raya: lo esperable a estas alturas' : undefined,
      facts,
      actions: overdue ? ['terminar'] : ['editar', 'terminar'],
    },
  };
}

function macroItem(macro: Macrocycle, todayIso: string, today: Date, program: StrengthProgram | undefined, state: 'activo' | 'proximo' | 'finalizado'): OpenItem {
  const total = totalMacrocycleWeeks(macro);
  if (state === 'proximo') {
    return {
      id: `macro:${macro.id}`,
      kind: 'macro',
      refId: macro.id,
      Icon: CalendarRange,
      color: MACRO_COLOR,
      title: macro.label,
      sub: `del ${shortDate(macro.startDate)} al ${shortDate(macro.endDate)} · ${total} semanas · empieza ${inDays(daysUntil(macro.startDate, todayIso))}`,
      chip: { text: 'Programado', tone: 'muted' },
      pct: null,
      tick: null,
      dim: false,
      facts: ['Arranca solo cuando llegue su fecha.', 'Solo hay un macrociclo activo cada día.'],
      actions: ['editar', 'plan', 'eliminar'],
    };
  }
  if (state === 'finalizado') {
    return {
      id: `macro:${macro.id}`,
      kind: 'macro',
      refId: macro.id,
      Icon: CalendarRange,
      color: MACRO_COLOR,
      title: macro.label,
      sub: `terminó el ${shortDate(macro.endDate)}`,
      chip: { text: 'Terminado', tone: 'muted' },
      pct: null,
      tick: null,
      dim: true,
      facts: [],
      actions: ['eliminar'],
    };
  }
  const week = currentWeekInRange(macro, today);
  const phase = MESOCYCLE_PHASE[resolveMacrocyclePhase(macro, today).phaseIndex];
  const pw = macro.phaseWeeks;
  return {
    id: `macro:${macro.id}`,
    kind: 'macro',
    refId: macro.id,
    Icon: CalendarRange,
    color: MACRO_COLOR,
    title: macro.label,
    sub: `semana ${week} de ${total} · ${phase} · hasta el ${shortDate(macro.endDate)}`,
    chip: program ? { text: 'En pausa', tone: 'muted' } : { text: 'En marcha', tone: 'good' },
    pct: Math.round((week / total) * 100),
    tick: null,
    dim: Boolean(program),
    legend: 'Avance del macrociclo',
    facts: [
      program ? `Hasta el ${shortDate(program.endDate)} las sesiones salen de tu programa de fuerza; después vuelve este bloque.` : `Fase actual: ${phase.toLowerCase()}.`,
      pw ? `${pw[0]} sem acumulación · ${pw[1]} intensificación · ${pw[2]} pico · ${pw[3]} descarga.` : 'Fases de 4 semanas en bucle: acumulación, intensificación, pico y descarga.',
    ],
    actions: ['editar', 'plan', 'eliminar'],
  };
}

function programItem(program: StrengthProgram, todayIso: string, today: Date, state: 'activo' | 'proximo' | 'finalizado'): OpenItem {
  const meta = STRENGTH_METHOD_META[program.method];
  const total = totalMacrocycleWeeks(program);
  const base = {
    id: `program:${program.id}`,
    kind: 'programa' as const,
    refId: program.id,
    Icon: meta.Icon,
    color: STRENGTH_METHOD_COLOR[program.method],
    title: `${meta.label} · programa de fuerza`,
    tick: null,
  };
  if (state === 'proximo') {
    return {
      ...base,
      sub: `del ${shortDate(program.startDate)} al ${shortDate(program.endDate)} · empieza ${inDays(daysUntil(program.startDate, todayIso))}`,
      chip: { text: 'Programado', tone: 'muted' },
      pct: null,
      dim: false,
      facts: [meta.blurb, 'Cuando arranque, mandará sobre el macrociclo y tus objetivos esperarán.'],
      actions: ['editar', 'eliminar'],
    };
  }
  if (state === 'finalizado') {
    return { ...base, sub: `terminó el ${shortDate(program.endDate)}`, chip: { text: 'Terminado', tone: 'muted' }, pct: null, dim: true, facts: [], actions: ['eliminar'] };
  }
  const week = currentWeekInRange(program, today);
  return {
    ...base,
    sub: `semana ${week} de ${total} · del ${shortDate(program.startDate)} al ${shortDate(program.endDate)}`,
    chip: { text: 'Manda ahora', tone: 'accent' },
    pct: Math.round((week / total) * 100),
    dim: false,
    legend: 'Avance del programa',
    facts: [meta.blurb, 'Un levantamiento por día, con calentamiento y core.', 'Mientras dura no usa el énfasis del perfil ni la progresión por resultados.', 'Al terminar vuelves al macrociclo y a tus objetivos.'],
    actions: ['editar', 'quitar'],
  };
}

function statusOf(range: { startDate: string; endDate: string }, todayIso: string): 'activo' | 'proximo' | 'finalizado' {
  if (todayIso < range.startDate) return 'proximo';
  if (todayIso > range.endDate) return 'finalizado';
  return 'activo';
}

export function buildOpenItems(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): OpenGroups {
  const today = new Date(`${todayIso}T00:00:00`);
  const program = getActiveStrengthProgram(profile.strengthPrograms ?? [], todayIso);
  const activeMacro = getActiveMacrocycle(profile.macrocycles, todayIso);

  const objetivos: OpenItem[] = [];
  const terminados: OpenItem[] = [];
  const fondo: OpenItem[] = [];
  const viene: OpenItem[] = [];

  for (const goal of [...profile.goals].sort((a, b) => a.targetDate.localeCompare(b.targetDate))) {
    const { item, overdue } = goalItem(goal, history, todayIso, today, program);
    (overdue ? terminados : objetivos).push(item);
  }

  for (const p of [...(profile.strengthPrograms ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const state = statusOf(p, todayIso);
    const item = programItem(p, todayIso, today, state);
    (state === 'activo' ? fondo : state === 'proximo' ? viene : terminados).push(item);
  }

  for (const m of [...profile.macrocycles].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const state = statusOf(m, todayIso);
    // Si dos macrociclos se pisan, solo cuenta como activo el que usa el motor.
    const effective = state === 'activo' && activeMacro && m.id !== activeMacro.id ? 'proximo' : state;
    const item = macroItem(m, todayIso, today, program, effective);
    (effective === 'activo' ? fondo : effective === 'proximo' ? viene : terminados).push(item);
  }

  const ramp = profile.intensityRamp;
  if (ramp) {
    const status = describeRampStatus(ramp, today);
    const longest = Math.max(ramp.strengthWeeks, ramp.olyWeeks, ramp.wodWeeks);
    const elapsed = weeksSinceStart(ramp.startDate, today);
    const base = { id: 'ramp', kind: 'rampa' as const, Icon: Gauge, color: RAMP_COLOR, title: 'Rampa de vuelta', tick: null };
    if (status) {
      fondo.push({
        ...base,
        sub: status.replace('Rampa de vuelta: ', ''),
        chip: { text: 'En marcha', tone: 'good' },
        pct: longest > 0 ? Math.min(100, Math.round((elapsed / longest) * 100)) : null,
        dim: false,
        legend: 'Avance de la rampa',
        facts: ['La carga de fuerza y oly sube poco a poco.', 'La exigencia del WOD también.', 'Se apaga sola al terminar las semanas.'],
        actions: ['editar', 'quitar'],
      });
    } else {
      terminados.push({ ...base, sub: `terminó (empezó el ${shortDate(ramp.startDate)})`, chip: { text: 'Terminada', tone: 'muted' }, pct: null, dim: true, facts: [], actions: ['quitar'] });
    }
  }

  // El programa y el macrociclo activos van primero; la rampa al final de lo que está en marcha.
  const order: Record<OpenKind, number> = { programa: 0, macro: 1, rampa: 2, objetivo: 3 };
  fondo.sort((a, b) => order[a.kind] - order[b.kind]);

  const hasPaused = Boolean(program) && (profile.macrocycles.length > 0 || profile.goals.length > 0);
  return {
    objetivos,
    fondo,
    viene,
    terminados,
    total: objetivos.length + fondo.length + viene.length,
    pauseNote: hasPaused && program ? `Hasta el ${shortDate(program.endDate)} manda el programa de fuerza: el macrociclo y tus objetivos esperan.` : null,
  };
}
