import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { withExtraLoad } from './companionLoad';
import { dayBonuses } from './energyBonus';
import { computeReadinessScore, type ReadinessScore } from './readinessScore';

/**
 * LA forma de calcular la preparación de un día. Todo lo que enseña o decide con esa nota (Dashboard, tarjeta de la mañana, semáforo, objetivo
 * de esfuerzo, gráficas, taper, descarga por tendencia) pasa por aquí, para que den la misma cifra con los mismos datos.
 *
 * La carga cuenta todo lo que se ha entrenado: la sesión, el programa de fuerza (Texas) y los entrenos añadidos a mano, con su RPE y su duración
 * (`withExtraLoad` con `orphans`). Se puede llamar con el historial crudo o con uno ya sumado: sumarlo otra vez no duplica nada.
 */

/**
 * El historial con la carga de todos los días de entreno. Con `before`, solo los días anteriores a esa fecha (lo que se sabía esa mañana).
 * Es para calcular carga y preparación: las pantallas que cuentan sesiones o días siguen con el historial crudo.
 */
export function loadHistoryFor(profile: Pick<AthleteProfile, 'companionLog' | 'workouts'>, history: SessionHistoryEntry[], opts: { before?: string } = {}): SessionHistoryEntry[] {
  const all = withExtraLoad(profile, history, { orphans: true });
  return opts.before ? all.filter((h) => h.date < opts.before!) : all;
}

/** La preparación de `date`: la energía de esa mañana. Lo que se entrene ese día no la cambia. */
export function readinessAt(profile: AthleteProfile, history: SessionHistoryEntry[], date: Date): ReadinessScore {
  return computeReadinessScore({
    readinessLog: profile.readinessLog,
    hrvHistory: profile.hrvHistory,
    history: loadHistoryFor(profile, history),
    painFlags: profile.painFlags,
    nightLog: profile.nightLog,
    bonus: dayBonuses(profile, history),
    today: date,
  });
}
