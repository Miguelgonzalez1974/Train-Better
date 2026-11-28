import type { AthleteProfile, DailySession, PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import { computeReferenceLevel, ZONES, type ReferenceLevel } from './levelReference';
import { addDaysIso } from './periodization';

/**
 * El siguiente salto de «Tu nivel» (frente a referencias): de todas tus marcas, la que menos tiene que mejorar, en proporción, para subir de
 * escalón. También qué días toca ese levantamiento y cuándo no es momento de probar una marca. Puro: lo pinta la tarjeta del Resumen.
 */
export type StepKey = 'backSquat' | 'deadlift' | 'benchPress' | 'snatch' | 'cleanAndJerk' | 'fran' | 'run5k';

export interface NextStep {
  key: StepKey;
  kind: 'kg' | 'time';
  /** Lo que tienes: kilos o segundos. */
  current: number;
  /** A lo que apuntar: kilos que se pueden cargar (de 2,5 en 2,5) o los segundos que pide el escalón. */
  target: number;
  /** Lo que falta de verdad para el escalón: kilos (al medio kilo, hacia arriba) o segundos. */
  gap: number;
  zoneName: string;
}

/** El salto de discos más pequeño que se da por hecho en la barra. */
const LOADABLE_KG = 2.5;
/** Un récord que subió de escalón se celebra estos días (contando el siguiente al récord). */
export const LEVEL_UP_DAYS = 3;
const LIFTS: StepKey[] = ['backSquat', 'deadlift', 'benchPress', 'snatch', 'cleanAndJerk'];

export const isLiftStep = (key: StepKey): key is Extract<StepKey, keyof PersonalRecords> => LIFTS.includes(key);

/** Todos los saltos pendientes, del más cercano al más lejano. */
export function nextSteps(level: ReferenceLevel): NextStep[] {
  const found: { step: NextStep; effort: number }[] = [];
  for (const mark of level.categories.flatMap((c) => c.marks)) {
    const goal = mark.goal;
    if (!goal || !(goal.current > 0)) continue;
    const kg = goal.kind === 'kg';
    const target = kg ? Math.ceil(goal.cut / LOADABLE_KG - 1e-9) * LOADABLE_KG : Math.floor(goal.cut);
    const gap = kg ? Math.max(0.5, Math.ceil((goal.cut - goal.current) * 2 - 1e-9) / 2) : Math.max(1, Math.ceil(goal.current - goal.cut));
    found.push({
      step: { key: mark.key as StepKey, kind: goal.kind, current: goal.current, target, gap, zoneName: ZONES[goal.zone] },
      effort: Math.abs(goal.cut - goal.current) / goal.current,
    });
  }
  return found.sort((a, b) => a.effort - b.effort).map((f) => f.step);
}

export interface LevelUp {
  key: StepKey;
  zoneName: string;
  date: string;
}

/** Un récord de estos últimos días que te subió de escalón (con tu peso y tu edad de hoy), el más reciente. */
export function recentLevelUp(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date, todayIso: string): LevelUp | null {
  const since = addDaysIso(todayIso, -LEVEL_UP_DAYS);
  const zoneOf = (p: AthleteProfile, key: StepKey) =>
    computeReferenceLevel({ profile: p, history, today })
      .categories.flatMap((c) => c.marks)
      .find((m) => m.key === key)?.placement?.zone;
  let found: LevelUp | null = null;
  for (const key of LIFTS.filter(isLiftStep)) {
    const mine = (profile.prLog ?? []).filter((e) => e.key === key && e.date <= todayIso).sort((a, b) => a.date.localeCompare(b.date));
    const before = Math.max(0, ...mine.filter((e) => e.date < since).map((e) => e.kg));
    const recent = mine.filter((e) => e.date >= since && e.kg > before);
    const now = profile.prs[key];
    // Sin una marca anterior no hay subida: la primera que apuntas es el punto de partida. Y si la has corregido a la baja, tampoco.
    if (before <= 0 || recent.length === 0 || now <= before) continue;
    const zone = zoneOf(profile, key);
    const previous = zoneOf({ ...profile, prs: { ...profile.prs, [key]: before } }, key);
    if (zone === undefined || previous === undefined || zone <= previous) continue;
    const date = recent[recent.length - 1].date;
    if (!found || date > found.date) found = { key, zoneName: ZONES[zone], date };
  }
  return found;
}

const NO_PROBE_PHASES = new Set(['pico', 'taper', 'activacion', 'vispera', 'evento', 'post']);

/** Semanas en las que no se anima a probar marca: descarga o competición encima. */
export function isNoProbeSession(session: DailySession): boolean {
  return Boolean(session.deloadReason) || session.mesocycleWeek === 4 || Boolean(session.competition && NO_PROBE_PHASES.has(session.competition.phase));
}

/** Así empieza la nota del toque ligero que cierra un día combinado (3 singles al ~72 %): no es un día de ese levantamiento. */
export const COMBINED_TAIL_PREFIX = 'Día combinado';

const LIFT_MOVEMENT: Record<Extract<StepKey, keyof PersonalRecords>, string> = {
  backSquat: 'back-squat',
  deadlift: 'deadlift',
  benchPress: 'bench-press',
  snatch: 'snatch',
  cleanAndJerk: 'clean-and-jerk',
};

/** Los bloques de ese día con el levantamiento completo de trabajo: ni un complejo ni el toque ligero del final de un día combinado. */
function liftBlocks(session: DailySession, key: StepKey) {
  if (!isLiftStep(key)) return [];
  return session.blocks.filter((b) => (b.block === 'strength' || b.block === 'oly') && b.movementId === LIFT_MOVEMENT[key] && !b.complex && !b.subgroup && !b.notes?.startsWith(COMBINED_TAIL_PREFIX));
}

/** Ese día toca ese levantamiento y tiene sentido intentarlo: en un test de máximos siempre; si no, fuera de descarga y de competición. */
export function isProbeDay(session: DailySession, key: StepKey): boolean {
  const blocks = liftBlocks(session, key);
  return blocks.length > 0 && (blocks.some((b) => b.format === 'Test 1RM') || !isNoProbeSession(session));
}
