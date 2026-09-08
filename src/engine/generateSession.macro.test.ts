import { describe, it, expect } from 'vitest';
import { adoptAdditiveEngineFields, bestAffinityPartner, generateSessionForDate, WOD_SYNONYM_GROUPS } from './generateSession';
import { WOD_PAIR_AFFINITY } from './wodDomains';
import type { DailySession } from '../data/athlete/types';
import {
  makeProfile,
  makeStrengthGoal,
  consecutiveDates,
  simulateSessions,
  loadsAreFinite,
  allIdsResolve,
} from './__fixtures';
import { getMovementById } from '../data/movements';

const START = '2026-01-05'; // lunes, semana 1 del macro fixture
const THREE_WEEKS = consecutiveDates(START, 21);

describe('generateSessionForDate — macrociclo', () => {
  it('es determinista: la misma fecha produce sesiones identicas', () => {
    const profile = makeProfile();
    for (const d of consecutiveDates(START, 10)) {
      const a = generateSessionForDate(profile, [], d, profile.goals);
      const b = generateSessionForDate(profile, [], d, profile.goals);
      expect(a).toEqual(b);
    }
  });

  it('nunca produce loadKg NaN o negativo', () => {
    const profile = makeProfile();
    const bad: string[] = [];
    for (const d of THREE_WEEKS) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (!loadsAreFinite(s)) bad.push(s.date);
    }
    expect(bad).toEqual([]);
  });

  it('todos los ids de movimiento existen en el catalogo', () => {
    const profile = makeProfile();
    const missing = new Set<string>();
    for (const d of THREE_WEEKS) {
      const res = allIdsResolve(generateSessionForDate(profile, [], d, profile.goals));
      res.missing.forEach((m) => missing.add(m));
    }
    expect([...missing]).toEqual([]);
  });

  it('el WOD no mezcla cuasi-sinonimos (box jump + box jump over, dos variantes de dominada, etc.)', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6 });
    const violations: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      // Un formato multironda lista un movimiento por ronda a proposito -> comparamos ids distintos.
      const wodIds = new Set(
        s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:')).map((b) => b.movementId),
      );
      for (const group of WOD_SYNONYM_GROUPS) {
        const clash = group.filter((id) => wodIds.has(id));
        if (clash.length > 1) violations.push(`${s.date}: ${clash.join(' + ')}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('el primer del complejo de oly nunca es un drill de jerk', () => {
    const profile = makeProfile();
    const bad: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const primer = s.blocks.find((b) => b.block === 'oly' && !b.subgroup);
      if (primer && /jerk/.test(primer.movementId)) bad.push(`${s.date}: ${primer.movementId}`);
    }
    expect(bad).toEqual([]);
  });

  it('no programa el mismo patron de fuerza dos dias de entreno seguidos', () => {
    const profile = makeProfile();
    const patterns = simulateSessions(profile, consecutiveDates(START, 28))
      .map((s) => s.blocks.find((b) => b.block === 'strength'))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => getMovementById(b.movementId)?.pattern ?? b.movementId);
    let backToBack = 0;
    for (let i = 1; i < patterns.length; i++) if (patterns[i] === patterns[i - 1]) backToBack++;
    expect(backToBack, `${patterns.join(' ')}`).toBe(0);
  });

  it('con objetivo intensivo de peso muerto, la bisagra NO monopoliza el mes', () => {
    const profile = makeProfile({ goals: [makeStrengthGoal('deadlift', 'intensivo')] });
    const patterns = simulateSessions(profile, consecutiveDates(START, 28))
      .flatMap((s) => s.blocks.filter((b) => b.block === 'strength'))
      .map((b) => getMovementById(b.movementId)?.pattern);
    expect(patterns.length).toBeGreaterThan(0);
    const hinge = patterns.filter((p) => p === 'hinge').length;
    // Mas frecuencia por el objetivo, pero no toda la programacion.
    expect(hinge / patterns.length).toBeLessThan(0.7);
    expect(patterns).toContain('squat');
    expect(patterns.some((p) => p === 'verticalPush' || p === 'horizontalPush')).toBe(true);
  });

  it('todo WOD trae un objetivo de esfuerzo (RPE) y una pista de ritmo, y el RPE sigue la onda del meso', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const rpeByWeek: Record<number, Set<string>> = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
    for (const d of consecutiveDates(START, 28)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const wod = s.blocks.find((b) => b.block === 'wod');
      if (!wod || s.isRestDay) continue;
      const note = wod.notes ?? '';
      expect(note, `${s.date} WOD sin objetivo de RPE`).toMatch(/RPE ~\S/);
      // benchmark del día 0 no lleva "Ritmo:" (no tiene formato generado); el resto sí.
      if (!wod.movementId.startsWith('benchmark:')) expect(note, `${s.date} sin pista de ritmo`).toContain('Ritmo:');
      const m = note.match(/RPE ~([\d-]+)/);
      if (m && s.mesocycleWeek >= 1 && s.mesocycleWeek <= 4) rpeByWeek[s.mesocycleWeek].add(m[1]);
    }
    // La onda: semana 1 apunta a 7, semana 3 a 9, semana 4 a descarga (5-6).
    if (rpeByWeek[1].size) expect([...rpeByWeek[1]]).toEqual(['7']);
    if (rpeByWeek[3].size) expect([...rpeByWeek[3]]).toEqual(['9']);
    if (rpeByWeek[4].size) expect([...rpeByWeek[4]]).toEqual(['5-6']);
  });

  it('todo lift con carga es registrable: si no tiene series marcables, trae logAsSingle', () => {
    // 42 dias con objetivo de PR -> incluye dias de test de 1RM (fuerza y oly) y semanas pico.
    const profile = makeProfile({ trainingDaysPerWeek: 6, goals: [makeStrengthGoal('clean', 'intensivo')] });
    const bad: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      for (const b of s.blocks) {
        // Solo el trabajo real de fuerza/oly: los `subgroup` son calentamiento de barra (no se registran).
        if ((b.block !== 'oly' && b.block !== 'strength') || b.subgroup || !b.loadKg) continue;
        if (b.movementId.startsWith('benchmark:')) continue;
        const markable = (b.sets ?? 0) >= 2;
        if (!markable && !b.logAsSingle) bad.push(`${s.date}: ${b.movementId} (${b.reps}) sets=${b.sets ?? 'undef'}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('adoptAdditiveEngineFields: una sesión registrada adopta logAsSingle sin tocar la prescripción', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6, goals: [makeStrengthGoal('clean', 'intensivo')] });
    const dates = consecutiveDates(START, 42);
    // Primer día cuyo entreno trae un lift de serie única (single del día, EMOM o test de 1RM).
    const dayWithSingle = dates.find((d) =>
      generateSessionForDate(profile, [], d, profile.goals).blocks.some((b) => b.logAsSingle),
    );
    expect(dayWithSingle, 'no se generó ningún lift de serie única en 42 días').toBeTruthy();

    const fresh = generateSessionForDate(profile, [], dayWithSingle!, profile.goals);
    const singleIdx = fresh.blocks.findIndex((b) => b.logAsSingle);
    // Simula lo cacheado por una versión vieja: sin el flag y con una carga editada a mano.
    const stale: DailySession = {
      ...fresh,
      genVersion: 1,
      blocks: fresh.blocks.map((b, i) => {
        const rest = { ...b };
        delete rest.logAsSingle;
        return i === singleIdx ? { ...rest, loadKg: (rest.loadKg ?? 0) + 7 } : rest;
      }),
    };

    const adopted = adoptAdditiveEngineFields(stale, profile, [], dayWithSingle!, profile.goals);
    expect(adopted).not.toBe(stale);
    expect(adopted.blocks[singleIdx].logAsSingle).toBe(true);
    // La carga (y el resto de la prescripción) del bloque editado se conserva, no se pisa con la fresca.
    expect(adopted.blocks[singleIdx].loadKg).toBe((fresh.blocks[singleIdx].loadKg ?? 0) + 7);
    expect(adopted.blocks[singleIdx].reps).toBe(fresh.blocks[singleIdx].reps);

    // Idempotente: una vez adoptado, no hay nada más que añadir -> misma referencia.
    const again = adoptAdditiveEngineFields(
      { ...adopted, genVersion: 1 },
      profile,
      [],
      dayWithSingle!,
      profile.goals,
    );
    expect(again.blocks[singleIdx].logAsSingle).toBe(true);
  });

  it('adoptAdditiveEngineFields: si la estructura de bloques no coincide, no toca nada', () => {
    const profile = makeProfile();
    const d = consecutiveDates(START, 1)[0];
    const fresh = generateSessionForDate(profile, [], d, profile.goals);
    const scrambled: DailySession = {
      ...fresh,
      genVersion: 1,
      blocks: fresh.blocks.map((b) => ({ ...b, movementId: `${b.movementId}-x` })),
    };
    expect(adoptAdditiveEngineFields(scrambled, profile, [], d, profile.goals)).toBe(scrambled);
  });

  it('la tabla de afinidad de WOD solo referencia movimientos reales', () => {
    const bad: string[] = [];
    for (const [key, partners] of Object.entries(WOD_PAIR_AFFINITY)) {
      if (!getMovementById(key)) bad.push(`clave ${key}`);
      for (const p of partners) if (!getMovementById(p)) bad.push(`${key} -> ${p}`);
    }
    expect(bad).toEqual([]);
  });

  it('bestAffinityPartner elige la pareja mejor valorada presente en el pool', () => {
    const pool = ['kipping-pull-up', 'run', 'deadlift', 'abmat-situp']
      .map((id) => getMovementById(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    // thruster -> [bar-facing-burpee, chest-to-bar-pull-up, kipping-pull-up, ...]; de los del pool, gana kipping-pull-up.
    expect(bestAffinityPartner(['thruster'], pool)).toBe('kipping-pull-up');
    // Nada afín en el pool -> undefined.
    expect(bestAffinityPartner(['rope-climb'], [getMovementById('abmat-situp')!])).toBeUndefined();
    // Una pareja que encaja con DOS movimientos ya elegidos gana a otra que encaja con uno.
    const pool2 = ['double-under', 'row'].map((id) => getMovementById(id)!);
    expect(bestAffinityPartner(['deadlift', 'thruster'], pool2)).toBe('double-under');
  });

  it('el sesgo de afinidad NO mata la variedad: ninguna combinación domina', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const combos = new Map<string, number>();
    let total = 0;
    for (const d of consecutiveDates(START, 140)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const wod = s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:'));
      if (wod.length < 2) continue;
      total++;
      const key = [...new Set(wod.map((b) => b.movementId))].sort().join('+');
      combos.set(key, (combos.get(key) ?? 0) + 1);
    }
    const max = Math.max(...combos.values());
    expect(max / total, 'una combinación de WOD se repite demasiado').toBeLessThan(0.15);
  });

  it('todas las sesiones de 3 semanas traen al menos un bloque', () => {
    const profile = makeProfile();
    const empty: string[] = [];
    for (const d of THREE_WEEKS) {
      const s: DailySession = generateSessionForDate(profile, [], d, profile.goals);
      if (!s.isRestDay && s.blocks.length === 0) empty.push(s.date);
    }
    expect(empty).toEqual([]);
  });
});

