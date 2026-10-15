import { describe, it, expect } from 'vitest';
import { buildStrainTarget, ensureStrainTarget } from './strainTarget';
import { makeProfile } from './__fixtures';
import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

const TODAY = '2026-03-18';
const session = (date: string, rpe: number, durationMin: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });
const check = (date: string, good: boolean): ReadinessCheck => ({ date, sleep: good ? 'bien' : 'mal', soreness: good ? 'ninguno' : 'alto', stress: good ? 'bajo' : 'alto', motivation: good ? 'alta' : 'baja' });
// Cuatro semanas de base (lunes a viernes) para que la carga acumulada sea normal, no un pico.
const weekOfWork = buildBase();
function buildBase(): SessionHistoryEntry[] {
  const out: SessionHistoryEntry[] = [];
  for (let i = 28; i >= 2; i--) {
    const d = new Date('2026-03-18T12:00:00');
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    out.push(session(d.toISOString().slice(0, 10), 7, 60));
  }
  return out;
}
/** Tres check-ins esta semana (hace falta mas de uno para que cuente la preparacion). */
const log = (good: boolean): ReadinessCheck[] => ['2026-03-16', '2026-03-17', TODAY].map((d) => check(d, good));

describe('objetivo de esfuerzo del día', () => {
  it('sin check-in sale provisional y con check-in definitivo', () => {
    const p = makeProfile();
    expect(buildStrainTarget(p, weekOfWork, TODAY).provisional).toBe(true);
    expect(buildStrainTarget({ ...p, readinessLog: log(true) }, weekOfWork, TODAY).provisional).toBe(false);
  });

  it('no depende de si ya has entrenado hoy: la sesión de hoy no mueve el objetivo', () => {
    const p = makeProfile({ readinessLog: log(true) });
    const before = buildStrainTarget(p, weekOfWork, TODAY);
    const after = buildStrainTarget(p, [...weekOfWork, session(TODAY, 9, 90)], TODAY);
    expect(after).toEqual(before);
  });

  it('una mala noche baja el rango respecto a un buen día', () => {
    const good = buildStrainTarget(makeProfile({ readinessLog: log(true) }), weekOfWork, TODAY);
    const bad = buildStrainTarget(makeProfile({ readinessLog: log(false) }), weekOfWork, TODAY);
    expect(bad.high).toBeLessThan(good.high);
    expect(bad.low).toBeLessThan(good.low);
  });

  it('un ayer muy duro modera el objetivo y lo explica', () => {
    const p = makeProfile({ readinessLog: log(true) });
    const easy = buildStrainTarget(p, [...weekOfWork, session('2026-03-17', 6, 45)], TODAY);
    const hard = buildStrainTarget(p, [...weekOfWork, session('2026-03-17', 9, 120)], TODAY);
    expect(hard.yesterday).toBeGreaterThanOrEqual(75);
    expect(hard.high).toBeLessThan(easy.high);
    expect(hard.reasons.join(' ')).toMatch(/Ayer fue un esfuerzo muy alto/);
  });

  it('en el taper de una competición el objetivo no sube del tope', () => {
    const goal = { id: 'c', type: 'preparar-competicion' as const, targetDate: '2026-03-23', emphasis: 'intensivo' as const, createdAt: '2026-03-01' };
    const p = makeProfile({ goals: [goal], readinessLog: log(true) });
    const t = buildStrainTarget(p, weekOfWork, TODAY);
    expect(t.high).toBeLessThanOrEqual(65);
    expect(t.reasons.join(' ')).toMatch(/Taper/);
  });

  it('ensureStrainTarget fija el objetivo una vez y el definitivo no se vuelve a tocar', () => {
    const p = makeProfile();
    const first = ensureStrainTarget(p, weekOfWork, TODAY);
    expect(first.strainTargets?.[TODAY]?.provisional).toBe(true);
    // Sin check-in nuevo: nada cambia
    expect(ensureStrainTarget(first, weekOfWork, TODAY)).toBe(first);
    // Aparece el check-in: se rehace como definitivo
    const withCheck = { ...first, readinessLog: log(true) };
    const fixed = ensureStrainTarget(withCheck, weekOfWork, TODAY);
    expect(fixed.strainTargets?.[TODAY]?.provisional).toBe(false);
    // Y ya no se mueve aunque cambie el historial o el check-in
    const later = { ...fixed, readinessLog: log(false) };
    expect(ensureStrainTarget(later, [...weekOfWork, session(TODAY, 9, 90)], TODAY)).toBe(later);
  });
});

