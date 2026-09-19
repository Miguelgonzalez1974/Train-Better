import { describe, it, expect } from 'vitest';
import {
  ACCESSORY_WEEK_LOAD_FACTOR,
  hasAccessoryLoadModel,
  suggestAccessoryLoadKg,
  type AccessoryLoadContext,
} from './accessoryLoads';
import { PER_DUMBBELL_ACCESSORY_IDS, loadUnitLabel } from '../data/movements/loadUnits';
import { getMovementById } from '../data/movements';
import type { PersonalRecords } from '../data/athlete/types';

const PRS: PersonalRecords = {
  backSquat: 140,
  frontSquat: 110,
  benchPress: 100,
  deadlift: 180,
  strictPress: 60,
  clean: 100,
  snatch: 80,
  cleanAndJerk: 105,
};

const ctx = (over: Partial<AccessoryLoadContext> = {}): AccessoryLoadContext => ({
  prs: PRS,
  bodyweightKg: 80,
  week: 1,
  loadFactor: 1,
  doseLoad: 1,
  ...over,
});

describe('suggestAccessoryLoadKg', () => {
  it('deriva la carga del PR de referencia y la redondea a discos', () => {
    // RDL: 50% del peso muerto (180) = 90 kg en la semana 1.
    expect(suggestAccessoryLoadKg('romanian-deadlift', ctx())).toBe(90);
    expect(suggestAccessoryLoadKg('bench-press', ctx())).toBe(70);
  });

  it('sube hacia el pico y baja en la descarga, con el mismo orden que los factores semanales', () => {
    const w = (week: 1 | 2 | 3 | 4) => suggestAccessoryLoadKg('romanian-deadlift', ctx({ week }))!;
    expect(w(3)).toBeGreaterThan(w(2));
    expect(w(2)).toBeGreaterThan(w(1));
    expect(w(4)).toBeLessThan(w(1));
    expect(ACCESSORY_WEEK_LOAD_FACTOR[3]).toBeGreaterThan(ACCESSORY_WEEK_LOAD_FACTOR[1]);
  });

  it('el factor de autorregulacion recorta la carga', () => {
    const fresh = suggestAccessoryLoadKg('romanian-deadlift', ctx())!;
    const tired = suggestAccessoryLoadKg('romanian-deadlift', ctx({ loadFactor: 0.8 }))!;
    expect(tired).toBeLessThan(fresh);
  });

  it('las mancuernas se redondean a tamaños reales, por mancuerna', () => {
    // 30% del press banca (100) = 30 por mancuerna.
    expect(suggestAccessoryLoadKg('dumbbell-bench-press', ctx())).toBe(30);
    // Elevaciones laterales: 10% del press estricto (60) = 6.
    expect(suggestAccessoryLoadKg('lateral-raise', ctx())).toBe(6);
  });

  it('el jalon usa el peso corporal y no da carga sin el', () => {
    expect(suggestAccessoryLoadKg('lat-pulldown', ctx())).toBe(47.5); // 80 * 0.6 = 48 -> 47.5
    expect(suggestAccessoryLoadKg('lat-pulldown', ctx({ bodyweightKg: null }))).toBeUndefined();
  });

  it('sin PR de referencia, o para peso corporal, no hay carga', () => {
    expect(suggestAccessoryLoadKg('romanian-deadlift', ctx({ prs: { ...PRS, deadlift: 0 } }))).toBeUndefined();
    for (const id of ['push-up', 'box-jump', 'strict-pull-up', 'back-extension', 'walking-lunge-bodyweight']) {
      expect(suggestAccessoryLoadKg(id, ctx()), id).toBeUndefined();
    }
  });
});

describe('catalogo de cargas de accesorio', () => {
  it('todos los movimientos con modelo existen en el catalogo', () => {
    const ids = [
      'romanian-deadlift', 'hip-thrust', 'good-morning', 'walking-lunge', 'reverse-lunge', 'bulgarian-split-squat',
      'step-up', 'close-grip-bench-press', 'bench-press', 'dumbbell-bench-press', 'dumbbell-floor-press',
      'seated-strict-press', 'strict-press', 'dumbbell-z-press', 'lateral-raise', 'pendlay-row', 'landmine-row',
      'single-arm-dumbbell-row', 'lat-pulldown',
    ];
    for (const id of ids) {
      expect(getMovementById(id), `${id} no existe`).toBeTruthy();
      expect(hasAccessoryLoadModel(id), `${id} sin modelo`).toBe(true);
    }
  });

  it('los accesorios por mancuerna tienen modelo y etiqueta "kg c/u" solo en accesorio', () => {
    for (const id of PER_DUMBBELL_ACCESSORY_IDS) {
      expect(hasAccessoryLoadModel(id), id).toBe(true);
      expect(loadUnitLabel(id, 'accessory')).toBe('kg c/u');
      expect(loadUnitLabel(id, 'wod')).toBe('kg');
    }
    expect(loadUnitLabel('romanian-deadlift', 'accessory')).toBe('kg');
    expect(loadUnitLabel(undefined, undefined)).toBe('kg');
  });
});
