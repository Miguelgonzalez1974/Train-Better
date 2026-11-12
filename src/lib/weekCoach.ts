import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { MovementPattern } from '../data/movements/types';
import { ENERGY_LOW, FATIGUE_TAU, FITNESS_TAU, buildFormSeries, energyOf } from '../engine/formCurve';
import { hasActiveTrainingStructure } from '../engine/generateSession';
import { addDaysIso } from '../engine/periodization';
import { estimatePlannedStrain } from '../engine/plannedStrain';
import { isRestMarked } from '../engine/restDays';
import { effectiveLoad } from '../engine/sessionCost';
import { dayStrain } from '../engine/strain';
import { resolveCompetitionDay } from '../engine/taperPlan';
import { dayLabel, planMove, sessionFor, type MovePlan } from './sessionMove';
import { weekPlanFromMove, type WeekPlan } from './weekShift';

/**
 * El coach propone mover un día de la semana según tu curva de forma («el día fuerte mejor el jueves, que llegas mejor»).
 *
 * Qué hace: toma las sesiones de los próximos días con su esfuerzo previsto, simula día a día tu energía (el mismo modelo de forma física y
 * fatiga de `engine/formCurve.ts`) y prueba los cambios sencillos que ya sabe hacer Rex: intercambiar dos sesiones que están a uno o dos días,
 * o pasar una a un día de descanso. Se queda con el que más energía le da a la sesión más dura de la pareja.
 *
 * Cuándo habla: solo si esa sesión te pilla, esta semana, claramente peor que un día así de la semana en tus últimas cuatro (lo normal para
 * ti no se toca: cada viernes cansa y no se avisa cada viernes), la mejora es clara y el resto de la semana no sale perdiendo.
 *
 * Reglas de prudencia: hace falta curva fiable; nada cerca de una competición (manda el taper); solo sesiones futuras de la misma semana
 * (de lunes a domingo); nunca lo entrenado, los descansos que marcaste ni la competición; no junta dos días del mismo trabajo pesado
 * (piernas con piernas, empuje con empuje, tirón con tirón) si no estaban ya juntos; y como mucho una propuesta por semana (`weekMoveMemory`).
 * Puro y sin guardar nada: aplicarlo es el `planMove` de siempre (se puede deshacer).
 */

/** Días por delante que se miran (mañana + 4): más lejos la previsión de la semana es demasiado incierta para proponer nada. */
export const HORIZON = 5;
/** Lo más lejos que se mueve una sesión: uno o dos días, para que la semana siga pareciéndose a sí misma. */
export const MAX_SHIFT = 2;
/** Lo que tiene que ganar en energía (0-100) la sesión más dura: al intercambiar dos sesiones (no cambia los días de descanso)… */
export const MIN_SWAP_GAIN = 6;
/** …y al pasarla a un día de descanso (cambia la forma de la semana, así que se pide más). */
export const MIN_REST_MOVE_GAIN = 14;
/** La semana en conjunto (energía media ponderada por el esfuerzo de cada sesión) tiene que mejorar al menos esto. */
export const MIN_AVG_GAIN = 1;
/** Ninguna otra sesión de la semana puede perder más que esto. */
export const MAX_OTHER_LOSS = 5;
/** Dos días con menos diferencia de esfuerzo que esto no merecen un cambio. */
export const MIN_LOAD_GAP = 12;
/** Cuánto por debajo de lo normal para ese día de la semana tiene que caer la energía para que se hable. */
export const ANOMALY_DROP = 8;
/** Un día fuerte: al menos esta carga y al menos esta parte de la sesión más dura de su semana. */
export const HARD_MIN = 40;
export const HARD_SHARE = 0.85;
/** Con cuántos días parecidos en las últimas semanas se fía uno de «lo normal». */
const MIN_TYPICAL_SAMPLES = 3;
const MAX_TRIES = 6;

type Family = 'piernas' | 'empuje' | 'tiron';

/** Lo que el cálculo necesita saber de cada día (mañana primero; el índice 0 es hoy). */
export interface WeekSlot {
  iso: string;
  /** Esfuerzo previsto del día (0 = descanso), en la escala de la curva de forma. */
  load: number;
  /** Sesión que se puede llevar a otro día. */
  movable: boolean;
  /** Día de descanso (de plantilla) al que se puede llevar una sesión. */
  restSlot: boolean;
  /** Trabajo pesado que carga la sesión (para no juntar dos días iguales), y si es un día suave. */
  families: Family[];
  light: boolean;
}

export interface WeekPickInput {
  /** Forma física y fatiga al empezar hoy. */
  start: { fitness: number; fatigue: number };
  slots: WeekSlot[];
  /** Energía habitual al empezar cada día de la semana (0 = domingo) en las últimas semanas, o null si no hay datos para fiarse. */
  typical: (number | null)[];
}