describe('generateSessionForDate — composición de la sesión (esqueleto fijo)', () => {
  const hasBlock = (s: DailySession, block: string) => s.blocks.some((b) => b.block === block);
  const hasFormat = (s: DailySession, prefix: string) =>
    s.blocks.some((b) => (b.format ?? '').startsWith(prefix));

  it('todo día de entreno (salvo recuperación) lleva warm up + fuerza + WOD + oly + cool down', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const missing: string[] = [];
    for (const d of consecutiveDates(START, 28)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (s.isRestDay) continue;
      for (const blk of ['warmup', 'strength', 'wod', 'oly', 'cooldown']) {
        if (!hasBlock(s, blk)) missing.push(`${s.date}: falta ${blk}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('skill solo cae en 2 días del microciclo y no consecutivos', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    // trainingDayIndex 0..4 = lunes..viernes del fixture.
    const skillDays: number[] = [];
    consecutiveDates(START, 5).forEach((d, i) => {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (s.blocks.some((b) => b.block === 'skill')) skillDays.push(i);
    });
    expect(skillDays.length).toBe(2);
    expect(skillDays[1] - skillDays[0]).toBeGreaterThan(1);
  });

  it('accesorios en ≤ 2 días por semana; core en ≤ 3 y no consecutivos', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    for (const weekStart of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']) {
      const accDays: number[] = [];
      const coreDays: number[] = [];
      consecutiveDates(weekStart, 5).forEach((d, i) => {
        const s = generateSessionForDate(profile, [], d, profile.goals);
        if (hasFormat(s, 'Superserie')) accDays.push(i);
        if (hasFormat(s, 'Core')) coreDays.push(i);
      });
      expect(accDays.length, `${weekStart} accesorios`).toBeLessThanOrEqual(2);
      expect(coreDays.length, `${weekStart} core`).toBeLessThanOrEqual(3);
      for (let i = 1; i < coreDays.length; i++) {
        expect(coreDays[i] - coreDays[i - 1], `${weekStart} core consecutivo`).toBeGreaterThan(1);
      }
    }
  });

  it('los días de afinar de semana pico llevan fuerza y oly pero en técnico-ligero (menos series + nota del coach)', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const setsOf = (s: DailySession) =>
      s.blocks.filter((b) => b.block === 'strength' && b.sets).reduce((n, b) => n + (b.sets ?? 0), 0);
    const baselineSets = setsOf(generateSessionForDate(profile, [], consecutiveDates(START, 1)[0], profile.goals));

    let lightDays = 0;
    for (const d of consecutiveDates(START, 84)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (s.isRestDay) continue;
      const isLight = (s.coachReasons ?? []).some((r) => /técnico-ligero/i.test(r));
      if (!isLight) continue;
      lightDays++;
      // Sigue llevando los 4 principales, solo que la barra va ligera.
      expect(s.blocks.some((b) => b.block === 'strength'), `${s.date} sin fuerza`).toBe(true);
      expect(s.blocks.some((b) => b.block === 'oly'), `${s.date} sin oly`).toBe(true);
      expect(s.blocks.some((b) => b.block === 'wod'), `${s.date} sin WOD`).toBe(true);
      expect(setsOf(s), `${s.date} no recorta series`).toBeLessThan(baselineSets);
    }
    expect(lightDays, 'no se generó ningún día técnico-ligero en 12 semanas').toBeGreaterThan(0);
  });

  it('el core alterna entre circuito de reps y formato en intervalo Tabata, y el Tabata está bien formado', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    let circuits = 0;
    let tabatas = 0;
    for (const d of consecutiveDates(START, 56)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const core = s.blocks.filter((b) => (b.format ?? '').startsWith('Core'));
      if (core.length === 0) continue;
      const fmt = core[0].format ?? '';
      if (fmt.startsWith('Core · Tabata')) {
        tabatas++;
        expect(new Set(core.map((b) => b.movementId)).size, `${s.date}: Tabata no son 2 movimientos`).toBe(2);
        for (const b of core) {
          expect(b.reps).toBe('20 s');
          expect([4, 6]).toContain(b.sets);
          expect(getMovementById(b.movementId), `${s.date}: ${b.movementId} no existe`).toBeTruthy();
        }
      } else {
        circuits++;
        expect(fmt).toBe('Core · 3 rondas');
      }
    }
    expect(circuits, 'ningún circuito de core en 8 semanas').toBeGreaterThan(0);
    expect(tabatas, 'ningún core en formato Tabata en 8 semanas').toBeGreaterThan(0);
  });

  it('todo WOD generado (no benchmark) trae un objetivo orientativo en la nota', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const missing: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const wod = s.blocks.find((b) => b.block === 'wod');
      if (!wod || s.isRestDay || wod.movementId.startsWith('benchmark:')) continue;
      if (!/Objetivo orientativo/.test(wod.notes ?? '')) missing.push(`${s.date}: ${wod.format}`);
    }
    expect(missing).toEqual([]);
  });

  it('aparecen los formatos nuevos: "al máximo" (puntúa reps) y cardio chipper (base aeróbica)', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    let maxReps = 0;
    let cardioChipper = 0;
    for (const d of consecutiveDates(START, 168)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const wod = s.blocks.filter((b) => b.block === 'wod');
      if (wod.length === 0 || wod[0].movementId.startsWith('benchmark:')) continue;
      const fmt = wod[0].format ?? '';
      if (fmt.startsWith('Al máximo')) {
        maxReps++;
        expect(wod[0].wodTarget?.scoreType, `${s.date} maxReps sin objetivo de reps`).toBe('reps');
        expect(wod[0].notes).toMatch(/Objetivo orientativo: ~\d+-\d+ reps/);
      }
      if (fmt.startsWith('Cardio chipper')) {
        cardioChipper++;
        expect(wod.length).toBeGreaterThanOrEqual(2);
        expect(wod[0].wodTarget?.scoreType).toBe('time');
        // 3 tramos descendentes en cada entrada.
        for (const b of wod) expect((b.reps ?? '').match(/\d+/g)?.length).toBe(3);
        // Nunca single + double under en el mismo chipper.
        const ids = wod.map((b) => b.movementId);
        expect(ids.includes('single-under') && ids.includes('double-under')).toBe(false);
      }
    }
    expect(maxReps, 'ningún WOD "al máximo" en 24 semanas').toBeGreaterThan(0);
    expect(cardioChipper, 'ningún cardio chipper en 24 semanas').toBeGreaterThan(0);
  });

  it('con peso corporal registrado, los movimientos de WOD sin PR propio (thruster, KB, DB…) llevan carga', () => {
    const withBw = makeProfile({ trainingDaysPerWeek: 5, bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    const noBw = makeProfile({ trainingDaysPerWeek: 5 });
    const BW_MOVES = new Set([
      'thruster',
      'shoulder-to-overhead',
      'sumo-deadlift-high-pull',
      'kettlebell-swing-russian',
      'kettlebell-swing-american',
      'dumbbell-snatch',
      'dumbbell-clean-and-jerk',
      'dumbbell-push-jerk',
      'devils-press',
    ]);
    let loadedWithBw = 0;
    let loadedWithoutBw = 0;
    for (const d of consecutiveDates(START, 84)) {
      for (const [profile, bump] of [
        [withBw, (n: number) => (loadedWithBw += n)] as const,
        [noBw, (n: number) => (loadedWithoutBw += n)] as const,
      ]) {
        const s = generateSessionForDate(profile, [], d, profile.goals);
        for (const b of s.blocks) {
          if (b.block !== 'wod' || b.movementId.startsWith('benchmark:')) continue;
          if (BW_MOVES.has(b.movementId) && b.loadKg && b.loadKg > 0) bump(1);
        }
      }
    }
    expect(loadedWithBw, 'con peso corporal, ningún movimiento sin-PR recibió carga').toBeGreaterThan(0);
    expect(loadedWithoutBw, 'sin peso corporal no debería derivarse carga de esos movimientos').toBe(0);
  });

  it('el día de recuperación activa (6 días/semana) lleva un remate de brazos', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6 });
    // 2026-01-08 es jueves = día de recuperación en el calendario de 6 días.
    const thursday = generateSessionForDate(profile, [], new Date('2026-01-08T12:00:00'), profile.goals);
    expect(thursday.isRestDay).toBe(false);
    expect(thursday.blocks.some((b) => (b.format ?? '').startsWith('Brazos'))).toBe(true);
    expect(thursday.blocks.some((b) => b.block === 'strength')).toBe(false);
  });
});
