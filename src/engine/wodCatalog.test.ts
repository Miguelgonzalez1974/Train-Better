import { describe, it, expect } from 'vitest';
import { libraryWods } from '../data/library/libraryWods';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { durationBucket, getWodCatalog, isDeclaredDuration, summarizeCatalog, volumeEstimateAccuracy } from './wodCatalog';

const catalog = getWodCatalog();
const coverage = summarizeCatalog(catalog);
const byId = new Map(catalog.map((w) => [w.id, w]));

describe('catálogo unificado de WODs reales', () => {
  it('une la biblioteca PushJerk y el catálogo de benchmarks, sin ids repetidos', () => {
    expect(catalog.length).toBe(libraryWods.length + benchmarkWorkouts.length);
    expect(new Set(catalog.map((w) => w.id)).size).toBe(catalog.length);
    expect(catalog.filter((w) => w.origin === 'library').length).toBe(libraryWods.length);
  });

  it('un WOD programable lo tiene todo resuelto: movimientos del catálogo y duración', () => {
    for (const w of catalog.filter((x) => x.usable)) {
      expect(w.exclusions, w.id).toEqual([]);
      expect(w.unresolved, w.id).toEqual([]);
      expect(w.durationMin, w.id).not.toBeNull();
      expect(w.movementIds.length, w.id).toBeGreaterThan(0);
      for (const id of w.movementIds) expect(getMovementById(id), `${w.id}: ${id}`).toBeTruthy();
    }
  });

  it('los excluidos dicen por qué', () => {
    for (const w of catalog.filter((x) => !x.usable)) expect(w.exclusions.length, w.id).toBeGreaterThan(0);
  });

  it('la duración se lee de donde la declara la fuente', () => {
    // Biblioteca: el objetivo publicado ("9 min.") y la cabecera ("12 min AMRAP")
    const goal = libraryWods.find((w) => w.goal === '9 min.')!;
    expect(byId.get(`lib:${goal.id}`)).toMatchObject({ durationMin: 9, durationBasis: 'goal' });
    const amrap = libraryWods.find((w) => /^12 min amrap$/i.test(w.header) && !w.goal)!;
    expect(byId.get(`lib:${amrap.id}`)).toMatchObject({ durationMin: 12, durationBasis: 'header', format: 'amrap' });
    const range = libraryWods.find((w) => /^10-12 min\./.test(w.goal ?? ''))!;
    expect(byId.get(`lib:${range.id}`)?.durationMin).toBe(11);
    // Benchmarks: el límite de tiempo y las series de AMRAP con descanso
    expect(byId.get('bm:mayhem-4')).toMatchObject({ durationMin: 10, durationBasis: 'cap', format: 'amrap', source: 'mayhem' });
    expect(byId.get('bm:mayhem-2')).toMatchObject({ durationMin: 6 * 2 + 5 * 1, durationBasis: 'format', format: 'interval' });
  });

  it('una duración declarada es firme y una estimada se marca como tal', () => {
    const declared = catalog.filter((w) => w.usable && isDeclaredDuration(w)).length;
    const estimated = catalog.filter((w) => w.usable && !isDeclaredDuration(w)).length;
    expect(declared).toBeGreaterThan(500);
    expect(estimated).toBeGreaterThan(0);
    for (const w of catalog.filter((x) => x.durationMin !== null)) expect(w.durationBasis, w.id).not.toBeNull();
  });

  it('asigna cada fuente por su etiqueta y los clásicos por categoría', () => {
    expect(byId.get('bm:mayhem-1')?.source).toBe('mayhem');
    expect(byId.get('bm:invictus-2')?.source).toBe('invictus');
    expect(byId.get('bm:pj-row-toes-to-bar')?.source).toBe('pushjerk');
    const girl = benchmarkWorkouts.find((w) => w.category === 'girl')!;
    expect(byId.get(`bm:${girl.id}`)?.source).toBe('clasicos');
  });

  it('el sistema energético sale de la duración: corto = potencia, medio = umbral, largo = aeróbico', () => {
    const wod = (min: number) => catalog.find((w) => w.usable && w.durationMin === min && w.source !== 'clasicos' && w.energy !== 'recuperacion');
    expect(wod(5)?.energy).toBe('potencia');
    expect(wod(12)?.energy).toBe('umbral');
    expect(wod(30)?.energy).toBe('base-aerobica');
  });

  it('los WODs de varias partes, sin pauta clara o con elementos fuera de catálogo no se programan', () => {
    const multi = catalog.filter((w) => w.exclusions.includes('varias-partes'));
    const unknown = catalog.filter((w) => w.exclusions.includes('movimientos-desconocidos'));
    expect(multi.length).toBeGreaterThan(0);
    expect(unknown.length).toBeGreaterThan(0);
    for (const w of [...multi, ...unknown]) expect(w.usable).toBe(false);
  });
});

describe('cobertura del catálogo (guardarraíles)', () => {
  it('hay WODs reales de sobra y la mayoría se puede programar', () => {
    expect(coverage.total).toBeGreaterThan(2500);
    expect(coverage.usable / coverage.total).toBeGreaterThan(0.9);
  });

  it('cada programación grande aporta WODs programables', () => {
    expect(coverage.bySource.pushjerk.usable).toBeGreaterThan(1000);
    expect(coverage.bySource.mayhem.usable).toBeGreaterThan(300);
    expect(coverage.bySource.comptrain.usable).toBeGreaterThan(150);
    expect(coverage.bySource.invictus.usable).toBeGreaterThan(50);
  });

  it('el planificador (sistema energético x dominio) tiene candidatos en cada casilla de trabajo', () => {
    for (const energy of ['potencia', 'umbral', 'base-aerobica'] as const) {
      for (const domain of ['weighted', 'gymnastics', 'monostructural'] as const) {
        expect(coverage.energyByDomain[energy][domain], `${energy} x ${domain}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('hay WODs ligeros para descarga y días de poca preparación', () => {
    expect(coverage.light).toBeGreaterThan(400);
  });

  it('con una molestia activa en cualquier zona quedan cientos de WODs', () => {
    for (const [area, n] of Object.entries(coverage.painSurvivors)) expect(n, area).toBeGreaterThan(300);
  });

  it('la estimación de duración por volumen no tiene sesgo y acierta en la mayoría de casos', () => {
    const acc = volumeEstimateAccuracy();
    expect(acc.n).toBeGreaterThan(100);
    expect(acc.medianRatio).toBeGreaterThan(0.9);
    expect(acc.medianRatio).toBeLessThan(1.15);
    expect(acc.within30).toBeGreaterThan(0.55);
  });

  it('los tramos de duración cubren todo el rango', () => {
    expect(durationBucket(5)).toBe('≤6');
    expect(durationBucket(10)).toBe('7-10');
    expect(durationBucket(15)).toBe('11-15');
    expect(durationBucket(20)).toBe('16-20');
    expect(durationBucket(30)).toBe('21-30');
    expect(durationBucket(31)).toBe('>30');
    expect(Object.values(coverage.durationBuckets).reduce((s, n) => s + n, 0)).toBe(coverage.usable);
  });
});
