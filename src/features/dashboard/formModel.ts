import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { TAPER_PARAMS } from '../../engine/competition';
import { resolveCompetitionDay } from '../../engine/taperPlan';
import { FORECAST_DAYS, addDays, buildFormSeries, formWindows, type CompetitionWindow, type FormSeries, type FormWindow } from '../../engine/formCurve';
import { projectPlan, type LoadTag } from '../../engine/formPlan';

export interface FormModel {
  todayIso: string;
  /** La competición que cuenta (28 días antes hasta 3 después), si la hay. */
  comp: CompetitionWindow | null;
  /** Lo que traería tu plan: tu calendario, las descargas del macrociclo y el taper si hay competición. */
  plan: FormSeries;
  /** Las próximas ventanas con el plan (las que acaban después de hoy), de la más cercana a la más lejana. */
  windows: FormWindow[];
  /** Todas las ventanas de la curva, también las ya pasadas (para dibujarlas). */
  allWindows: FormWindow[];
  /** Qué explica la carga de cada día que viene (taper, competición, recuperación, descarga). */
  tags: Map<string, LoadTag>;
}

/** Todo lo que necesitan la fila "Tu forma" y su ventana: el plan, las ventanas y la competición. */
export function buildFormModel(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): FormModel {
  const day = resolveCompetitionDay(profile, history, new Date(`${todayIso}T12:00:00`));
  const comp: CompetitionWindow | null = day && day.phase !== 'post' ? { eventStart: day.eventStart, eventEnd: day.eventEnd } : null;
  const taperScale = TAPER_PARAMS[day?.taperKind ?? 'estandar'].volumeScale;
  const projection = projectPlan({ profile, history, todayIso, days: FORECAST_DAYS, comp, taperScale });
  const plan = buildFormSeries({ history, todayIso, future: projection.loads });
  const tags = new Map<string, LoadTag>();
  projection.tags.forEach((t, i) => t && tags.set(addDays(todayIso, i + 1), t));
  return { todayIso, comp, plan, windows: formWindows(plan, todayIso, comp?.eventStart), allWindows: formWindows(plan, undefined, comp?.eventStart), tags };
}

/** "jue 5 nov". */
export const shortDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace(',', '').replace('.', '');

const daysBetween = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);

/**
 * La línea que acompaña a "Tu forma" en el Resumen: si hoy estás en ventana, hasta cuándo dura; si no, cuándo se abre la próxima.
 * null si no hay ninguna ventana a la vista (entonces la fila enseña su frase de siempre).
 */
export function formRowNote(model: FormModel): string | null {
  const { todayIso, allWindows, windows } = model;
  const open = allWindows.find((w) => w.start <= todayIso && w.end >= todayIso);
  if (open) return open.end === todayIso ? 'Ventana abierta hoy: buen día para apretar' : `Ventana abierta hasta el ${shortDay(open.end)}`;
  const next = windows.find((w) => w.start > todayIso);
  if (!next) return null;
  if (windowCause(next, model).kind === 'competicion') return `Llegas en ventana a la competición · ${shortDay(next.start)}`;
  const days = daysBetween(todayIso, next.start);
  return `Próxima ventana ${days === 1 ? 'mañana' : `en ${days} días`} · ${shortDay(next.start)}`;
}

/** Por qué se abre una ventana, en palabras del atleta: mira las causas de los días justo antes de abrirse y, si no hay, un descanso. */
export function windowCause(w: FormWindow, model: FormModel): { label: string; kind: 'competicion' | 'normal' } {
  const { comp, tags } = model;
  if (comp && w.start <= comp.eventEnd && w.end >= addDays(comp.eventStart, -2) && w.start >= addDays(comp.eventStart, -2)) {
    return { label: 'Competición: llegas fresco gracias al taper', kind: 'competicion' };
  }
  for (let back = 0; back <= 4; back++) {
    const t = tags.get(addDays(w.start, -back));
    if (t === 'recuperacion') return { label: 'Tras recuperarte de la competición', kind: 'normal' };
    if (t === 'descarga') return { label: 'Tras tu semana de descarga', kind: 'normal' };
    if (t === 'taper') return { label: 'Por el taper', kind: 'normal' };
  }
  return { label: 'Tras unos días de menos carga', kind: 'normal' };
}
