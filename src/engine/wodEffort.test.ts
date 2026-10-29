import { describe, expect, it } from 'vitest';
import { generateSessionForDate, toHistoryEntry } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { estimatePlannedStrain, planFit } from './plannedStrain';
import { buildStrainTarget } from './strainTarget';
import { strainFromSrpe } from './strain';
import { effortFitScore, rerankByEffort, strainWithCandidate, wodSrpe, type WodEffortMode } from './wodEffort';
import type { RankedWod } from './wodSelection';
import type { WodProfile } from './wodProfile';
import type { AthleteProfile, DailySession, Goal, SessionHistoryEntry } from '../data/athlete/types';

const T = { low: 45, high: 65 };
const prof = (min: number | null, rpe: number | null): WodProfile =>
  ({ id: 'x', structure: 'full', expectedMin: min, durationSource: 'modelo', confidence: 'media', energy: 'mixto', density: 10, expectedRpe: rpe, strain: null, load: { score: 20, label: 'ligera', tonnageKg: 0, impact: 0, grip: 0, overhead: 0, skill: 0 } }) as WodProfile;
const ranked = (id: string, score: number): RankedWod => ({ wod: { id } as RankedWod['wod'], score, parts: {} as RankedWod['parts'] });

describe('encaje de esfuerzo', () => {
  it('dentro del objetivo vale 1; quedarse corto cuesta poco y pasarse cuesta mucho', () => {
    expect(effortFitScore(55, T)).toBe(1);
    expect(effortFitScore(45, T)).toBe(1);
    expect(effortFitScore(65, T)).toBe(1);
    expect(effortFitScore(41, T)).toBeGreaterThan(0.8);
    expect(effortFitScore(69, T)).toBeLessThan(effortFitScore(41, T));
    expect(effortFitScore(80, T)).toBeLessThan(0.1);
    expect(effortFitScore(20, T)).toBeGreaterThanOrEqual(0.2);
  });

  it('baja de forma continua a ambos lados', () => {
    const below = [45, 42, 38, 30, 20].map((s) => effortFitScore(s, T));
    const above = [65, 67, 70, 75, 80].map((s) => effortFitScore(s, T));
    for (let i = 1; i < below.length; i++) expect(below[i]).toBeLessThanOrEqual(below[i - 1]);
    for (let i = 1; i < above.length; i++) expect(above[i]).toBeLessThanOrEqual(above[i - 1]);
  });

  it('el esfuerzo de la sesión con otro WOD cambia solo la parte del WOD', () => {
    const planned = { rpe: 7, minutes: 60, bias: 0 };
    const current = prof(10, 8); // 80 de sRPE
    const same = strainWithCandidate(planned, current, current)!;
    expect(same).toBeCloseTo(strainFromSrpe(7 * 60), 5);
    const longer = strainWithCandidate(planned, current, prof(25, 7))!; // 175
    const shorter = strainWithCandidate(planned, current, prof(4, 9))!; // 36
    expect(longer).toBeGreaterThan(same);
    expect(shorter).toBeLessThan(same);
    expect(strainWithCandidate(planned, current, prof(25, 7))).toBeCloseTo(strainFromSrpe(7 * 60 - 80 + 175), 5);
  });

  it('suma la corrección aprendida y no se sale de 0-100', () => {
    expect(strainWithCandidate({ rpe: 7, minutes: 60, bias: 5 }, prof(10, 8), prof(10, 8))).toBeCloseTo(strainFromSrpe(420) + 5, 5);
    expect(strainWithCandidate({ rpe: 9.5, minutes: 200, bias: 30 }, prof(10, 8), prof(10, 8))).toBe(100);
  });

  it('sin duración conocida no se puede saber', () => {
    expect(wodSrpe(prof(null, null))).toBeNull();
    expect(strainWithCandidate({ rpe: 7, minutes: 60, bias: 0 }, prof(10, 8), prof(null, null))).toBeNull();
    expect(strainWithCandidate({ rpe: 7, minutes: 60, bias: 0 }, undefined, prof(10, 8))).toBeNull();
  });

  it('con la sesión por debajo del objetivo sube el WOD que lo acerca, sin dejar el orden de siempre del todo', () => {
    // Sesión a 52 min de sRPE... el actual es corto (strain bajo); el objetivo pide más.
    const planned = { rpe: 6, minutes: 45, bias: 0 };
    const current = prof(6, 8);
    const profiles: Record<string, WodProfile> = { cur: current, long: prof(24, 7.5), same: prof(6, 8), tiny: prof(3, 7) };
    const list = [ranked('same', 0.9), ranked('tiny', 0.88), ranked('long', 0.86)];
    const out = rerankByEffort(list, planned, { low: 50, high: 62 }, current, (id) => profiles[id]);
    expect(out[0].ranked.wod.id).toBe('long');
    expect(out.find((c) => c.ranked.wod.id === 'long')!.strain).toBeGreaterThan(out.find((c) => c.ranked.wod.id === 'same')!.strain!);
  });

  it('un candidato sin perfil queda neutro: ni gana ni pierde por ello', () => {
    const planned = { rpe: 7, minutes: 60, bias: 0 };
    const out = rerankByEffort([ranked('a', 0.8)], planned, T, prof(10, 8), () => undefined);
    expect(out[0].fit).toBe(0.5);
    expect(out[0].strain).toBeNull();
  });
});

interface Row {
  session: DailySession;
  wodId: string | undefined;
  planned: number;
  fit: string;
}

