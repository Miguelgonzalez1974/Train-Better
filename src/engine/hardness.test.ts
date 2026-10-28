import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hardnessAdvice, hardnessAvailable, hardnessChanges, hardnessMode, hardnessSituation, hardnessUnavailableReason } from './hardness';
import { generateSessionForDate, isRealWodSelectionEnabled, setRealWodSelectionEnabled } from './generateSession';
import { estimatePlannedStrain } from './plannedStrain';
import { consecutiveDates, makeProfile } from './__fixtures';
import type { DailySession, Goal, SessionBlockResult } from '../data/athlete/types';

const REAL_WOD_INITIAL = isRealWodSelectionEnabled();
beforeAll(() => setRealWodSelectionEnabled(false));
afterAll(() => setRealWodSelectionEnabled(REAL_WOD_INITIAL));

describe('reglas de la dureza', () => {
  it('lejos de la competición es más volumen; con competición cerca o en descarga, más intensidad', () => {
    expect(hardnessMode({ competition: false, week: 2 })).toBe('volume');
    expect(hardnessMode({ competition: true, week: 2 })).toBe('intensity');
    expect(hardnessMode({ competition: false, week: 4 })).toBe('intensity');
  });

  it('cada situación tiene su aviso y en pico, taper, ámbar y descarga pide confirmación', () => {
    const base = { light: 'verde' as const, phase: null, daysToEvent: null, deload: false };
    expect(hardnessSituation(base)).toBe('normal');
    expect(hardnessSituation({ ...base, light: 'ambar' })).toBe('ambar');
    expect(hardnessSituation({ ...base, phase: 'pico', daysToEvent: 9 })).toBe('pico');
    expect(hardnessSituation({ ...base, phase: 'taper', daysToEvent: 4 })).toBe('taper');
    expect(hardnessSituation({ ...base, deload: true })).toBe('descarga');
    expect(hardnessAdvice(1, base, 'dentro')).toMatchObject({ tone: 'good', confirm: false });
    expect(hardnessAdvice(2, base, 'se-pasa')).toMatchObject({ tone: 'warn', confirm: false });
    for (const ctx of [{ ...base, phase: 'pico' as const, daysToEvent: 9 }, { ...base, phase: 'taper' as const, daysToEvent: 4 }, { ...base, light: 'ambar' as const }, { ...base, deload: true }]) {
      expect(hardnessAdvice(1, ctx, 'dentro').confirm).toBe(true);
      expect(hardnessAdvice(2, ctx, 'dentro').confirm).toBe(true);
    }
    expect(hardnessAdvice(2, { ...base, phase: 'taper', daysToEvent: 4 }, 'dentro').title).toBe('Mejor no');
    expect(hardnessAdvice(1, { ...base, phase: 'taper', daysToEvent: 4 }, 'dentro').text).toMatch(/frescura/);
  });

  it('los cambios que se enseñan dependen del modo', () => {
    expect(hardnessChanges(1, 'volume').find((c) => c.label === 'Fuerza')?.text).toBe('una serie más');
    expect(hardnessChanges(2, 'intensity').find((c) => c.label === 'Fuerza')?.text).toBe('mismas series, +5 % de carga');
  });

  it('cuando no se ofrece, dice por qué (y no dice nada en descanso)', () => {
    const block = { block: 'strength' as const, movementId: 'back-squat', sets: 4, reps: '5', loadKg: 100 };
    const ok = { isRestDay: false, source: 'generated' as const, blocks: [block], competition: undefined, dayLight: undefined };
    expect(hardnessUnavailableReason(ok)).toBeNull();
    expect(hardnessUnavailableReason({ ...ok, isRestDay: true })).toBeNull();
    const comp = (phase: NonNullable<DailySession['competition']>['phase'], extra = {}) => ({ ...ok, competition: { phase, label: '', guidance: '', daysToEvent: 3, ...extra } });
    expect(hardnessUnavailableReason(comp('pico', { simulacro: true }))).toMatch(/simulacro/);
    expect(hardnessUnavailableReason(comp('activacion'))).toMatch(/activación/);
    expect(hardnessUnavailableReason(comp('vispera'))).toMatch(/víspera/);
    expect(hardnessUnavailableReason({ ...ok, dayLight: { color: 'rojo', reasons: [] } })).toMatch(/rojo/);
    expect(hardnessUnavailableReason({ ...ok, blocks: [{ ...block, format: 'Test 1RM' }] })).toMatch(/test/);
    // Siempre que se explica, es porque no se ofrece.
    for (const s of [comp('pico', { simulacro: true }), comp('activacion'), comp('vispera'), { ...ok, dayLight: { color: 'rojo' as const, reasons: [] } }]) {
      expect(hardnessAvailable(s)).toBe(false);
    }
  });

  it('se ofrece solo en un día normal de entreno', () => {
    const block = (over: Partial<SessionBlockResult> = {}): SessionBlockResult => ({ block: 'strength', movementId: 'back-squat', sets: 4, reps: '5', loadKg: 100, ...over });
    const ok = { isRestDay: false, source: 'generated' as const, blocks: [block()], competition: undefined, dayLight: undefined };
    expect(hardnessAvailable(ok)).toBe(true);
    expect(hardnessAvailable({ ...ok, isRestDay: true })).toBe(false);
    expect(hardnessAvailable({ ...ok, source: 'custom' })).toBe(false);
    expect(hardnessAvailable({ ...ok, blocks: [block({ format: 'Test 1RM' })] })).toBe(false);
    expect(hardnessAvailable({ ...ok, dayLight: { color: 'rojo', reasons: [] } })).toBe(false);
    expect(hardnessAvailable({ ...ok, dayLight: { color: 'ambar', reasons: [] } })).toBe(true);
    const comp = (phase: NonNullable<DailySession['competition']>['phase'], extra = {}) => ({ ...ok, competition: { phase, label: '', guidance: '', daysToEvent: 3, ...extra } });
    for (const phase of ['vispera', 'evento', 'activacion', 'post'] as const) expect(hardnessAvailable(comp(phase)), phase).toBe(false);
    expect(hardnessAvailable(comp('pico', { simulacro: true }))).toBe(false);
    expect(hardnessAvailable(comp('pico'))).toBe(true);
    expect(hardnessAvailable(comp('taper'))).toBe(true);
  });
});

