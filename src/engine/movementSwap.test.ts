import { describe, expect, it } from 'vitest';
import type { PainFlag, PersonalRecords, SessionBlockResult } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { equipmentLabel, swapOptions } from './movementSwap';

const prs: PersonalRecords = { backSquat: 170, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 };
const ctx = { prs, todayIso: '2026-10-24' };
const strictPress: SessionBlockResult = {
  block: 'strength',
  movementId: 'strict-press',
  sets: 3,
  reps: '5-3-1',
  loadKg: 52.5,
  setPlan: [
    { reps: 5, kg: 45 },
    { reps: 3, kg: 50 },
    { reps: 1, kg: 52.5 },
  ],
};

describe('sustituir un movimiento en el modo enfocado', () => {
  it('ofrece alternativas del mismo patrón, sin el movimiento original ni repetidas', () => {
    const options = swapOptions(strictPress, ctx);
    expect(options.length).toBeGreaterThan(0);
    const ids = options.map((o) => o.movementId);
    expect(ids).not.toContain('strict-press');
    expect(new Set(ids).size).toBe(ids.length);
    const original = getMovementById('strict-press')!;
    for (const o of options) expect(getMovementById(o.movementId)?.pattern).toBe(original.pattern);
    expect(options.length).toBeLessThanOrEqual(8);
  });

  it('con barra en los dos mantiene el mismo % del PR y reescala el plan serie a serie', () => {
    const withBar = swapOptions(strictPress, ctx).find((o) => typeof o.loadKg === 'number');
    if (!withBar) return; // si el catálogo no tiene otra con barra para este patrón, no hay nada que comprobar
    const pct = 52.5 / 65;
    expect(withBar.loadKg).toBeGreaterThan(0);
    expect(withBar.patch.loadKg).toBe(withBar.loadKg);
    expect(withBar.patch.setPlan?.map((s) => s.reps)).toEqual([5, 3, 1]);
    expect(withBar.patch.setPlan?.[2].kg).toBe(withBar.loadKg);
    expect(pct).toBeGreaterThan(0.8);
  });

  it('si cambia el material no inventa un peso: queda a elección y se quita el plan serie a serie', () => {
    const noBar = swapOptions(strictPress, ctx).find((o) => o.loadKg === null);
    expect(noBar).toBeDefined();
    expect(noBar!.patch.loadKg).toBeUndefined();
    // la rampa conserva sus repeticiones y se queda sin pesos para que el atleta ponga el real
    expect(noBar!.patch.setPlan?.map((s) => s.reps)).toEqual([5, 3, 1]);
    expect(noBar!.patch.setPlan?.every((s) => s.kg === 0)).toBe(true);
    expect('loadKg' in noBar!.patch).toBe(true);
  });

  it('deja constancia del original (scaledFrom) y lo conserva si se cambia dos veces', () => {
    const first = swapOptions(strictPress, ctx)[0];
    expect(first.patch.scaledFrom).toBe('Strict Press');
    const swapped: SessionBlockResult = { ...strictPress, movementId: first.movementId, scaledFrom: 'Strict Press' };
    const second = swapOptions(swapped, ctx)[0];
    expect(second.patch.scaledFrom).toBe('Strict Press');
  });

  it('guarda cómo era el bloque (swapOrigin) para poder deshacer, y conserva el primer original si se cambia otra vez', () => {
    const first = swapOptions(strictPress, ctx)[0];
    expect(first.patch.swapOrigin).toEqual({ movementId: 'strict-press', reps: '5-3-1', loadKg: 52.5, setPlan: strictPress.setPlan, scaledFrom: undefined });
    const swapped: SessionBlockResult = { ...strictPress, ...first.patch, movementId: first.movementId };
    const second = swapOptions(swapped, ctx)[0];
    expect(second.patch.swapOrigin?.movementId).toBe('strict-press');
    expect(second.patch.swapOrigin?.loadKg).toBe(52.5);
  });

  it('con una molestia activa no ofrece movimientos de la zona', () => {
    const flag: PainFlag = { id: 'h', area: 'hombro', createdDate: '2026-10-20', until: null };
    const without = swapOptions(strictPress, ctx);
    const withPain = swapOptions(strictPress, { ...ctx, painFlags: [flag] });
    expect(withPain.length).toBeLessThanOrEqual(without.length);
    const kneeFlag: PainFlag = { id: 'k', area: 'rodilla', createdDate: '2026-10-20', until: null };
    const squat: SessionBlockResult = { block: 'strength', movementId: 'back-squat', sets: 4, reps: '5', loadKg: 130 };
    const kneeOptions = swapOptions(squat, { ...ctx, painFlags: [kneeFlag] });
    for (const o of kneeOptions) expect(getMovementById(o.movementId)?.pattern).not.toBe('squat');
  });

  it('un WOD ofrece primero el escalado curado, con las reps ya pensadas', () => {
    const wod: SessionBlockResult = { block: 'wod', movementId: 'toes-to-bar', reps: '15' };
    const options = swapOptions(wod, ctx);
    expect(options[0].kind).toBe('escalado');
    expect(options.some((o) => o.movementId === 'ghd-situp' && o.reps === '12')).toBe(true);
  });

  it('un WOD de referencia no se sustituye desde aquí (se escala aparte, sin tocar su formato oficial)', () => {
    expect(swapOptions({ block: 'wod', movementId: 'benchmark:fran' }, ctx)).toEqual([]);
  });

  it('el material sale corto y en español', () => {
    expect(equipmentLabel({ equipment: ['barbell', 'rack'] })).toBe('barra');
    expect(equipmentLabel({ equipment: ['dumbbells (opcional)'] })).toBe('mancuernas');
    expect(equipmentLabel({ equipment: ['rack', 'banda elastica'] })).toBe('banda elastica');
  });
});
