import type { PainFlag } from '../../data/athlete/types';
import { formTitle, formToday, pointEnergy, pointState } from '../../engine/formCurve';
import { formatSleep } from '../../engine/habits';
import type { AcwrResult } from '../../engine/loadMetrics';
import { getActivePainFlags, PAIN_AREA_LABEL } from '../../engine/painFlags';
import { formRowNote, type FormModel } from './formModel';
import { loadPercent } from './loadWords';

/**
 * La tarjeta «Tu forma» del Resumen: arriba tu estado de energía, en medio tres cifras que no están en los aros (sueño, carga y molestias) y abajo
 * una línea con lo que viene o lo que hay que vigilar. Puro: lo pinta `FormCard`.
 */
export interface FormCardFigure {
  value: string;
  label: string;
  /** Pide atención (en ámbar). */
  warn?: boolean;
}

export interface FormCardModel {
  /** Tu energía ese día; null sin historial suficiente. */
  state: { title: string; energy: number; tired: boolean } | null;
  figures: FormCardFigure[];
  line: { text: string; icon: 'window' | 'pain' | 'info'; warn?: boolean };
}

export function buildFormCard({ model, acwr, painFlags, dayIso }: { model: FormModel; acwr: AcwrResult; painFlags: PainFlag[] | undefined; dayIso: string }): FormCardModel {
  const { plan, todayIso } = model;
  const isToday = dayIso === todayIso;
  const point = plan.points.find((p) => p.iso === dayIso);
  const state = plan.ready && point ? { title: formTitle(pointState(point)), energy: pointEnergy(point), tired: pointState(point) === 'cargado' } : null;

  const sleep: FormCardFigure =
    point?.sleepNights !== undefined && point.sleepAvg !== undefined ? { value: formatSleep(point.sleepAvg), label: 'sueño medio' } : { value: '—', label: 'sueño sin anotar' };
  const { value, word } = loadPercent(acwr);
  const load: FormCardFigure = { value, label: word ? `carga ${word.toLowerCase()}` : 'carga' };
  const flags = getActivePainFlags(painFlags, dayIso);
  const pain: FormCardFigure =
    flags.length > 0
      ? { value: `${PAIN_AREA_LABEL[flags[0].area]}${flags.length > 1 ? ` +${flags.length - 1}` : ''}`, label: flags.length > 1 ? 'molestias activas' : 'molestia activa', warn: true }
      : { value: 'Ninguna', label: 'molestias' };

  let line: FormCardModel['line'];
  if (flags.length > 0) line = { icon: 'pain', warn: true, text: isToday ? 'El coach tiene en cuenta tu molestia' : 'Ese día tenías una molestia activa' };
  else if (!plan.ready) line = { icon: 'info', text: `Aún poco historial: ${plan.sessions} sesiones registradas` };
  else if (!isToday) line = { icon: 'info', text: 'Así llegabas ese día' };
  else {
    const note = formRowNote(model);
    line = note ? { icon: 'window', text: note } : { icon: 'info', text: formToday(plan)?.sentence ?? 'Toca para ver el detalle' };
  }

  return { state, figures: [sleep, load, pain], line };
}
