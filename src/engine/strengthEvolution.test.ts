import { describe, expect, it } from 'vitest';
import type { PersonalRecords, PrLogEntry, SetFeedbackEntry, WorkSetEntry } from '../data/athlete/types';
import { buildStrengthEvolution, collectE1rmPoints, niceAxis } from './strengthEvolution';

const TODAY = '2026-10-22';
const prs: PersonalRecords = { backSquat: 170, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 };
const prLog: PrLogEntry[] = [
  { date: '2026-02-01', key: 'backSquat', kg: 150 },
  { date: '2026-05-01', key: 'backSquat', kg: 160 },
  { date: '2026-09-20', key: 'backSquat', kg: 170 },
];
const fb = (date: string, estimated1rm: number | undefined, prKey = 'backSquat'): SetFeedbackEntry => ({
  date,
  movementId: 'back-squat',
  block: 'strength',
  prescribedKg: 136,
  prescribedReps: 5,
  prescribedSets: 4,
  feel: 'justo',
  prKey,
  pctOf1rm: 0.8,
  estimated1rm,
});
const work = (date: string, kg: number, reps: number, movementId = 'back-squat'): WorkSetEntry => ({ date, movementId, block: 'strength', setNumber: 1, kg, reps });

describe('evolución de fuerza: PR y 1RM estimado', () => {
  it('la línea de PR son escalones y el rango parte del valor vigente al empezar', () => {
    const evo = buildStrengthEvolution('backSquat', prs, prLog, [], [], TODAY, '6m');
    // hace 6 meses (~22 abr) el PR vigente era 150 (el de febrero); luego 160 en mayo y 170 en septiembre
    expect(evo.pr[0].kg).toBe(150);
    expect(evo.prChanges.map((p) => p.kg)).toEqual([160, 170]);
    expect(evo.pr[evo.pr.length - 1]).toEqual({ date: TODAY, kg: 170 });
    expect(evo.prDeltaKg).toBe(20);
  });

  it('en el rango de 8 semanas solo cuenta el último cambio', () => {
    const evo = buildStrengthEvolution('backSquat', prs, prLog, [], [], TODAY, '8s');
    expect(evo.pr[0].kg).toBe(160);
    expect(evo.prChanges.map((p) => p.kg)).toEqual([170]);
    expect(evo.prDeltaKg).toBe(10);
  });

  it('"todo" arranca en el primer dato', () => {
    const evo = buildStrengthEvolution('backSquat', prs, prLog, [], [], TODAY, 'todo');
    expect(evo.from).toBe('2026-02-01');
    expect(evo.pr[0].kg).toBe(150);
  });

  it('el 1RM estimado con RPE manda sobre el de Epley del mismo día, y el de series cuenta si no hay RPE', () => {
    const pts = collectE1rmPoints('backSquat', 170, [fb('2026-10-01', 176)], [work('2026-10-01', 140, 5), work('2026-10-08', 140, 5)]);
    expect(pts).toEqual([
      { date: '2026-10-01', kg: 176, source: 'rpe' },
      { date: '2026-10-08', kg: 163.3, source: 'series' },
    ]);
  });

  it('descarta las series ligeras (calentamiento), las de muchas reps y las de otro levantamiento', () => {
    const pts = collectE1rmPoints('backSquat', 170, [], [work('2026-10-01', 60, 5), work('2026-10-02', 100, 15), work('2026-10-03', 140, 5, 'deadlift')]);
    expect(pts).toEqual([]);
  });

  it('el 1RM estimado de hoy es la media de las tres últimas estimaciones y el cambio va del primero al último', () => {
    const log = [fb('2026-08-01', 160), fb('2026-09-01', 170), fb('2026-09-15', 172), fb('2026-10-10', 177)];
    const evo = buildStrengthEvolution('backSquat', prs, prLog, log, [], TODAY, '6m');
    expect(evo.latestE1rm).toBe(173);
    expect(evo.e1rmDeltaKg).toBe(17);
    expect(evo.hasData).toBe(true);
  });

  it('un levantamiento sin datos no tiene gráfico y el eje no se rompe', () => {
    const evo = buildStrengthEvolution('snatch', prs, [], [], [], TODAY, '6m');
    expect(evo.hasData).toBe(false);
    expect(evo.latestE1rm).toBeNull();
    const axis = niceAxis(evo.minKg, evo.maxKg);
    expect(axis.hi).toBeGreaterThan(axis.lo);
  });

  it('el eje deja aire y se redondea a 5 kg', () => {
    const axis = niceAxis(150, 178);
    expect(axis.lo % 5).toBe(0);
    expect(axis.hi % 5).toBe(0);
    expect(axis.lo).toBeLessThan(150);
    expect(axis.hi).toBeGreaterThan(178);
    expect(axis.ticks).toHaveLength(3);
  });

  it('el PR del perfil manda en el último punto aunque el historial vaya por detrás', () => {
    const evo = buildStrengthEvolution('backSquat', { ...prs, backSquat: 175 }, prLog, [], [], TODAY, '6m');
    expect(evo.pr[evo.pr.length - 1].kg).toBe(175);
    expect(evo.currentPr).toBe(175);
  });
});
