import { describe, expect, it } from 'vitest';
import { BASE_PRS } from './__fixtures';
import { currentFiveRm, recordFiveRm, texasRole, texasSessionAt } from './texasClassic';
import { newCompanion } from './strengthCompanion';

// BASE_PRS: sentadilla 170, banca 110, press 65 → 5RM estimados (86 %, al disco): 145, 95 y 55.
const companion = newCompanion([0, 2, 4], 8);
const at = (i: number, from = i, c = companion) => texasSessionAt(i, c, BASE_PRS, { from });
const sched = (s: ReturnType<typeof at>) => s.lifts.map((l) => `${l.liftKey} ${l.sets}×${l.reps} ${l.loadKg}${l.attempt ? ' marca' : ''}`);

describe('Texas Method clásico: la semana', () => {
  it('los tres papeles se repiten cada tres sesiones', () => {
    expect([0, 1, 2, 3, 4, 5].map(texasRole)).toEqual(['volumen', 'recuperacion', 'intensidad', 'volumen', 'recuperacion', 'intensidad']);
  });

  it('el 5RM se estima del PR hasta que haya una marca real', () => {
    expect(currentFiveRm(companion, BASE_PRS, 'backSquat')).toBe(145);
    expect(currentFiveRm(companion, BASE_PRS, 'benchPress')).toBe(95);
    expect(currentFiveRm({ fiveRm: { backSquat: 150 } }, BASE_PRS, 'backSquat')).toBe(150);
  });

  it('semana A: lunes sentadilla 5×5 y banca 5×5 al 90 %; miércoles sentadilla al 80 % del lunes y press 3×5; viernes, marca en sentadilla y banca', () => {
    expect(sched(at(0))).toEqual(['backSquat 5×5 130', 'benchPress 5×5 85']);
    expect(sched(at(1))).toEqual(['backSquat 2×5 105', 'strictPress 3×5 50']);
    expect(sched(at(2))).toEqual(['backSquat 1×5 147.5 marca', 'benchPress 1×5 97.5 marca']);
    expect(at(2).role).toBe('intensidad');
  });

  it('semana B alterna: press militar de volumen y de marca, banca en el miércoles', () => {
    const lifts = (i: number) => at(i, 0).lifts.map((l) => l.liftKey);
    expect(lifts(3)).toEqual(['backSquat', 'strictPress']);
    expect(lifts(4)).toEqual(['backSquat', 'benchPress']);
    expect(lifts(5)).toEqual(['backSquat', 'strictPress']);
    expect(at(5, 0).lifts.every((l) => l.attempt)).toBe(true);
  });
});

describe('Texas Method clásico: la progresión sale de los viernes logrados', () => {
  it('sin resultados, al proyectar se da por logrado cada viernes: la sentadilla sube cada semana, banca y press cada dos', () => {
    // viernes de la semana 1 (sesión 2): marca 145 + 2.5; semana 2 (sesión 5): ya partía de 147.5 → 150
    const marks = [2, 5, 8, 11].map((i) => at(i, 0).lifts.find((l) => l.liftKey === 'backSquat')!.loadKg);
    expect(marks).toEqual([147.5, 150, 152.5, 155]);
    const bench = [2, 8].map((i) => at(i, 0).lifts.find((l) => l.liftKey === 'benchPress')!.loadKg);
    expect(bench).toEqual([97.5, 100]);
  });

  it('la sesión de hoy no proyecta nada: parte de tu 5RM actual', () => {
    expect(at(3, 3).lifts[0].loadKg).toBe(130); // lunes de la semana 2 con el 5RM sin tocar
    const withResult = { ...companion, fiveRm: { backSquat: 147.5 } };
    expect(at(3, 3, withResult).lifts[0].loadKg).toBe(132.5); // 90 % de 147,5
  });

  it('registrar un viernes logrado sube el 5RM de trabajo; los que no salen no cambian', () => {
    const next = recordFiveRm(companion, { backSquat: 147.5 });
    expect(next.fiveRm).toEqual({ backSquat: 147.5 });
    expect(recordFiveRm(next, { benchPress: 97.5 }).fiveRm).toEqual({ backSquat: 147.5, benchPress: 97.5 });
    expect(recordFiveRm(next, {}).fiveRm).toEqual({ backSquat: 147.5 });
  });

  it('la autorregulación baja el volumen y la recuperación, pero no la marca del viernes', () => {
    const light = texasSessionAt(0, companion, BASE_PRS, { autoreg: 0.9 });
    expect(light.lifts[0].loadKg).toBeLessThan(at(0).lifts[0].loadKg);
    const friday = texasSessionAt(2, companion, BASE_PRS, { autoreg: 0.8 });
    expect(friday.lifts.map((l) => l.loadKg)).toEqual(at(2).lifts.map((l) => l.loadKg));
  });
});
