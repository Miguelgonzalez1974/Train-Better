import { describe, it, expect } from 'vitest';
import { learnedScoreShift, computeReadinessLearning, LEARNED_HIGH_DELTA } from './readinessLearning';
import { getReadinessFactor, checkFromQuickAnswer } from './readiness';
import { prehabNeeds, prehabNote, PREHAB_MAX_GROUPS } from './prehab';
import { soreStrongPatterns } from './morningCheckIn';
import { generateSessionForDate } from './generateSession';
import { getMovementById } from '../data/movements';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { DailySession, PainFlag, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

const day = (i: number) => `2026-09-${String(i + 1).padStart(2, '0')}`;
const entry = (date: string, rpe: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe, durationMin: 60 });
/** 16 días: los pares duermen mal; su RPE es `rpeBad` y el de los demás `rpeOk`. */
function learning(rpeBad: number, rpeOk: number) {
  const log: ReadinessCheck[] = [];
  const history: SessionHistoryEntry[] = [];
  for (let i = 0; i < 16; i++) {
    const bad = i % 2 === 0;
    log.push(bad ? checkFromQuickAnswer(day(i), 'normal', ['sleep']) : checkFromQuickAnswer(day(i), 'bien', []));
    history.push(entry(day(i), bad ? rpeBad : rpeOk));
  }
  return computeReadinessLearning(log, history);
}
const badSleep: ReadinessCheck = { date: '2026-10-01', sleep: 'mal', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' };

describe('pesos aprendidos de ti', () => {
  it('con datos suficientes, un factor en contra que te cuesta mucho cuenta doble y lo dice', () => {
    const l = learnedScoreShift(badSleep, learning(8, 6.5));
    expect(l.shift).toBe(-1);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]).toMatchObject({ key: 'sleep', kind: 'doble' });
    expect(l.lines[0].text).toContain('pesa doble hoy');
    expect(l.lines[0].text).toContain('+1,5 de RPE');
  });

  it('uno que apenas te afecta no se cuenta en contra', () => {
    const l = learnedScoreShift(badSleep, learning(7, 7));
    expect(l.shift).toBe(1);
    expect(l.lines[0]).toMatchObject({ key: 'sleep', kind: 'neutro' });
    expect(l.lines[0].text).toContain('apenas te afecta');
  });

  it('sin datos suficientes, o con un factor que hoy no está en contra, no cambia nada', () => {
    expect(learnedScoreShift(badSleep, { ...learning(8, 6.5), ready: false })).toEqual({ shift: 0, lines: [] });
    const fine: ReadinessCheck = { ...badSleep, sleep: 'bien' };
    expect(learnedScoreShift(fine, learning(8, 6.5))).toEqual({ shift: 0, lines: [] });
  });

  it('el ajuste cuenta en la autorregulación de la carga del check-in', () => {
    const base: ReadinessCheck = { date: '2026-10-01', sleep: 'mal', soreness: 'leve', stress: 'medio', motivation: 'normal' }; // -1
    expect(getReadinessFactor(base).factor).toBe(1);
    // si dormir mal te cuesta mucho, ese -1 pasa a -2 y baja la carga
    const doble = getReadinessFactor({ ...base, learnedShift: -1 });
    expect(doble.isLow).toBe(true);
    expect(doble.factor).toBeLessThan(1);
    // y si a ti no te afecta, dos factores en contra (-2) dejan de bajar la carga
    const two: ReadinessCheck = { ...base, soreness: 'alto' }; // -2
    expect(getReadinessFactor(two).isLow).toBe(true);
    expect(getReadinessFactor({ ...two, learnedShift: 1 }).isLow).toBe(false);
  });

  it('el umbral de "cuenta doble" es de un punto de RPE', () => {
    expect(LEARNED_HIGH_DELTA).toBe(1);
  });
});

describe('prehab: qué zonas se preparan', () => {
  it('primero las molestias activas y luego las agujetas (las fuertes antes), sin repetir y hasta dos zonas', () => {
    expect(prehabNeeds(['rodilla'], { 'hombro-d': 1 })).toEqual([
      { group: 'rodilla', cause: 'molestia' },
      { group: 'hombro', cause: 'agujetas' },
    ]);
    expect(prehabNeeds([], { 'muslo-i': 1, lumbar: 2 })).toEqual([
      { group: 'lumbar', cause: 'agujetas' },
      { group: 'piernas', cause: 'agujetas' },
    ]);
    expect(prehabNeeds(['hombro'], { 'hombro-i': 2, 'codo-d': 1, 'muslo-i': 1 })).toHaveLength(PREHAB_MAX_GROUPS);
    expect(prehabNeeds(['hombro'], { 'hombro-i': 2 })).toEqual([{ group: 'hombro', cause: 'molestia' }]);
    expect(prehabNeeds([], undefined)).toEqual([]);
  });

  it('explica por qué entra', () => {
    expect(prehabNote({ group: 'rodilla', cause: 'molestia' })).toContain('aviso de molestia en rodilla');
    expect(prehabNote({ group: 'piernas', cause: 'agujetas' })).toContain('agujetas en piernas');
  });
});

