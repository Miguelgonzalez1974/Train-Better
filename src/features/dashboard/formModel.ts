import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { TAPER_PARAMS } from '../../engine/competition';
import { resolveCompetitionDay } from '../../engine/taperPlan';
import {
  buildFormSeries,
  planLoads,
  projectionDays,
  steadyLoads,
  steadyWithCompetition,
  type CompetitionWindow,
  type FormSeries,
} from '../../engine/formCurve';

export interface FormModel {
  /** La competición que cuenta (28 días antes hasta 3 después), si la hay. */
  comp: CompetitionWindow | null;
  /** Lo que traería tu plan (con el taper si hay competición). */
  plan: FormSeries;
  /** Lo que pasaría sin bajar el ritmo; solo se enseña como alternativa si hay competición. */
  steady: FormSeries;
  /** ¿Hay dos escenarios que comparar? */
  hasScenarios: boolean;
}

/** Todo lo que necesitan la fila "Tu forma" y su ventana: las dos series (plan y sin bajar el ritmo) y la competición. */
export function buildFormModel(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): FormModel {
  const day = resolveCompetitionDay(profile, history, new Date(`${todayIso}T12:00:00`));
  const comp: CompetitionWindow | null = day && day.phase !== 'post' ? { eventStart: day.eventStart, eventEnd: day.eventEnd } : null;
  const days = projectionDays(todayIso, comp);
  const base = steadyLoads(history, todayIso, days);
  const scale = TAPER_PARAMS[day?.taperKind ?? 'estandar'].volumeScale;
  const plan = buildFormSeries({ history, todayIso, future: planLoads(base, todayIso, comp, scale) });
  const steady = comp ? buildFormSeries({ history, todayIso, future: steadyWithCompetition(base, todayIso, comp) }) : plan;
  return { comp, plan, steady, hasScenarios: comp !== null };
}
