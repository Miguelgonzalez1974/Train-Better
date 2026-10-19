import { describe, it, expect } from 'vitest';
import { assessSimulacro, decideTaper, resolveCompetitionDay } from './taperPlan';
import { simulacroDateFor } from './competition';
import { generateSessionForDate } from './generateSession';
import { buildStrainTarget } from './strainTarget';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { Goal, ReadinessCheck } from '../data/athlete/types';

// Competición real: viernes 6 y sábado 7 de noviembre de 2026. El taper arranca el 30 oct y se decide con los datos del 29.
const GOAL: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-11-06', eventEndDate: '2026-11-07', emphasis: 'intensivo', createdAt: '2026-10-01' };
const SIMULACRO = simulacroDateFor('2026-11-06', 6)!;
const iso = (base: string, offset: number) => {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const MID = { sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal' } as const;
const GOOD = { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' } as const;
const BAD = { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' } as const;

const entry = (date: string, q: typeof MID | typeof GOOD | typeof BAD, hrv?: number, hr?: number): ReadinessCheck => ({
  date,
  ...q,
  ...(hrv !== undefined ? { hrv } : {}),
  ...(hr !== undefined ? { restingHr: hr } : {}),
});
/** Un check-in por día entre `from` y `to` (ambos incluidos) con la HRV que dé `hrvOf`. */
function days(from: string, to: string, q: typeof MID | typeof GOOD | typeof BAD, hrvOf?: (i: number) => number | undefined, hr?: number): ReadinessCheck[] {
  const out: ReadinessCheck[] = [];
  for (let d = from, i = 0; d <= to; d = iso(d, 1), i++) out.push(entry(d, q, hrvOf?.(i), hr));
  return out;
}
const profile = (readinessLog: ReadinessCheck[]) =>
  makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'taper', startDate: '2026-08-31', endDate: '2027-02-01' })], goals: [GOAL], readinessLog, bodyweightLog: [{ date: '2026-09-01', kg: 80 }] });
/** HRV de 64 ± 12 ms (un rango de unos 55–74 ms) durante `n` días hasta el 29 oct, y `tail` días finales con el valor dado. */
const hrvSeries = (tail: number, tailValue: number) => (i: number) => (i >= 20 - tail ? tailValue : 64 + (i % 2 === 0 ? 12 : -12));

describe('simulacro: cómo respondiste', () => {
  const prior = (hrv: number, hr?: number) => days(iso(SIMULACRO, -8), SIMULACRO, MID, () => hrv, hr);

  it('sin medición a la mañana siguiente no se puede saber', () => {
    expect(assessSimulacro(prior(64), SIMULACRO)).toMatchObject({ measured: false, cost: null });
    expect(assessSimulacro([...prior(64), entry(iso(SIMULACRO, 1), MID)], SIMULACRO).measured).toBe(false);
  });

  it('te costó si la HRV cae un 15 % o más bajo tu media de la semana', () => {
    const r = assessSimulacro([...prior(64), entry(iso(SIMULACRO, 1), MID, 50)], SIMULACRO);
    expect(r).toMatchObject({ measured: true, cost: true, hrvDropPct: 22, nextHrv: 50, priorAvg: 64 });
    const ok = assessSimulacro([...prior(64), entry(iso(SIMULACRO, 1), MID, 60)], SIMULACRO);
    expect(ok).toMatchObject({ measured: true, cost: false, hrvDropPct: 6 });
  });

  it('o si el pulso sube 8 ppm o más sobre tu media', () => {
    const log = [...prior(64, 55), entry(iso(SIMULACRO, 1), MID, 64, 64)];
    expect(assessSimulacro(log, SIMULACRO)).toMatchObject({ measured: true, cost: true, hrRise: 9 });
    expect(assessSimulacro([...prior(64, 55), entry(iso(SIMULACRO, 1), MID, 64, 60)], SIMULACRO).cost).toBe(false);
  });
});

describe('taper: cómo llegas', () => {
  it('sin datos suficientes es el taper estándar y lo dice', () => {
    expect(decideTaper(profile([]), [], '2026-11-06')).toEqual({ kind: 'estandar', reasons: ['Aún sin datos suficientes de HRV ni de preparación: taper estándar.'] });
  });

  it('con la HRV de la semana por debajo de tu rango, reforzado', () => {
    // sin medición la mañana siguiente al simulacro, para que la razón sea la HRV de la semana y no el simulacro
    const log = days('2026-10-10', '2026-10-29', MID, hrvSeries(5, 35)).filter((c) => c.date !== iso(SIMULACRO, 1));
    const d = decideTaper(profile(log), [], '2026-11-06');
    expect(d.kind).toBe('reforzado');
    expect(d.reasons[0]).toContain('HRV de la semana');
  });

  it('el rango provisional (7 a 13 mediciones) también cuenta para el taper', () => {
    // 10 mediciones en total: las 6 primeras normales y las 4 últimas bajas
    const log = days('2026-10-20', '2026-10-29', MID, (i) => (i >= 6 ? 35 : 64 + (i % 2 === 0 ? 12 : -12)));
    expect(decideTaper(profile(log), [], '2026-11-06').kind).toBe('reforzado');
  });

  it('con la preparación media de la semana baja, reforzado aunque no haya HRV', () => {
    const d = decideTaper(profile(days('2026-10-23', '2026-10-29', BAD)), [], '2026-11-06');
    expect(d.kind).toBe('reforzado');
    expect(d.reasons[0]).toContain('preparación media');
  });

  it('con la HRV por encima de tu rango y buena preparación, afinado', () => {
    const d = decideTaper(profile(days('2026-10-10', '2026-10-29', GOOD, hrvSeries(5, 120))), [], '2026-11-06');
    expect(d.kind).toBe('afinado');
  });

  it('una HRV alta sin buena preparación no afina: taper estándar', () => {
    const d = decideTaper(profile(days('2026-10-10', '2026-10-29', MID, hrvSeries(5, 120))), [], '2026-11-06');
    expect(d.kind).toBe('estandar');
  });

  it('si el simulacro te costó, reforzado aunque todo lo demás vaya bien', () => {
    const good = days('2026-10-10', '2026-10-29', GOOD, () => 64, 55).filter((c) => c.date !== iso(SIMULACRO, 1));
    const after = entry(iso(SIMULACRO, 1), GOOD, 48, 66);
    const log = [...good, after].sort((a, b) => a.date.localeCompare(b.date));
    const d = decideTaper(profile(log), [], '2026-11-06');
    expect(d.kind).toBe('reforzado');
    expect(d.reasons[0]).toContain('simulacro');
  });

  it('solo mira lo que se sabía el día antes de empezar el taper: lo que pasa después no lo cambia', () => {
    const base = days('2026-10-10', '2026-10-29', MID, hrvSeries(0, 0));
    const later = days('2026-10-30', '2026-11-03', BAD, () => 30);
    expect(decideTaper(profile([...base, ...later]), [], '2026-11-06')).toEqual(decideTaper(profile(base), [], '2026-11-06'));
  });
});