const days = (n: number, from: string) => consecutiveDates(from, n);
const sumSets = (s: DailySession, block: SessionBlockResult['block']) => s.blocks.filter((b) => b.block === block && !b.subgroup).reduce((t, b) => t + (b.sets ?? 0), 0);
const loads = (s: DailySession, block: SessionBlockResult['block']) => s.blocks.filter((b) => b.block === block && !b.subgroup).map((b) => b.loadKg ?? 0);

describe('la dureza en las sesiones generadas', () => {
  const base = makeProfile({ trainingDaysPerWeek: 5 });
  // Semana 2 del macro (acumulación, sin competición): lunes a viernes.
  const week = days(5, '2026-01-12');
  const gen = (hardness: 0 | 1 | 2, d: Date, profile = base) => {
    const iso = d.toISOString().slice(0, 10);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    void iso;
    return generateSessionForDate(hardness ? { ...profile, hardness: { [local]: hardness } } : profile, [], d, profile.goals);
  };

  it('en una semana normal +1 y +2 suben las series de fuerza y el volumen del WOD, y lo marcan en la sesión', () => {
    let checked = 0;
    for (const d of week) {
      const s0 = gen(0, d);
      const s1 = gen(1, d);
      const s2 = gen(2, d);
      if (s0.isRestDay || s0.blocks.length === 0) continue;
      expect(s1.hardness).toBe(1);
      expect(s1.hardnessMode).toBe('volume');
      expect(s2.hardness).toBe(2);
      expect(s0.hardness).toBeUndefined();
      expect(sumSets(s1, 'strength')).toBeGreaterThanOrEqual(sumSets(s0, 'strength'));
      expect(sumSets(s2, 'strength')).toBeGreaterThan(sumSets(s0, 'strength') - 1);
      // El esfuerzo previsto sube con el nivel.
      const e = [s0, s1, s2].map((s) => estimatePlannedStrain(s, [])?.strain ?? 0);
      expect(e[1], d.toISOString()).toBeGreaterThan(e[0]);
      expect(e[2]).toBeGreaterThan(e[1]);
      // El motor lo cuenta entre los motivos de hoy.
      expect(s1.coachReasons?.some((r) => r.includes('Dureza +1'))).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('la parte olímpica gana series con +1 y +2 (y el complejo también)', () => {
    let more = 0;
    for (const d of days(40, '2026-01-12')) {
      const s0 = gen(0, d);
      const s2 = gen(2, d);
      if (!s0.blocks.some((b) => b.block === 'oly' && !b.subgroup)) continue;
      const o0 = s0.blocks.filter((b) => b.block === 'oly' && !b.subgroup && !b.setPlan && (b.sets ?? 0) > 1);
      const o2 = s2.blocks.filter((b) => b.block === 'oly' && !b.subgroup && !b.setPlan && (b.sets ?? 0) > 1);
      if (o0.length && o2.length && o2.reduce((t, b) => t + (b.sets ?? 0), 0) > o0.reduce((t, b) => t + (b.sets ?? 0), 0)) more++;
      const c0 = s0.blocks.find((b) => b.complex);
      const c2 = s2.blocks.find((b) => b.complex);
      // En la semana de descarga «más dura» es más carga, no más series.
      if (c0 && c2) expect(c2.sets).toBe((c0.sets ?? 0) + (s2.hardnessMode === 'volume' ? 2 : 0));
    }
    expect(more).toBeGreaterThan(3);
  });

  it('con una competición cerca (pico o taper) es más carga con el mismo volumen', () => {
    const goal: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-03-20', eventEndDate: '2026-03-21', emphasis: 'intensivo', createdAt: '2026-01-01' };
    const comp = makeProfile({ trainingDaysPerWeek: 5, goals: [goal] });
    let checked = 0;
    for (const d of days(14, '2026-03-02')) {
      const s0 = gen(0, d, comp);
      const s2 = gen(2, d, comp);
      if (!s0.competition || !hardnessAvailable(s0)) continue;
      expect(s2.hardnessMode, s0.date).toBe('intensity');
      expect(sumSets(s2, 'strength'), s0.date).toBe(sumSets(s0, 'strength'));
      expect(sumSets(s2, 'oly'), s0.date).toBe(sumSets(s0, 'oly'));
      const l0 = loads(s0, 'strength').filter((k) => k > 0);
      const l2 = loads(s2, 'strength').filter((k) => k > 0);
      if (l0.length && l2.length) expect(Math.max(...l2), s0.date).toBeGreaterThan(Math.max(...l0));
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('no se aplica en el día de un test de máximos, ni en la activación, el simulacro o la víspera', () => {
    const goal: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-03-20', eventEndDate: '2026-03-21', emphasis: 'intensivo', createdAt: '2026-01-01' };
    const comp = makeProfile({ trainingDaysPerWeek: 5, goals: [goal] });
    for (const d of days(21, '2026-02-27')) {
      const s0 = gen(0, d, comp);
      if (!s0.competition) continue;
      const s2 = gen(2, d, comp);
      if (['activacion', 'vispera', 'evento'].includes(s0.competition.phase) || s0.competition.simulacro) expect(s2.hardness, `${s0.date} ${s0.competition.phase}`).toBeUndefined();
    }
    // Los test de 1RM no suben.
    for (const d of days(120, '2026-01-05')) {
      const s0 = gen(0, d);
      if (s0.blocks.some((b) => b.format === 'Test 1RM')) {
        const s2 = gen(2, d);
        expect(s2.blocks.filter((b) => b.format === 'Test 1RM').map((b) => b.loadKg), s0.date).toEqual(s0.blocks.filter((b) => b.format === 'Test 1RM').map((b) => b.loadKg));
      }
    }
  });
});
