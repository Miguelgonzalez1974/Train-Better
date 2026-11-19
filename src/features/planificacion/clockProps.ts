import type { DailySession, SessionHistoryEntry, WodSplitsRecord } from '../../data/athlete/types';
import { wodCapFor, type WodCap } from '../../engine/wodCap';
import { pickGhost, wodTrackInfo } from '../../engine/wodGhost';
import { paceTip } from '../../engine/wodPace';
import { getWodParts, getWodScoreType } from '../../engine/wodScoring';
import type { TrackConfig } from './TrainingTimer';

/** Un día suave no empuja a correr contra el fantasma: descarga, intensidad baja o semáforo ámbar o rojo. */
export function isSoftDay(session: DailySession): boolean {
  return Boolean(session.deloadReason) || session.dayLight?.color === 'ambar' || session.dayLight?.color === 'rojo' || session.dayIntensity === 'baja';
}

/**
 * Lo que necesita el reloj de entreno de un día: el límite de tiempo de cada parte del WOD y el modo fantasma (tramos y fantasma). Sirve igual
 * para la sesión de hoy y para la vista previa de otro día, que usa el reloj para ver cómo queda.
 */
export function clockPropsFor(
  session: DailySession,
  history: SessionHistoryEntry[],
  ghosts: WodSplitsRecord[],
): { caps: Record<1 | 2, WodCap | null>; track: Partial<Record<1 | 2, TrackConfig | null>> } {
  const caps: Record<1 | 2, WodCap | null> = { 1: wodCapFor(session, 1), 2: wodCapFor(session, 2) };
  const track: Partial<Record<1 | 2, TrackConfig | null>> = {};
  for (const part of getWodParts(session)) {
    const info = wodTrackInfo(session, part, getWodScoreType(session, part), caps[part]);
    track[part] = info
      ? {
          info,
          ghostFor: (mode) => pickGhost({ info, mode, todayIso: session.date, history, ghosts }),
          ghostDefaultOff: isSoftDay(session),
          paceFor: () => paceTip({ info, todayIso: session.date, history, ghosts }),
        }
      : null;
  }
  return { caps, track };
}
