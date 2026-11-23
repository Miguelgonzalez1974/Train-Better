import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { withCompanionLoad } from './companionLoad';
import { computeReadinessScore, type ReadinessScore } from './readinessScore';

/**
 * LA forma de calcular la preparación de un día. Todo lo que enseña o decide con esa nota (Dashboard, tarjeta de la mañana, semáforo, objetivo
 * de esfuerzo, gráficas, taper, descarga por tendencia) pasa por aquí, para que den la misma cifra con los mismos datos.
 *
 * La carga cuenta todos los días de entreno: también los que solo hiciste el programa de fuerza (Texas), con su RPE y su duración
 * (`withCompanionLoad` con `orphans`). Se puede llamar con el historial crudo o con uno ya sumado: sumarlo otra vez no duplica nada.
 */

const isoOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * El historial con la carga de todos los días de entreno (macro + programa de fuerza). Con `before`, solo los días anteriores a esa fecha
 * (lo que se sabía esa mañana). Es para calcular carga y preparación: las pantallas que cuentan sesiones o días siguen con el historial crudo.
 */
export function loadHistoryFor(profile: Pick<AthleteProfile, 'companionLog'>, history: SessionHistoryEntry[], opts: { before?: string } = {}): SessionHistoryEntry[] {
  const all = withCompanionLoad(history, profile.companionLog, { orphans: true });
  return opts.before ? all.filter((h) => h.date < opts.before!) : all;
}

/**
 * La preparación de `date`. Con `before`, solo cuenta el historial anterior a ese día (cómo llegabas esa mañana, antes de entrenar); sin él, todo
 * el historial que se pase. `recency` es la prueba que da más peso a los últimos días (ver `RECENCY_WEIGHTS`).
 */
export function readinessAt(profile: AthleteProfile, history: SessionHistoryEntry[], date: Date, opts: { before?: boolean; recency?: boolean } = {}): ReadinessScore {
  return computeReadinessScore({
    readinessLog: profile.readinessLog,
    hrvHistory: profile.hrvHistory,
    history: loadHistoryFor(profile, history, opts.before ? { before: isoOf(date) } : {}),
    setFeedbackLog: profile.setFeedbackLog,
    painFlags: profile.painFlags,
    today: date,
    ...(opts.recency ? { recency: true } : {}),
  });
}
