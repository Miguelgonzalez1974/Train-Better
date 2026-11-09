import { describe, expect, it } from 'vitest';
import type { CompanionLogEntry, Goal, SessionHistoryEntry, StrengthProgram } from '../data/athlete/types';
import { acceptedCompanionLoad, combinedPlannedStrain, expectedCompanionLoad, withCompanionLoad } from './companionLoad';
import { makeProfile } from './__fixtures';
import { estimatePlannedStrain } from './plannedStrain';
import { computeAcwr } from './loadMetrics';
import { companionPhaseAdjust } from './companionPhase';
import { generateCompanionSession, generateSessionForDate } from './generateSession';
import { dayStrain } from './strain';

const macro = (date: string, rpe: number, durationMin: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe, durationMin });
const comp = (date: string, rpe: number | undefined, durationMin: number | undefined, outcome: 'hecha' | 'saltada' = 'hecha'): CompanionLogEntry => ({ id: `p|${date}`, programId: 'p', index: 0, date, outcome, rpe, durationMin });

describe('la carga del programa de fuerza cuenta', () => {
  it('un día con sesión del macro suma los minutos y conserva el sRPE', () => {
    const [h] = withCompanionLoad([macro('2026-11-09', 7, 60)], [comp('2026-11-09', 8, 40)]);
    expect(h.durationMin).toBe(100);
    // sRPE: 7·60 + 8·40 = 740 → RPE medio 7,4 sobre 100 min.
    expect(h.rpe).toBe(7.4);
    expect(h.companionLoadMin).toBe(40);
    expect(h.movementIds).toEqual(['back-squat']);
  });

  it('el esfuerzo del día sube: el real cuenta las dos sesiones', () => {
    const solo = dayStrain(macro('2026-11-09', 7, 60))!;
    const [both] = withCompanionLoad([macro('2026-11-09', 7, 60)], [comp('2026-11-09', 8, 40)]);
    expect(dayStrain(both)!).toBeGreaterThan(solo);
  });

  it('es idempotente: lo ya fusionado no se suma dos veces', () => {
    const once = withCompanionLoad([macro('2026-11-09', 7, 60)], [comp('2026-11-09', 8, 40)]);
    const twice = withCompanionLoad(once, [comp('2026-11-09', 8, 40)]);
    expect(twice[0].durationMin).toBe(100);
  });

  it('lo saltado o sin RPE y duración no suma, y sin registro devuelve lo mismo', () => {
    const h = [macro('2026-11-09', 7, 60)];
    expect(withCompanionLoad(h, [comp('2026-11-09', 8, 40, 'saltada')])).toBe(h);
    expect(withCompanionLoad(h, [comp('2026-11-09', undefined, 40)])).toBe(h);
    expect(withCompanionLoad(h, undefined)).toBe(h);
  });

  it('un día solo de programa: sin «orphans» no añade entrada (hoy no cuenta como entrenado); con «orphans», para el motor, sí, sin movimientos', () => {
    const h = [macro('2026-11-09', 7, 60)];
    expect(withCompanionLoad(h, [comp('2026-11-10', 8, 40)])).toHaveLength(1);
    const withOrphans = withCompanionLoad(h, [comp('2026-11-10', 8, 40)], { orphans: true });
    expect(withOrphans.map((e) => e.date)).toEqual(['2026-11-09', '2026-11-10']);
    expect(withOrphans[1]).toMatchObject({ movementIds: [], mesocycleWeek: 0, durationMin: 40, rpe: 8 });
  });

  it('la carga acumulada (ACWR) sube con el programa', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
    const history = days.map((d) => macro(d, 6, 50));
    const log = days.map((d) => comp(d, 8, 40));
    const ref = new Date('2026-11-08T00:00:00');
    expect(computeAcwr(withCompanionLoad(history, log), ref).acute).toBeGreaterThan(computeAcwr(history, ref).acute);
  });
});

describe('el esfuerzo previsto cuenta la sesión del programa aceptada', () => {
  it('expectedCompanionLoad: más RPE el día de la marca, menos el de recuperación', () => {
    const vol = expectedCompanionLoad({ role: 'Texas · volumen', intensity: false, lifts: [{ sets: 5, attempt: false }, { sets: 5, attempt: false }] });
    const rec = expectedCompanionLoad({ role: 'Texas · recuperación', intensity: false, lifts: [{ sets: 2, attempt: false }, { sets: 3, attempt: false }] });
    const fri = expectedCompanionLoad({ role: 'Texas · intensidad', intensity: true, lifts: [{ sets: 1, attempt: true }, { sets: 1, attempt: true }] });
    expect(vol).toEqual({ minutes: 40, rpe: 7 });
    expect(rec.rpe).toBe(5.5);
    expect(fri.rpe).toBe(8.5);
  });

  it('el previsto de hoy sube al sumarla y el aviso de «se pasa» la ve', () => {
    const session = { date: '2026-11-09', mesocycleWeek: 2, isRestDay: false, blocks: [{ block: 'strength' as const, movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 }, { block: 'wod' as const, movementId: 'thruster', format: 'AMRAP 12 min' }] };
    const base = estimatePlannedStrain(session, [])!;
    const withTexas = estimatePlannedStrain(session, [], 0, { minutes: 40, rpe: 7 })!;
    expect(withTexas.strain).toBeGreaterThan(base.strain);
    expect(withTexas.minutes).toBe(base.minutes + 40);
    expect(combinedPlannedStrain({ rpe: 7, minutes: 60 }, { rpe: 7, minutes: 40 }).minutes).toBe(100);
  });
});

