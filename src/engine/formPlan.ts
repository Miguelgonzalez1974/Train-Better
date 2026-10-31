/**
 * La carga que traería tu plan en las próximas semanas, para la previsión de la curva de forma (ver `formCurve.ts`).
 *
 * En vez de repetir la media de lo que has hecho, mira tu calendario: qué días entrenas (`getDayPlan`), si hay día de recuperación activa,
 * en qué semana del macrociclo caerá cada día (la descarga recorta, el pico sube un poco) y, si hay competición cerca, su cuenta atrás
 * (taper, activación, víspera, la competición y la recuperación de después). El volumen de una semana normal es el de tus últimas cuatro
 * semanas, repartido en los días de entreno del plan. Es una ESTIMACIÓN: no genera las sesiones, solo su esfuerzo.
 */
import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { dayStrain } from './strain';
import { addDays, planLoads, steadyLoads, type CompetitionWindow } from './formCurve';
import { getActiveMacrocycle, getDayPlan, getWeekdayIndex, resolveMacrocyclePhase } from './periodization';

/** Por qué un día tiene la carga que tiene: lo que el atleta entiende como causa de una ventana. */
export type LoadTag = 'taper' | 'competicion' | 'recuperacion' | 'descarga';

export interface PlanProjection {
  /** Carga prevista de cada día que viene (mañana primero). */
  loads: number[];
  /** Lo que explica cada día: taper, competición, recuperación tras competir o semana de descarga (null = día normal). */
  tags: (LoadTag | null)[];
}

/** Cuánto pesa cada semana del macrociclo frente a una semana normal: acumulación, intensificación, pico y descarga. */
const PHASE_FACTOR = { 1: 0.95, 2: 1, 3: 1.05, 4: 0.6 } as const;
/** El día de recuperación activa (cardio suave) cuesta bastante menos que uno de entreno. */
const RECOVERY_DAY_FACTOR = 0.3;
const FALLBACK_TRAINING_LOAD = 50;
const POST_COMPETITION_DAYS = 3;

const isoToDate = (iso: string) => new Date(`${iso}T12:00:00`);
const dayDiff = (fromIso: string, toIso: string) => Math.round((isoToDate(toIso).getTime() - isoToDate(fromIso).getTime()) / 86_400_000);

/**
 * La carga de una semana tuya: el esfuerzo total de las últimas cuatro semanas entre cuatro, o null si no hay nada que medir.
 * La previsión mantiene este volumen y lo reparte en los días de entreno de tu plan, así que si entrenas más días de los que dice el
 * plan, o más duro, la previsión no se queda corta.
 */
export function typicalWeeklyLoad(history: SessionHistoryEntry[], todayIso: string): number | null {
  const from = addDays(todayIso, -27);
  const loads = new Map<string, number>();
  for (const e of history) if (e.date >= from && e.date <= todayIso) loads.set(e.date, Math.max(loads.get(e.date) ?? 0, dayStrain(e) ?? 0));
  const total = [...loads.values()].reduce((s, v) => s + v, 0);
  return total > 0 ? total / 4 : null;
}

/** Cuántos "días de entreno" pesa una semana de tu plan: cada día de entreno 1 y el de recuperación activa menos. */
function weekUnits(trainingDaysPerWeek: AthleteProfile['trainingDaysPerWeek']): number {
  let units = 0;
  for (let wd = 0; wd < 7; wd++) {
    const plan = getDayPlan(wd, trainingDaysPerWeek);
    if (plan.isTrainingDay) units += plan.isRecoveryDay ? RECOVERY_DAY_FACTOR : 1;
  }
  return units;
}

/** La etiqueta que le toca a un día por la cuenta atrás de la competición (la misma que usa `planLoads` para recortar). */
export function competitionTag(iso: string, comp: CompetitionWindow | null): LoadTag | null {
  if (!comp) return null;
  if (iso >= comp.eventStart && iso <= comp.eventEnd) return 'competicion';
  if (iso > comp.eventEnd) return dayDiff(comp.eventEnd, iso) <= POST_COMPETITION_DAYS ? 'recuperacion' : null;
  const toStart = dayDiff(iso, comp.eventStart);
  return toStart >= 1 && toStart <= 7 ? 'taper' : null;
}

export function projectPlan(opts: {
  profile: Pick<AthleteProfile, 'macrocycles' | 'trainingDaysPerWeek'>;
  history: SessionHistoryEntry[];
  todayIso: string;
  days: number;
  comp: CompetitionWindow | null;
  taperScale: number;
}): PlanProjection {
  const { profile, history, todayIso, days, comp, taperScale } = opts;
  const macro = getActiveMacrocycle(profile.macrocycles ?? [], todayIso);
  const units = weekUnits(profile.trainingDaysPerWeek);
  const perUnit = units > 0 ? (typicalWeeklyLoad(history, todayIso) ?? FALLBACK_TRAINING_LOAD * units) / units : 0;

  const base: number[] = [];
  const weekTag: (LoadTag | null)[] = [];
  if (!macro) {
    // Sin macrociclo no hay semanas que mirar: se repite tu semana de siempre.
    base.push(...steadyLoads(history, todayIso, days));
    weekTag.push(...base.map(() => null));
  } else {
    for (let i = 1; i <= days; i++) {
      const iso = addDays(todayIso, i);
      const date = isoToDate(iso);
      const plan = getDayPlan(getWeekdayIndex(date), profile.trainingDaysPerWeek);
      const phase = resolveMacrocyclePhase(macro, date).phaseIndex;
      const dayLoad = plan.isTrainingDay ? (plan.isRecoveryDay ? RECOVERY_DAY_FACTOR : 1) * perUnit : 0;
      base.push(Math.round(dayLoad * PHASE_FACTOR[phase]));
      weekTag.push(phase === 4 && iso <= macro.endDate ? 'descarga' : null);
    }
  }

  const loads = planLoads(base, todayIso, comp, taperScale);
  const tags = loads.map((_, i) => competitionTag(addDays(todayIso, i + 1), comp) ?? weekTag[i]);
  return { loads, tags };
}
