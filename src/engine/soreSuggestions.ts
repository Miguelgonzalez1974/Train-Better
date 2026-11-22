import type { SessionHistoryEntry, SoreZoneId } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { MovementPattern } from '../data/movements/types';
import { SORE_ZONE_AREA, type SoreArea } from './morningCheckIn';

/**
 * Las agujetas que se esperan hoy por lo que entrenaste ayer (o anteayer): de los movimientos de la sesión sale qué zonas del cuerpo se
 * cargaron. Solo sugiere: la zona no se marca hasta que la tocas en el check-in, y nada de esto llega al motor.
 */

/** Qué zona carga cada patrón de movimiento y cómo se le llama en la frase («por la sentadilla»). */
const PATTERN_AREA: Partial<Record<MovementPattern, { area: SoreArea; word: string }>> = {
  squat: { area: 'muslo', word: 'sentadilla' },
  lunge: { area: 'muslo', word: 'zancadas' },
  jump: { area: 'gemelo', word: 'saltos' },
  hinge: { area: 'lumbar', word: 'peso muerto' },
  verticalPush: { area: 'hombro', word: 'empuje por encima de la cabeza' },
  olyLift: { area: 'hombro', word: 'halterofilia' },
  verticalPull: { area: 'hombro', word: 'dominadas' },
  horizontalPush: { area: 'hombro', word: 'press' },
  horizontalPull: { area: 'codo', word: 'remos' },
};

export const AREA_LABEL: Record<SoreArea, string> = { cuello: 'Cuello', hombro: 'Hombros', codo: 'Codos', lumbar: 'Zona lumbar', cadera: 'Caderas', muslo: 'Piernas', gemelo: 'Gemelos' };

/** Las zonas de la silueta de un área (izquierda y derecha). */
export function zonesOfArea(area: SoreArea): SoreZoneId[] {
  return (Object.keys(SORE_ZONE_AREA) as SoreZoneId[]).filter((id) => SORE_ZONE_AREA[id] === area);
}

export interface SoreSuggestion {
  area: SoreArea;
  label: string;
  /** «por sentadilla de ayer». */
  why: string;
}

const isoMinus = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Hasta tres áreas sugeridas, con lo entrenado ayer primero y anteayer después; vacío si no entrenaste. */
export function suggestSoreAreas(history: SessionHistoryEntry[], todayIso: string, max = 3): SoreSuggestion[] {
  const out: SoreSuggestion[] = [];
  for (const back of [1, 2]) {
    const date = isoMinus(todayIso, back);
    const when = back === 1 ? 'ayer' : 'anteayer';
    for (const entry of history.filter((h) => h.date === date)) {
      for (const id of entry.movementIds) {
        const found = PATTERN_AREA[getMovementById(id)?.pattern as MovementPattern];
        if (!found || out.some((s) => s.area === found.area)) continue;
        out.push({ area: found.area, label: AREA_LABEL[found.area], why: `por ${found.word} de ${when}` });
      }
    }
  }
  return out.slice(0, max);
}