describe('prehab, agujetas fuertes y sustituciones en la sesión', () => {
  const profile = (extra: Partial<ReturnType<typeof makeProfile>> = {}) =>
    makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'phaseD' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }], ...extra });
  const dates = consecutiveDates('2026-01-05', 84);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const withSore = (soreZones: ReadinessCheck['soreZones'], d: Date): DailySession => {
    const check: ReadinessCheck = { date: iso(d), sleep: 'bien', soreness: 'leve', stress: 'bajo', motivation: 'alta', soreZones };
    const p = profile({ readinessLog: [check] });
    return generateSessionForDate(p, [], d, p.goals);
  };
  const plain = (d: Date) => generateSessionForDate(profile(), [], d, []);
  const KNEE: PainFlag = { id: 'k', area: 'rodilla', createdDate: '2025-12-20', until: null };
  const prehabOf = (s: DailySession) => s.blocks.filter((b) => b.block === 'warmup' && b.subgroup?.startsWith('Prehab'));
  const trainingDays = dates.filter((d) => {
    const s = plain(d);
    return !s.isRestDay && s.blocks.some((b) => b.block === 'strength');
  });

  it('con una molestia en la rodilla el calentamiento suma una activación de rodilla; sin molestia, nada', () => {
    const p = profile({ painFlags: [KNEE] });
    for (const d of trainingDays.slice(0, 10)) {
      const s = generateSessionForDate(p, [], d, p.goals);
      const prehab = prehabOf(s);
      expect(prehab.length, iso(d)).toBeGreaterThanOrEqual(1);
      expect(prehab[0].subgroup).toBe('Prehab · rodilla');
      expect(getMovementById(prehab[0].movementId)?.tags, iso(d)).toContain('prehab-rodilla');
      expect(prehab[0].notes).toContain('aviso de molestia');
      expect(prehabOf(plain(d)), iso(d)).toEqual([]);
    }
  });

  it('con agujetas marcadas en el hombro se prepara el hombro', () => {
    for (const d of trainingDays.slice(0, 8)) {
      const s = withSore({ 'hombro-d': 1 }, d);
      expect(prehabOf(s).map((b) => b.subgroup), iso(d)).toEqual(['Prehab · hombro']);
    }
  });

  it('con agujetas fuertes de piernas el WOD evita sentadillas, zancadas y saltos y la fuerza de un día de sentadilla lleva menos series', () => {
    const strong = soreStrongPatterns({ 'muslo-i': 2 });
    expect([...strong].sort()).toEqual(['jump', 'lunge', 'squat']);
    expect(soreStrongPatterns({ 'muslo-i': 1 }).size).toBe(0);
    let cuts = 0;
    for (const d of trainingDays) {
      const base = plain(d);
      const s = withSore({ 'muslo-i': 2 }, d);
      const wodPatterns = s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:')).map((b) => getMovementById(b.movementId)?.pattern);
      // la exclusión es suave (si no queda nada, se relaja), pero casi nunca debe colarse un movimiento de esos patrones
      const hits = wodPatterns.filter((p) => p !== undefined && strong.has(p)).length;
      expect(hits, iso(d)).toBeLessThanOrEqual(1);
      if (s.soreStrengthCut) {
        cuts += 1;
        const sets = (x: DailySession) => x.blocks.find((b) => b.block === 'strength' && !b.subgroup)?.sets ?? 0;
        expect(sets(s), iso(d)).toBeLessThanOrEqual(sets(base));
        expect(s.coachReasons?.join(' ')).toContain('Agujetas fuertes hoy');
      }
    }
    expect(cuts).toBeGreaterThan(0);
  });

  it('con una molestia de rodilla el accesorio SUSTITUYE la pierna por otro trabajo en vez de quitarla', () => {
    const p = profile({ painFlags: [KNEE] });
    const roles = (s: DailySession) => s.blocks.filter((b) => b.block === 'accessory' && b.accessoryRole).map((b) => b.accessoryRole!);
    let lowerDays = 0;
    for (const d of trainingDays) {
      const base = roles(plain(d));
      if (!base.includes('unilateralLeg') && !base.includes('plyo')) continue;
      lowerDays += 1;
      const s = roles(generateSessionForDate(p, [], d, p.goals));
      expect(s, iso(d)).not.toContain('unilateralLeg');
      expect(s, iso(d)).not.toContain('plyo');
      // el bloque conserva su tamaño: lo que se quitó se sustituye
      expect(s.length, iso(d)).toBeGreaterThanOrEqual(base.length - 1);
    }
    expect(lowerDays).toBeGreaterThan(3);
  });
});
