import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { resolveCompetitionDay } from './taperPlan';
import { getActiveMacrocycle, resolveMacrocyclePhase } from './periodization';

/**
 * El programa de fuerza que convive con el macro sigue el momento del macro: en la semana de descarga baja, en el taper de una competición recorta series
 * y mantiene el peso, y en la víspera, la activación y el día de competición casi sobra. Es un aviso y un recorte, nunca un bloqueo: el atleta decide si
 * la hace, la aplaza o la salta. Puro.
 */

export interface CompanionPhaseAdjust {
  /** Factor sobre las series de los levantamientos de volumen (la marca del viernes no se toca). 1 = sin cambio. */
  setScale: number;
  /** Factor sobre el peso de volumen y recuperación. 1 = sin cambio. */
  loadScale: number;
  /** Qué dice la tarjeta del programa por este motivo ('' = nada). */
  note: string;
}

const NONE: CompanionPhaseAdjust = { setScale: 1, loadScale: 1, note: '' };

export function companionPhaseAdjust(profile: AthleteProfile, history: SessionHistoryEntry[], date: Date): CompanionPhaseAdjust {
  const comp = resolveCompetitionDay(profile, history, date, profile.goals);
  if (comp) {
    switch (comp.phase) {
      case 'evento':
      case 'vispera':
      case 'activacion':
        return { setScale: 0.4, loadScale: 0.9, note: `${comp.label}: hoy el programa sobra. Si lo haces, que sea ligero; puedes aplazarlo o saltarlo.` };
      case 'post':
        return { setScale: 0.6, loadScale: 0.9, note: 'Tras la competición el programa va ligero unos días: menos series y algo menos de peso.' };
      case 'taper': {
        if (comp.recoverySession) return { setScale: 0.4, loadScale: 0.9, note: `${comp.label}: hoy toca descanso activo; el programa, si lo haces, que sea ligero.` };
        const cut = Math.round((1 - comp.volumeScale) * 100);
        return { setScale: comp.volumeScale, loadScale: 1, note: `${comp.label}: el programa baja un ${cut} % las series y mantiene el peso, para llegar fresco a la competición.` };
      }
      default:
        break; // construcción y pico: el programa sigue como está
    }
  }
  const macro = getActiveMacrocycle(profile.macrocycles, localIso(date));
  if (macro && resolveMacrocyclePhase(macro, date).phaseIndex === 4) {
    return { setScale: 0.6, loadScale: 0.95, note: 'Semana de descarga del macro: el programa también baja (menos series y algo menos de peso).' };
  }
  return NONE;
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
