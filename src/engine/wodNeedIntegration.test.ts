import { describe, expect, it } from 'vitest';
import type { DailySession, LevelResult } from '../data/athlete/types';
import { makeMacro, makeProfile } from './__fixtures';
import { generateSessionForDate } from './generateSession';
import { categoryOfCatalogWod, WOD_CATEGORY_LABEL } from './wodCategory';
import { getCatalogWod } from './wodCatalog';
import { isRealWodSelectionEnabled, setRealWodSelectionEnabled } from './generateSession';

const day = (n: number) => new Date(2026, 1, 2 + n, 12); // desde un lunes de febrero, dentro del macro de prueba
const wodBlocks = (s: DailySession) => s.blocks.filter((b) => b.block === 'wod');

function month(profile: ReturnType<typeof makeProfile>) {
  return Array.from({ length: 28 }, (_, i) => generateSessionForDate(profile, [], day(i), []));
}

describe('el coach completa la categoría que te falta (WODs reales)', () => {
  const asRx = (date: string, key: string, value: number): LevelResult => ({ date, part: 1, category: 'pesado', key, scoreType: 'time', value });

  it('con un solo resultado de una categoría, algún WOD del mes es de esa categoría y lo explica; sin resultados no cambia nada', () => {
    const was = isRealWodSelectionEnabled();
    setRealWodSelectionEnabled(true);
    try {
      const baseProfile = makeProfile({ macrocycles: [makeMacro()], onboardedAt: undefined });
      const none = month(baseProfile);
      expect(none.every((s) => !wodBlocks(s).some((b) => (b.notes ?? '').includes('Este cuenta para')))).toBe(true);

      const withNeed = month({ ...baseProfile, levelLog: [asRx('2026-01-10', 'benchmark:diane', 400)] });
      const explained = withNeed.filter((s) => (s.coachReasons ?? []).some((r) => r.includes('Este cuenta para Pesado')));
      expect(explained.length).toBeGreaterThan(0);
      const first = explained[0];
      const entry = wodBlocks(first).find((b) => b.wodCatalogId || b.wodLibraryId);
      const id = entry?.wodCatalogId ?? (entry?.wodLibraryId ? `lib:${entry.wodLibraryId}` : undefined);
      expect(id).toBeTruthy();
      expect(categoryOfCatalogWod(getCatalogWod(id!)!, baseProfile.prs)).toBe('pesado');
    } finally {
      setRealWodSelectionEnabled(was);
    }
  });

  it('la categoría de un WOD del catálogo sale de sus movimientos y tus marcas (con caché)', () => {
    const diane = getCatalogWod('bm:diane')!;
    expect(categoryOfCatalogWod(diane, { deadlift: 180 })).toBe('pesado');
    expect(categoryOfCatalogWod(diane, { deadlift: 180 })).toBe('pesado');
    expect(categoryOfCatalogWod(diane, { deadlift: 400 })).toBe('ligero');
    expect(WOD_CATEGORY_LABEL.pesado).toBe('Pesado');
  });
});