const program = (cursor = 0): StrengthProgram & { companion: NonNullable<StrengthProgram['companion']> } => ({
  id: 'p', startDate: '2026-01-05', endDate: '2026-06-01', method: 'texas', lifts: [],
  companion: { weekdays: [0, 2, 4], weeks: 20, cursor, deferrals: 0, acceptedOn: undefined },
});

describe('acceptedCompanionLoad', () => {
  it('solo si hoy has aceptado hacerla', () => {
    const p = { ...program(), companion: { ...program().companion, acceptedOn: '2026-03-02' } };
    const profile = makeProfile({ strengthPrograms: [p] });
    const plan = (prog: Parameters<Parameters<typeof acceptedCompanionLoad>[2]>[0]) => generateCompanionSession(profile, [], prog, '2026-03-02', { neutral: true });
    expect(acceptedCompanionLoad(profile, '2026-03-02', plan)).toMatchObject({ rpe: 7 });
    expect(acceptedCompanionLoad(makeProfile({ strengthPrograms: [program()] }), '2026-03-02', plan)).toBeNull();
  });
});

describe('el programa sigue el momento del macro', () => {
  const goal = (targetDate: string): Goal => ({ id: 'g', type: 'preparar-competicion', targetDate, emphasis: 'intensivo', createdAt: '2026-01-01' });

  it('una semana normal no cambia nada', () => {
    expect(companionPhaseAdjust(makeProfile({}), [], new Date('2026-01-12T12:00:00'))).toEqual({ setScale: 1, loadScale: 1, note: '' });
  });

  it('en la semana de descarga del macro baja series y algo de peso', () => {
    // El macro de prueba empieza el lunes 5 de enero: la cuarta semana (26 ene) es la descarga.
    const adj = companionPhaseAdjust(makeProfile({}), [], new Date('2026-01-28T12:00:00'));
    expect(adj).toMatchObject({ setScale: 0.6, loadScale: 0.95 });
    expect(adj.note).toMatch(/descarga/i);
  });

  it('en el taper recorta series y mantiene el peso; en la víspera y la competición casi sobra', () => {
    const profile = makeProfile({ goals: [goal('2026-03-14')] });
    const taper = companionPhaseAdjust(profile, [], new Date('2026-03-09T12:00:00'));
    expect(taper.setScale).toBeLessThan(1);
    expect(taper.loadScale).toBe(1);
    const vispera = companionPhaseAdjust(profile, [], new Date('2026-03-13T12:00:00'));
    expect(vispera).toMatchObject({ setScale: 0.4, loadScale: 0.9 });
    expect(vispera.note).toMatch(/sobra/);
  });

  it('la sesión de volumen del Texas lleva menos series en descarga y su nota lo explica; la marca del viernes no se toca', () => {
    const profile = makeProfile({});
    const normal = generateCompanionSession(profile, [], program(0), '2026-01-12')!;
    const deload = generateCompanionSession(profile, [], program(0), '2026-01-28')!;
    expect(normal.lifts[0].sets).toBe(5);
    expect(deload.lifts[0].sets).toBe(3);
    expect(deload.notes).toMatch(/descarga/i);
    const friday = generateCompanionSession(profile, [], program(2), '2026-01-28')!;
    expect(friday.lifts.every((l) => l.attempt && l.sets === 1)).toBe(true);
  });

  it('el coach ve la carga del programa: con el Texas sumado, el macro de hoy baja el peso y lo explica', () => {
    const profile = makeProfile({});
    const iso = (i: number) => new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10);
    const weekday = (i: number) => new Date(Date.UTC(2026, 1, 1 + i)).getUTCDay();
    // Cuatro semanas de lunes a viernes con un macro tranquilo (RPE 6, 40 min); la última semana, además, un programa duro (RPE 8,5, 80 min).
    const trained = Array.from({ length: 28 }, (_, i) => i).filter((i) => weekday(i) >= 1 && weekday(i) <= 5);
    const history = trained.map((i) => macro(iso(i), 6, 40));
    const log = trained.filter((i) => i >= 21).map((i) => comp(iso(i), 8.5, 80));
    const day = new Date(`${iso(30)}T12:00:00`);
    const strengthLoad = (s: ReturnType<typeof generateSessionForDate>) => s.blocks.find((b) => b.block === 'strength')?.loadKg ?? 0;
    const calm = generateSessionForDate({ ...profile, companionLog: [] }, history, day, []);
    const loaded = generateSessionForDate({ ...profile, companionLog: log }, history, day, []);
    expect(strengthLoad(loaded)).toBeLessThan(strengthLoad(calm));
    expect((loaded.coachReasons ?? []).join(' ')).toMatch(/ACWR/);
    expect((calm.coachReasons ?? []).join(' ')).not.toMatch(/ACWR/);
  });

  it('el programa se autorregula con su propia carga: con varias sesiones duras sumadas, el peso de volumen baja y la nota lo dice', () => {
    const profile = makeProfile({});
    const iso = (i: number) => new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10);
    const history = Array.from({ length: 28 }, (_, i) => macro(iso(i), 6, 40)).filter((_, i) => i % 7 !== 0 && i % 7 !== 6);
    const log = Array.from({ length: 7 }, (_, k) => comp(iso(21 + k), 8, 70));
    const calm = generateCompanionSession({ ...profile, companionLog: [] }, history, program(0), iso(28))!;
    const loaded = generateCompanionSession({ ...profile, companionLog: log }, history, program(0), iso(28))!;
    expect(loaded.lifts[0].loadKg).toBeLessThan(calm.lifts[0].loadKg);
    expect(loaded.notes).toMatch(/ACWR alto/);
  });
});