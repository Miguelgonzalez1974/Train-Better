import { describe, expect, it } from 'vitest';
import type { SessionBlockResult } from '../data/athlete/types';
import { allBarSetsLogged, loggedRowCount } from './sessionProgress';

const squat: SessionBlockResult = { block: 'strength', movementId: 'back-squat', sets: 3, reps: '5', loadKg: 100 };
const clean: SessionBlockResult = { block: 'oly', movementId: 'power-clean', sets: 2, reps: '2', loadKg: 70 };
const wod: SessionBlockResult = { block: 'wod', movementId: 'row', reps: '500 m' };
const sets = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ movementId: id, setNumber: i + 1 }));

describe('allBarSetsLogged: parece que has terminado', () => {
  it('con todas las series de barra anotadas, sí; falta una, no', () => {
    const log = [...sets('back-squat', 3), ...sets('power-clean', 2)];
    expect(allBarSetsLogged([squat, clean, wod], log)).toBe(true);
    expect(allBarSetsLogged([squat, clean, wod], log.slice(0, -1))).toBe(false);
    expect(allBarSetsLogged([squat, clean], [])).toBe(false);
  });

  it('sin series de barra que anotar (WOD y accesorios) nunca decide: no hay terminado', () => {
    expect(allBarSetsLogged([wod, { block: 'accessory', movementId: 'ring-row', sets: 3, reps: '10' }], [])).toBe(false);
  });

  it('la rampa cuenta cada paso y la preparación no cuenta', () => {
    const wave: SessionBlockResult = { ...squat, sets: 3, setPlan: [{ reps: 5, kg: 60 }, { reps: 3, kg: 80 }, { reps: 1, kg: 100 }] };
    const prep: SessionBlockResult = { block: 'strength', movementId: 'ring-row', sets: 3, reps: '8', subgroup: 'Preparación' };
    expect(allBarSetsLogged([prep, wave], sets('back-squat', 3))).toBe(true);
    expect(allBarSetsLogged([prep, wave], sets('back-squat', 2))).toBe(false);
  });

  it('una serie única de un solo registro cuenta como una; una serie recta de una sola no se anota', () => {
    expect(loggedRowCount({ ...clean, sets: 1, logAsSingle: true })).toBe(1);
    expect(loggedRowCount({ ...squat, sets: 1 })).toBe(0);
  });
});
