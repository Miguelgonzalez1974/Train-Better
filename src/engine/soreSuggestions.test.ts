import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { suggestSoreAreas, zonesOfArea } from './soreSuggestions';

const entry = (date: string, movementIds: string[]): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds, rxOrScaled: 'rx', rpe: 7, durationMin: 60 }) as SessionHistoryEntry;

describe('suggestSoreAreas', () => {
  it('sugiere la zona de lo que entrenaste ayer, con el motivo', () => {
    const s = suggestSoreAreas([entry('2026-11-21', ['back-squat'])], '2026-11-22');
    expect(s).toEqual([{ area: 'muslo', label: 'Piernas', why: 'por sentadilla de ayer' }]);
  });

  it('ayer va antes que anteayer y no repite áreas', () => {
    const s = suggestSoreAreas([entry('2026-11-20', ['back-squat', 'strict-press']), entry('2026-11-21', ['front-squat'])], '2026-11-22');
    expect(s.map((x) => x.area)).toEqual(['muslo', 'hombro']);
    expect(s[0].why).toContain('ayer');
    expect(s[1].why).toContain('anteayer');
  });

  it('sin entreno reciente o con movimientos desconocidos no sugiere nada', () => {
    expect(suggestSoreAreas([entry('2026-11-15', ['back-squat'])], '2026-11-22')).toEqual([]);
    expect(suggestSoreAreas([entry('2026-11-21', ['no-existe'])], '2026-11-22')).toEqual([]);
    expect(suggestSoreAreas([], '2026-11-22')).toEqual([]);
  });

  it('las zonas de un área son la izquierda y la derecha', () => {
    expect(zonesOfArea('muslo').sort()).toEqual(['muslo-d', 'muslo-i']);
    expect(zonesOfArea('lumbar')).toEqual(['lumbar']);
  });
});