function simulate(mode: WodEffortMode, goals?: Goal[], macros = ['a', 'b'], days = 112): Row[] {
  const rows: Row[] = [];
  for (const id of macros) {
    const profile: AthleteProfile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }], wodEffortMode: mode, ...(goals ? { goals } : {}) });
    let history: SessionHistoryEntry[] = [];
    for (const d of consecutiveDates('2026-01-12', days)) {
      const iso = d.toISOString().slice(0, 10);
      const session = generateSessionForDate(profile, history, d, profile.goals);
      if (session.isRestDay) continue;
      const prior = history;
      history = [...history, toHistoryEntry(session, 'rx', 7, 60)];
      const planned = estimatePlannedStrain(session, prior, 0);
      const head = session.blocks.find((b) => b.block === 'wod');
      if (!planned || !head || session.doubleWod) continue;
      const wodId = head.wodCatalogId ?? (head.wodLibraryId ? `lib:${head.wodLibraryId}` : undefined);
      rows.push({ session, wodId, planned: planned.strain, fit: planFit(planned, buildStrainTarget(profile, prior, iso)).fit });
    }
  }
  return rows;
}

const off = simulate('off');
const shadow = simulate('shadow');
const on = simulate('on');
const reasonsOf = (r: Row) => (r.session.coachReasons ?? []).join(' | ');

describe('WOD elegido por el esfuerzo de hoy', () => {
  it('en prueba (shadow) sirve exactamente los mismos WODs que apagado, y solo añade una razón', () => {
    expect(shadow).toHaveLength(off.length);
    for (let i = 0; i < off.length; i++) {
      expect(shadow[i].session.blocks, off[i].session.date).toEqual(off[i].session.blocks);
    }
    expect(shadow.filter((r) => /Prueba de esfuerzo/.test(reasonsOf(r))).length).toBeGreaterThan(shadow.length * 0.7);
    expect(off.some((r) => /Prueba de esfuerzo|Elegido por tu esfuerzo/.test(reasonsOf(r)))).toBe(false);
  });

  it('es el modo por defecto: sin el campo en el perfil no cambia ningún WOD', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    const explicit = { ...profile, wodEffortMode: 'off' as const };
    for (const d of consecutiveDates('2026-01-12', 30)) {
      expect(generateSessionForDate(profile, [], d, profile.goals).blocks).toEqual(generateSessionForDate(explicit, [], d, explicit.goals).blocks);
    }
  });

  it('encendido, deja más días dentro del objetivo que apagado y nunca empeora los que se pasan', () => {
    const within = (rows: Row[]) => rows.filter((r) => r.fit === 'dentro').length;
    const over = (rows: Row[]) => rows.filter((r) => r.fit === 'se-pasa').length;
    expect(within(on)).toBeGreaterThan(within(off) + 3);
    expect(over(on)).toBeLessThanOrEqual(over(off));
  });

  it('solo cambia lo que no encaja: la mayoría de los WODs se quedan como estaban', () => {
    const swaps = on.filter((r) => /Elegido por tu esfuerzo/.test(reasonsOf(r)));
    expect(swaps.length).toBeGreaterThan(5);
    expect(swaps.length / on.length).toBeLessThan(0.3);
    for (const r of swaps) expect(reasonsOf(r)).toMatch(/objetivo \d+–\d+/);
  });

  it('un WOD cambiado sigue siendo un WOD real completo (bloques, nota y razones coherentes)', () => {
    for (const r of on.filter((x) => /Elegido por tu esfuerzo/.test(reasonsOf(x)))) {
      const wod = r.session.blocks.filter((b) => b.block === 'wod');
      expect(wod.length, r.session.date).toBeGreaterThan(0);
      expect(r.wodId, r.session.date).toBeTruthy();
      expect(wod[0].notes ?? '', r.session.date).toMatch(/WOD real|Ritmo:/);
      // Las razones del WOD antiguo ya no están: solo una "Hoy toca un WOD real…".
      expect((r.session.coachReasons ?? []).filter((x) => /^Hoy toca un WOD real/.test(x)), r.session.date).toHaveLength(1);
    }
  });

  it('es determinista: el mismo día con los mismos datos da siempre lo mismo', () => {
    const again = simulate('on', undefined, ['a'], 40);
    const first = on.slice(0, again.length);
    expect(again.map((r) => r.wodId)).toEqual(first.map((r) => r.wodId));
  });

  it('no toca el simulacro, la activación ni la víspera de la competición', () => {
    const goals: Goal[] = [{ id: 'g', type: 'preparar-competicion', targetDate: '2026-05-20', emphasis: 'intensivo', createdAt: '2026-01-01' } as Goal];
    const compOff = simulate('off', goals, ['a'], 130);
    const compOn = simulate('on', goals, ['a'], 130);
    expect(compOn.length).toBe(compOff.length);
    let special = 0;
    for (let i = 0; i < compOn.length; i++) {
      const c = compOn[i].session.competition;
      if (c && (c.simulacro || c.phase === 'activacion' || c.phase === 'vispera' || c.eventDay || c.phase === 'post')) {
        special += 1;
        // Esos días no pasan por la elección por esfuerzo: ni se cambia el WOD ni se cuenta nada de ello.
        expect(reasonsOf(compOn[i]), compOn[i].session.date).not.toMatch(/Elegido por tu esfuerzo|encaja con tu objetivo de esfuerzo|Prueba de esfuerzo/);
      }
    }
    expect(special).toBeGreaterThan(0);
  });
});
