import { describe, expect, it } from 'vitest';
import type { SessionBlockResult, WorkSetEntry } from '../data/athlete/types';
import { adjustAll, adjustRange, adjustRow, commitOf, cycleQuality, initialEdit, isChanged, isStraight, liftPlanOf, resetEdit, setDone, setTop, topIndex, waveRange } from './liftSets';

const straight: SessionBlockResult = { block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 };
const ramp: SessionBlockResult = { block: 'strength', movementId: 'back-squat', sets: 4, reps: '5-3-1', loadKg: 80, setPlan: [{ reps: 5, kg: 60 }, { reps: 3, kg: 70 }, { reps: 1, kg: 80 }, { reps: 3, kg: 70 }] };
const waves: SessionBlockResult = { block: 'oly', movementId: 'snatch', sets: 6, reps: '3-2-1', loadKg: 70, waveSize: 3, setPlan: [{ reps: 3, kg: 60 }, { reps: 2, kg: 65 }, { reps: 1, kg: 70 }, { reps: 3, kg: 60 }, { reps: 2, kg: 65 }, { reps: 1, kg: 70 }] };

const kgs = (e: { rows: { kg: number }[] }) => e.rows.map((r) => r.kg);

describe('liftPlanOf', () => {
  it('serie recta: una fila por serie con el mismo peso', () => {
    const p = liftPlanOf(straight)!;
    expect(p.rows).toHaveLength(5);
    expect(p.rows.every((r) => r.plannedKg === 100 && r.reps === 5)).toBe(true);
    expect(isStraight(p)).toBe(true);
    expect(p.blk).toBe('strength');
  });

  it('rampa y olas', () => {
    const r = liftPlanOf(ramp)!;
    expect(r.rows.map((x) => x.plannedKg)).toEqual([60, 70, 80, 70]);
    expect(isStraight(r)).toBe(false);
    const w = liftPlanOf(waves)!;
    expect(w.waveSize).toBe(3);
    expect(waveRange(w, 1)).toEqual([3, 4, 5]);
    expect(w.blk).toBe('oly');
  });

  it('lo que no se anota por series da null', () => {
    expect(liftPlanOf({ block: 'strength', movementId: 'x', sets: 1, reps: '8' })).toBeNull();
    expect(liftPlanOf({ block: 'warmup', movementId: 'row', reps: '5 min' })).toBeNull();
    expect(liftPlanOf({ ...straight, subgroup: 'Para el WOD' })).toBeNull();
    expect(liftPlanOf({ block: 'strength', movementId: 'x', logAsSingle: true, reps: '1', loadKg: 120 })?.rows).toHaveLength(1);
  });
});

describe('edición de pesos', () => {
  it('empieza todo como estaba previsto', () => {
    const e = initialEdit(liftPlanOf(ramp)!, []);
    expect(kgs(e)).toEqual([60, 70, 80, 70]);
    expect(e.done).toBe(4);
    expect(isChanged(e)).toBe(false);
  });

  it('lo ya anotado hoy manda (peso y cómo salió)', () => {
    const logged: WorkSetEntry[] = [{ date: '2026-11-21', movementId: 'back-squat', block: 'strength', setNumber: 2, kg: 75, reps: 3, quality: 'justa' }];
    const e = initialEdit(liftPlanOf(ramp)!, logged);
    expect(kgs(e)).toEqual([60, 75, 80, 70]);
    expect(e.rows[1]).toMatchObject({ manual: true, quality: 'justa' });
  });

  it('serie recta: cambiar el peso de todas es subir la top', () => {
    const e = setTop(initialEdit(liftPlanOf(straight)!, []), 105);
    expect(kgs(e)).toEqual([105, 105, 105, 105, 105]);
  });

  it('rampa: subir la top mueve las demás en proporción, a 2,5 kg', () => {
    const e = setTop(initialEdit(liftPlanOf(ramp)!, []), 85);
    expect(kgs(e)).toEqual([65, 75, 85, 75]);
    expect(topIndex(e.rows)).toBe(2);
  });

  it('subir la top no mueve las series tocadas a mano', () => {
    let e = initialEdit(liftPlanOf(ramp)!, []);
    e = adjustRow(e, 0, 2.5); // la 1 queda a 62,5 y manual; la 2, 3 y 4 suben 2,5
    e = setTop(e, 90);
    expect(e.rows[0].kg).toBe(62.5);
  });

  it('cambiar una serie arrastra las siguientes salvo las tocadas', () => {
    let e = initialEdit(liftPlanOf(straight)!, []);
    e = adjustRow(e, 2, 5); // series 3, 4 y 5: 105
    expect(kgs(e)).toEqual([100, 100, 105, 105, 105]);
    e = adjustRow(e, 3, -2.5); // la 4 manual a 102,5; la 5 baja con ella
    expect(kgs(e)).toEqual([100, 100, 105, 102.5, 102.5]);
    e = adjustRow(e, 2, 5); // la 3 sube; la 4 (manual) se queda y la 5 (que seguía a la 4 pero no manual) sube
    expect(e.rows[3].kg).toBe(102.5);
  });

  it('todas ±: mantiene la forma de la rampa', () => {
    expect(kgs(adjustAll(initialEdit(liftPlanOf(ramp)!, []), 5))).toEqual([65, 75, 85, 75]);
    expect(kgs(adjustAll(initialEdit(liftPlanOf(ramp)!, []), -100))).toEqual([0, 0, 0, 0]);
  });

  it('una ola se ajusta por separado', () => {
    const plan = liftPlanOf(waves)!;
    const e = adjustRange(initialEdit(plan, []), waveRange(plan, 1), 2.5);
    expect(kgs(e)).toEqual([60, 65, 70, 62.5, 67.5, 72.5]);
  });

  it('series hechas y cómo salió', () => {
    let e = initialEdit(liftPlanOf(straight)!, []);
    e = setDone(e, 4);
    expect(e.done).toBe(4);
    expect(setDone(e, 99).done).toBe(5);
    expect(setDone(e, -3).done).toBe(0);
    e = cycleQuality(e, 3);
    expect(e.rows[3].quality).toBe('justa');
    e = cycleQuality(e, 3);
    expect(e.rows[3].quality).toBe('fallada');
    e = cycleQuality(e, 3);
    expect(e.rows[3].quality).toBeUndefined();
  });

  it('volver a lo previsto deshace todo', () => {
    const plan = liftPlanOf(ramp)!;
    let e = setDone(setTop(initialEdit(plan, []), 90), 2);
    e = cycleQuality(e, 0);
    expect(isChanged(e)).toBe(true);
    expect(resetEdit(plan)).toEqual(initialEdit(plan, []));
  });
});

describe('commitOf', () => {
  it('las sin tocar van como previstas y las cambiadas cuentan como medidas', () => {
    let e = initialEdit(liftPlanOf(straight)!, []);
    e = adjustRow(e, 3, 5);
    e = setDone(e, 4);
    const c = commitOf(e);
    expect(c.write.map((w) => [w.n, w.kg, w.asPlanned])).toEqual([
      [1, 100, true],
      [2, 100, true],
      [3, 100, true],
      [4, 105, false],
    ]);
    expect(c.clear).toEqual([5]);
  });

  it('una serie con calidad nunca va como prevista', () => {
    const e = cycleQuality(initialEdit(liftPlanOf(straight)!, []), 0);
    expect(commitOf(e).write[0]).toMatchObject({ quality: 'justa', asPlanned: false });
  });
});
