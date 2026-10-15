import { describe, it, expect } from 'vitest';
import { learnStrain } from './strainLearning';
import { buildStrainTarget } from './strainTarget';
import { estimatePlannedStrain } from './plannedStrain';
import { makeProfile } from './__fixtures';
import type { DailySession, ReadinessCheck, SessionHistoryEntry, StrainTarget } from '../data/athlete/types';

const TODAY = '2026-03-18';
const day = (offset: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const done = (date: string, rpe: number, durationMin: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });
const target = (date: string, low: number, high: number, provisional = false): StrainTarget => ({ low, high, readiness: 70, yesterday: null, reasons: [], provisional, setOn: date });
const session = (date: string): DailySession => ({
  date,
  mesocycleWeek: 2,
  isRestDay: false,
  blocks: [
    { block: 'strength', movementId: 'back-squat', sets: 5 },
    { block: 'wod', movementId: 'wod', format: 'AMRAP 12 min' },
  ],
});
const log = (): ReadinessCheck[] => [day(-2), day(-1), TODAY].map((date) => ({ date, sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' }));

/** Cinco semanas de base para que la carga acumulada sea normal. */
function base(): SessionHistoryEntry[] {
  const out: SessionHistoryEntry[] = [];
  for (let i = 35; i >= 8; i--) {
    const d = new Date(`${TODAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    out.push(done(d.toISOString().slice(0, 10), 7, 60));
  }
  return out;
}

describe('aprender del objetivo de esfuerzo', () => {
  it('con poca muestra no corrige nada', () => {
    const l = learnStrain(makeProfile(), [done(day(-1), 7, 60)], TODAY);
    expect(l).toMatchObject({ bias: 0, pattern: null, outcomes: { total: 0 } });
  });

  it('cuenta los días dentro, por encima y por debajo del objetivo (solo objetivos definitivos)', () => {
    // sRPE 420 -> 50; 600 -> 63; 270 -> 36
    const hist = [done(day(-3), 7, 60), done(day(-2), 8, 75), done(day(-1), 6, 45)];
    const profile = makeProfile({
      strainTargets: { [day(-3)]: target(day(-3), 40, 60), [day(-2)]: target(day(-2), 40, 55), [day(-1)]: target(day(-1), 45, 60, true) },
    });
    const l = learnStrain(profile, hist, TODAY);
    expect(l.outcomes).toEqual({ dentro: 1, pasado: 1, corto: 0, total: 2 }); // el provisional no cuenta
  });

  it('un patrón de quedarse corto sube el rango; el de pasarse no lo baja pero avisa', () => {
    const p = (entries: SessionHistoryEntry[], low: number, high: number) =>
      makeProfile({
        readinessLog: log(),
        strainTargets: Object.fromEntries(entries.map((e) => [e.date, target(e.date, low, high)])),
      });
    const short = [-6, -5, -4, -3, -2, -1].map((o) => done(day(o), 5, 40)); // 200 -> 28
    const reference = buildStrainTarget(makeProfile({ readinessLog: log() }), [...base(), ...short], TODAY);
    const raised = buildStrainTarget(p(short, 50, 70), [...base(), ...short], TODAY);
    expect(raised.high - reference.high).toBe(4);
    expect(raised.reasons.join(' ')).toMatch(/subo el rango/);

    const hard = [-6, -5, -4, -3, -2, -1].map((o) => done(day(o), 9, 100)); // 900 -> 78
    const refHard = buildStrainTarget(makeProfile({ readinessLog: log() }), [...base(), ...hard], TODAY);
    const warned = buildStrainTarget(p(hard, 40, 55), [...base(), ...hard], TODAY);
    expect(warned.high).toBe(refHard.high);
    expect(warned.reasons.join(' ')).toMatch(/te has pasado del objetivo/);
  });

  it('la desviación de la previsión sale de comparar lo que se habría estimado con lo real', () => {
    const dates = [-6, -5, -4, -3, -2].map(day);
    const hist = dates.map((d) => done(d, 8.5, 75)); // real 637 -> 65
    const sessionCache = Object.fromEntries(dates.map((d) => [d, session(d)]));
    const planned = estimatePlannedStrain(session(dates[0]), [])!.strain;
    const l = learnStrain(makeProfile({ sessionCache }), hist, TODAY);
    expect(l.biasSample).toBe(5);
    expect(l.bias).toBeGreaterThan(0);
    expect(l.bias).toBeLessThanOrEqual(12);
    expect(planned + l.bias).toBeLessThanOrEqual(100);
  });
});
