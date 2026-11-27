/**
 * Las horas de sueño de un check-in y la palabra con la que se resume cómo llegas. De aquí colgaba la antigua curva de forma
 * (supercompensación); la energía de cada día se calcula ahora en un solo sitio, `energy.ts`.
 */
import type { ReadinessCheck } from '../data/athlete/types';

export type FormState = 'ventana' | 'equilibrio' | 'cargado';

/** Si el check-in no lleva las horas, lo que se supone para cada respuesta de sueño. */
const AXIS_HOURS: Record<ReadinessCheck['sleep'], number> = { bien: 8, regular: 6.75, mal: 5.5 };

/** Las horas de una noche: las anotadas o, si no, las que sugiere la respuesta de sueño del check-in. */
export const nightHours = (check: ReadinessCheck): number => check.sleepHours ?? AXIS_HOURS[check.sleep];