describe('taper: lo que cambia en la cuenta atrás', () => {
  const at = (log: ReadinessCheck[], day: string) => resolveCompetitionDay(profile(log), [], new Date(`${day}T12:00:00`));
  const reforzadoLog = days('2026-10-23', '2026-10-29', BAD);
  const afinadoLog = days('2026-10-10', '2026-10-29', GOOD, hrvSeries(5, 120));

  it('el estándar es el de siempre: -40 % y WODs de 9 min', () => {
    const c = at([], '2026-10-31')!;
    expect(c).toMatchObject({ phase: 'taper', label: 'Taper', volumeScale: 0.6, maxWodMinutes: 9, taperKind: 'estandar' });
  });

  it('el reforzado recorta más (-50 %, WODs de 7 min) y mete un día de descanso activo el 2 de noviembre', () => {
    const c = at(reforzadoLog, '2026-10-31')!;
    expect(c).toMatchObject({ label: 'Taper reforzado', volumeScale: 0.5, maxWodMinutes: 7, taperKind: 'reforzado', recoverySession: false });
    const rest = at(reforzadoLog, '2026-11-02')!;
    expect(rest).toMatchObject({ recoverySession: true, taperKind: 'reforzado' });
    expect(rest.label).toContain('descanso activo');
    expect(at(reforzadoLog, '2026-11-03')!.recoverySession).toBe(false);
  });

  it('el afinado recorta menos (-35 %) y mantiene los WODs de 9 min', () => {
    expect(at(afinadoLog, '2026-11-01')).toMatchObject({ label: 'Taper afinado', volumeScale: 0.65, maxWodMinutes: 9, taperKind: 'afinado' });
  });

  it('las demás fases no cambian y no llevan tipo de taper', () => {
    for (const day of ['2026-10-24', '2026-11-04', '2026-11-05']) {
      expect(at(reforzadoLog, day)?.taperKind, day).toBeUndefined();
    }
    expect(at(reforzadoLog, '2026-11-04')).toMatchObject({ phase: 'activacion', volumeScale: 0.5, maxWodMinutes: 6 });
  });

  it('la guía de la sesión explica por qué sale ese taper', () => {
    expect(at(reforzadoLog, '2026-10-31')!.guidance).toContain('preparación media');
    expect(at([], '2026-10-31')!.guidance).toContain('Aún sin datos suficientes');
  });
});

describe('taper: en la sesión y en el objetivo de esfuerzo', () => {
  const reforzadoLog = days('2026-10-23', '2026-10-29', BAD);

  it('el día extra del taper reforzado es una sesión de recuperación activa, y el resto sale recortado y lo cuenta', () => {
    const p = profile(reforzadoLog);
    const rest = generateSessionForDate(p, [], new Date('2026-11-02T12:00:00'), p.goals);
    expect(rest.blocks.some((b) => b.block === 'strength' || b.block === 'oly')).toBe(false);
    expect(rest.competition).toMatchObject({ phase: 'taper', taperKind: 'reforzado' });
    const normal = generateSessionForDate(p, [], new Date('2026-10-31T12:00:00'), p.goals);
    expect(normal.competition?.taperKind).toBe('reforzado');
    expect(normal.coachReasons?.[0]).toContain('Taper reforzado');
  });

  it('en una misma semana de taper el tipo no cambia de un día a otro', () => {
    const p = profile(reforzadoLog);
    const kinds = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((d) => resolveCompetitionDay(p, [], new Date(`${d}T12:00:00`))?.taperKind);
    expect(new Set(kinds)).toEqual(new Set(['reforzado']));
  });

  it('el reforzado baja el tope del objetivo de esfuerzo frente al afinado', () => {
    const reforzado = buildStrainTarget(profile(reforzadoLog), [], '2026-10-31');
    const afinado = buildStrainTarget(profile(days('2026-10-10', '2026-10-30', GOOD, hrvSeries(5, 120))), [], '2026-10-31');
    expect(reforzado.high).toBeLessThanOrEqual(55);
    expect(afinado.high).toBeGreaterThan(reforzado.high);
  });
});

// Una semana normal de entreno sigue sin tocarse: sin objetivo de competición nada de esto aplica.
describe('sin competición no cambia nada', () => {
  it('un perfil sin objetivo de competición no tiene cuenta atrás ni taper', () => {
    const p = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'plain' })] });
    for (const d of consecutiveDates('2026-02-02', 14)) expect(resolveCompetitionDay(p, [], d)).toBeNull();
  });
});