export interface WeekPick {
  /** Índices en `slots`: la sesión más dura y el día con el que cambia. */
  heavy: number;
  other: number;
  /** true: la sesión más dura pasa a un día de descanso. */
  restMove: boolean;
  keyGain: number;
  avgGain: number;
  before: number[];
  after: number[];
  afterLoads: number[];
  /** La energía habitual de ese día de la semana (null si no se sabe). */
  typicalHeavy: number | null;
}

const DAY_MS = 86_400_000;
const isoDay = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS);
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00`).getDay();

/** El lunes de la semana de un día. */
export function weekMonday(iso: string): string {
  return addDaysIso(iso, -((weekdayOf(iso) + 6) % 7));
}

/** Tu energía (0-100) al empezar cada día, con las cargas dadas, desde el estado de forma de hoy. */
export function simulateEnergy(start: { fitness: number; fatigue: number }, loads: number[]): number[] {
  const dF = Math.exp(-1 / FITNESS_TAU);
  const dG = Math.exp(-1 / FATIGUE_TAU);
  let fitness = start.fitness;
  let fatigue = start.fatigue;
  return loads.map((load) => {
    const energy = energyOf(fitness - fatigue, fitness);
    fitness = fitness * dF + load * (1 - dF);
    fatigue = fatigue * dG + load * (1 - dG);
    return energy;
  });
}

/** Cuántas parejas de días seguidos comparten familia de trabajo pesado (los días suaves no cuentan). */
function adjacentConflicts(slots: Pick<WeekSlot, 'families' | 'light'>[]): number {
  let n = 0;
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a.light || b.light) continue;
    for (const f of b.families) if (a.families.includes(f)) n++;
  }
  return n;
}

/**
 * Las parejas de días que mejoran la semana, de la mejor a la peor. Lo que no pasa los umbrales no sale. Es todo el criterio del coach, sin
 * sesiones ni perfil de por medio, para poder probarlo con números.
 */
export function pickWeekMoves({ start, slots, typical }: WeekPickInput): WeekPick[] {
  const loads = slots.map((s) => s.load);
  const before = simulateEnergy(start, loads);
  const weighted = (energy: number[], ls: number[]) => ls.reduce((s, l, i) => (i >= 1 ? s + l * energy[i] : s), 0);
  const totalLoad = loads.reduce((s, l, i) => (i >= 1 ? s + l : s), 0);
  if (totalLoad <= 0) return [];
  const baseScore = weighted(before, loads);
  const baseConflicts = adjacentConflicts(slots);

  const found: WeekPick[] = [];
  for (let a = 1; a < slots.length; a++) {
    for (let b = a + 1; b <= Math.min(a + MAX_SHIFT, slots.length - 1); b++) {
      const A = slots[a];
      const B = slots[b];
      if (weekMonday(A.iso) !== weekMonday(B.iso)) continue;
      const swap = A.movable && B.movable;
      const restMove = !swap && ((A.movable && B.restSlot) || (B.movable && A.restSlot));
      if (!swap && !restMove) continue;
      if (Math.abs(A.load - B.load) < MIN_LOAD_GAP) continue;
      const heavy = A.load >= B.load ? a : b;
      const other = heavy === a ? b : a;
      // Lo que se mueve es un día fuerte de verdad: de las sesiones más duras de su semana, no una ligera que pasa por ahí.
      const weekMax = slots.reduce((m, s, i) => (i >= 1 && s.movable && weekMonday(s.iso) === weekMonday(slots[heavy].iso) ? Math.max(m, s.load) : m), 0);
      if (slots[heavy].load < HARD_MIN || slots[heavy].load < weekMax * HARD_SHARE) continue;

      // Solo si esa sesión te pilla peor de lo normal para ese día de la semana (o, sin referencia, cansado de verdad).
      const typicalHeavy = typical[weekdayOf(slots[heavy].iso)] ?? null;
      const worse = typicalHeavy !== null ? before[heavy] <= typicalHeavy - ANOMALY_DROP : before[heavy] <= ENERGY_LOW;
      if (!worse) continue;

      const afterLoads = loads.slice();
      afterLoads[a] = B.load;
      afterLoads[b] = A.load;
      const after = simulateEnergy(start, afterLoads);
      const keyGain = after[other] - before[heavy];
      const avgGain = (weighted(after, afterLoads) - baseScore) / totalLoad;
      if (keyGain < (restMove ? MIN_REST_MOVE_GAIN : MIN_SWAP_GAIN) || avgGain < MIN_AVG_GAIN) continue;

      // Ninguna otra sesión de la semana sale perdiendo mucho.
      let hurt = false;
      for (let i = 1; i < slots.length && !hurt; i++) {
        if (afterLoads[i] <= 0 || i === other) continue;
        if (after[i] < before[i] - MAX_OTHER_LOSS) hurt = true;
      }
      if (hurt) continue;

      const swapped = slots.slice();
      swapped[a] = { ...A, families: B.families, light: B.light };
      swapped[b] = { ...B, families: A.families, light: A.light };
      if (adjacentConflicts(swapped) > baseConflicts) continue;
      found.push({ heavy, other, restMove, keyGain, avgGain, before, after, afterLoads, typicalHeavy });
    }
  }
  // La mejor primero; a igualdad, el cambio más corto y el que no toca los días de descanso.
  return found.sort(
    (x, y) => y.keyGain + y.avgGain - (x.keyGain + x.avgGain) || Math.abs(x.heavy - x.other) - Math.abs(y.heavy - y.other) || Number(x.restMove) - Number(y.restMove),
  );
}

// ---------------------------------------------------------------------------------------------
// Del perfil a los números
// ---------------------------------------------------------------------------------------------

export interface WeekMoveDay {
  iso: string;
  /** Esfuerzo previsto del día (0 = descanso), antes y después del cambio. */
  loadBefore: number;
  loadAfter: number;
  /** La energía (0-100) con que llegas a ese día, antes y después del cambio. */
  energyBefore: number;
  energyAfter: number;
  /** Cómo se llama la sesión del día antes y después («Deadlift», «descanso»). */
  labelBefore: string;
  labelAfter: string;
  changed: boolean;
}

export interface WeekMoveProposal {
  /** El lunes de la semana del cambio: una propuesta por semana. */
  weekKey: string;
  from: string;
  to: string;
  /** true: las dos tenían sesión y se intercambian; false: la de `from` pasa a un día de descanso. */
  swap: boolean;
  /** La sesión más dura de las dos, que es la que se beneficia («Deadlift»). */
  sessionLabel: string;
  energyFrom: number;
  energyTo: number;
  gain: number;
  /** Lo normal para ti ese día de la semana, si se sabe. */
  typical: number | null;
  /** Los días que quedan de esa semana, de hoy en adelante. */
  days: WeekMoveDay[];
  reasons: string[];
  plan: MovePlan;
  weekPlan: WeekPlan;
}

/** Familias de trabajo pesado: dos días seguidos de la misma no se juntan. */
const FAMILY: Partial<Record<MovementPattern, Family>> = {
  squat: 'piernas',
  hinge: 'piernas',
  lunge: 'piernas',
  horizontalPush: 'empuje',
  verticalPush: 'empuje',
  horizontalPull: 'tiron',
  verticalPull: 'tiron',
};

/** Lo que carga de verdad la sesión: las familias de sus bloques de fuerza y halterofilia (no del calentamiento, el WOD ni el accesorio). */
function heavyFamilies(session: DailySession): Family[] {
  const out = new Set<Family>();
  if (session.isRestDay) return [];
  for (const b of session.blocks) {
    if (b.block !== 'strength' && b.block !== 'oly') continue;
    const m = getMovementById(b.movementId);
    if (!m) continue;
    for (const p of [m.pattern, ...(m.alsoPatterns ?? [])]) {
      const f = FAMILY[p];
      if (f) out.add(f);
    }
  }
  return [...out];
}

/** Lo que el esfuerzo previsto (escala de la sesión) pesa en la escala de la curva de forma: tus sesiones reales suelen costar un poco más que su RPE × duración. */
function loadScale(history: SessionHistoryEntry[], todayIso: string): number {
  const from = addDaysIso(todayIso, -27);
  let eff = 0;
  let raw = 0;
  for (const e of history) {
    if (e.date < from || e.date > todayIso) continue;
    const s = dayStrain(e);
    if (s === null || s <= 0) continue;
    eff += effectiveLoad(e);
    raw += s;
  }
  return raw > 0 ? Math.max(0.8, Math.min(1.5, eff / raw)) : 1;
}

const DESCANSO = 'descanso';
const WEEKDAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Busca el cambio que más energía le da a tu sesión más dura; null si no hay nada claro que proponer.
 * `label` da el nombre corto de una sesión («Deadlift»); lo pone la pantalla (igual que en `planWeekChange`).
 */
export function proposeWeekMove(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  todayIso: string,
  label: (s: DailySession) => string,
): WeekMoveProposal | null {
  // La curva tiene que ser fiable, y con competición a la vista manda el taper.
  const series = buildFormSeries({ history, todayIso, pastDays: 28 });
  if (!series.ready || series.todayIndex < 0) return null;
  if (resolveCompetitionDay(profile, history, new Date(`${todayIso}T12:00:00`))) return null;
  const start = series.points[series.todayIndex];

  // Lo normal para ti: la energía media al empezar cada día de la semana en las últimas semanas (sin contar hoy).
  const samples: number[][] = Array.from({ length: 7 }, () => []);
  for (const p of series.points) if (!p.future && p.iso < todayIso) samples[weekdayOf(p.iso)].push(energyOf(p.form, p.fitness));
  const typical = samples.map((s) => (s.length >= MIN_TYPICAL_SAMPLES ? Math.round(s.reduce((a, v) => a + v, 0) / s.length) : null));

  const scale = loadScale(history, todayIso);
  const done = new Map(history.filter((h) => h.date <= todayIso).map((h) => [h.date, h]));
  const sessions: DailySession[] = [];
  const slots: WeekSlot[] = [];
  for (let i = 0; i <= HORIZON; i++) {
    const iso = addDaysIso(todayIso, i);
    const session = sessionFor(profile, history, iso);
    if (session.competition) return null;
    const marked = isRestMarked(profile.restDates, iso);
    const structured = hasActiveTrainingStructure(profile, iso);
    const trained = done.get(iso);
    const planned = !marked && !session.isRestDay && session.source !== 'custom' ? estimatePlannedStrain(session, history) : null;
    sessions.push(session);
    slots.push({
      iso,
      load: trained ? effectiveLoad(trained) : planned ? planned.strain * scale : 0,
      movable: i >= 1 && !trained && !marked && structured && planned !== null,
      restSlot: i >= 1 && !trained && !marked && structured && session.isRestDay,
      families: heavyFamilies(session),
      light: session.dayIntensity === 'baja',
    });
  }

  for (const c of pickWeekMoves({ start, slots, typical }).slice(0, MAX_TRIES)) {
    const from = slots[c.heavy].iso;
    const to = slots[c.other].iso;
    const plan = planMove(profile, history, { from, to }, todayIso);
    if (typeof plan === 'string') continue;
    const weekKey = weekMonday(from);
    const days: WeekMoveDay[] = [];
    slots.forEach((s, i) => {
      if (weekMonday(s.iso) !== weekKey) return;
      const moved = i === c.heavy || i === c.other;
      const nameOf = (x: DailySession) => (x.isRestDay ? DESCANSO : label(x));
      days.push({
        iso: s.iso,
        loadBefore: Math.round(slots[i].load),
        loadAfter: Math.round(c.afterLoads[i]),
        energyBefore: c.before[i],
        energyAfter: c.after[i],
        labelBefore: nameOf(sessions[i]),
        labelAfter: moved ? nameOf(sessions[i === c.heavy ? c.other : c.heavy]) : nameOf(sessions[i]),
        changed: moved,
      });
    });
    return {
      weekKey,
      from,
      to,
      swap: plan.swap,
      sessionLabel: label(sessions[c.heavy]),
      energyFrom: c.before[c.heavy],
      energyTo: c.after[c.other],
      gain: c.keyGain,
      typical: c.typicalHeavy,
      days,
      reasons: explain(c, slots, todayIso),
      plan,
      weekPlan: weekPlanFromMove(plan, profile, label),
    };
  }
  return null;
}

/** Por qué mejora, en palabras del atleta: cuánto se aparta de lo normal, qué pasa el día antes y que no se toca nada que no se deba. */
function explain(c: WeekPick, slots: WeekSlot[], todayIso: string): string[] {
  const out: string[] = [];
  const name = (i: number) => dayLabel(slots[i].iso, todayIso);
  if (c.typicalHeavy !== null) {
    out.push(`${cap(name(c.heavy))} llegarías con ${c.before[c.heavy]} de energía, ${c.typicalHeavy - c.before[c.heavy]} menos que un ${WEEKDAY_NAME[weekdayOf(slots[c.heavy].iso)]} normal para ti (${c.typicalHeavy}).`);
  } else {
    out.push(`${cap(name(c.heavy))} llegarías con ${c.before[c.heavy]} de energía: cansado para una sesión así.`);
  }
  const prevNew = c.afterLoads[c.other - 1] ?? 0;
  const prevOld = slots[c.heavy - 1]?.load ?? 0;
  if (prevNew <= 5) out.push(`El día antes no entrenas: ${name(c.other)} llegas con la fatiga más baja (${c.after[c.other]}).`);
  else if (prevOld >= 40 && prevNew < prevOld - 10) out.push(`El día antes tienes una sesión más suave, y ${name(c.other)} llegas con ${c.after[c.other]}.`);
  else out.push(`${cap(name(c.other))} llegas con ${c.after[c.other]}: la fatiga de los días anteriores pesa menos.`);
  out.push('No toca lo ya entrenado, la competición ni los descansos que marcaste.');
  return out;
}

/** Cuántos días hay entre dos fechas. */
export const daysBetween = (a: string, b: string) => isoDay(b) - isoDay(a);
