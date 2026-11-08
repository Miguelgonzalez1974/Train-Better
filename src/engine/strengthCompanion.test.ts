import { describe, expect, it } from 'vitest';
import type { StrengthProgram } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { generateCompanionSession, generateSessionForDate, hasActiveTrainingStructure } from './generateSession';
import {
  acceptCompanion,
  companionCounts,
  companionDueDate,
  companionPosition,
  companionStatus,
  companionTotalSessions,
  completeCompanion,
  declineCompanion,
  isCompanionProgram,
  isCompanionTestSession,
  newCompanion,
  pauseCompanion,
  skipCompanion,
  supportsCompanion,
  undoAcceptCompanion,
  undoDeclineCompanion,
  weekdayOf,
  type CompanionProgram,
} from './strengthCompanion';

// 2026-11-16 es lunes.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const FRI = '2026-11-20';

function program(over: Partial<StrengthProgram> = {}): CompanionProgram {
  return {
    id: 'p1',
    startDate: MON,
    endDate: '2027-06-27',
    method: 'temporada',
    lifts: ['benchPress', 'backSquat', 'strictPress'],
    companion: newCompanion([0, 2, 4]),
    ...over,
  } as CompanionProgram;
}
const profileWith = (p: CompanionProgram) => makeProfile({ strengthPrograms: [p], macrocycles: [{ id: 'm', label: 'M', startDate: '2026-11-09', endDate: '2027-06-27' }], trainingDaysPerWeek: 6 });
const only = (profile: ReturnType<typeof profileWith>) => profile.strengthPrograms![0] as CompanionProgram;

describe('días y posiciones', () => {
  it('lunes = 0, domingo = 6', () => {
    expect(weekdayOf(MON)).toBe(0);
    expect(weekdayOf('2026-11-22')).toBe(6);
  });

  it('la sesión n cae en la semana n / k y en el puesto n % k, con la fecha sintética de esa semana', () => {
    const p = program();
    expect(companionPosition(p, 0)).toEqual({ week: 0, dayInWeek: 0, syntheticDate: MON });
    expect(companionPosition(p, 4)).toEqual({ week: 1, dayInWeek: 1, syntheticDate: '2026-11-23' });
  });

  it('el Bloque de Temporada son 8 semanas por los días elegidos, y la primera y la última semana son de test', () => {
    const p = program();
    expect(companionTotalSessions(p)).toBe(24);
    expect(isCompanionTestSession(p, 0)).toBe(true);
    expect(isCompanionTestSession(p, 2)).toBe(true);
    expect(isCompanionTestSession(p, 3)).toBe(false);
    expect(isCompanionTestSession(p, 20)).toBe(false);
    expect(isCompanionTestSession(p, 21)).toBe(true);
    expect(isCompanionTestSession(program({ method: '531' }), 0)).toBe(false);
    expect(companionTotalSessions(program({ method: '531' }))).toBeNull();
  });

  it('halterofilia y Mayhem no encajan como complemento', () => {
    expect(supportsCompanion('haltero')).toBe(false);
    expect(supportsCompanion('mayhem-pico')).toBe(false);
    expect(supportsCompanion('temporada')).toBe(true);
    expect(supportsCompanion('531')).toBe(true);
  });
});

describe('cuándo toca y qué hacer con cada respuesta', () => {
  it('el primer día señalado desde el inicio se ofrece; antes de empezar, no', () => {
    const p = program();
    expect(companionStatus(p, '2026-11-15')).toEqual({ kind: 'no-empieza', startDate: MON });
    expect(companionStatus(p, MON)).toMatchObject({ kind: 'oferta', index: 0, late: false });
    expect(companionDueDate(p)).toBe(MON);
  });

  it('un día no señalado no se ofrece, y si la sesión ya tocaba antes sale como pendiente', () => {
    const base = program();
    const afterMonday = { ...base, companion: { ...base.companion, cursor: 1, lastResolvedOn: MON } };
    expect(companionStatus(afterMonday, TUE)).toEqual({ kind: 'espera', dueDate: WED });
    expect(companionStatus(afterMonday, WED)).toMatchObject({ kind: 'oferta', index: 1, late: false });
    expect(companionStatus(afterMonday, '2026-11-19')).toMatchObject({ kind: 'oferta', late: true });
  });

  it('«hoy no» aplaza: hoy no se ofrece, mañana sí aunque no sea día señalado, y cuenta el aplazamiento', () => {
    let profile = profileWith(program());
    profile = declineCompanion(profile, 'p1', MON);
    expect(only(profile).companion).toMatchObject({ declinedOn: MON, deferrals: 1, cursor: 0 });
    expect(companionStatus(only(profile), MON)).toMatchObject({ kind: 'aplazada', deferrals: 1 });
    expect(companionStatus(only(profile), TUE)).toMatchObject({ kind: 'oferta', index: 0, late: true });
    // decir «hoy no» dos veces el mismo día no suma dos aplazamientos
    expect(only(declineCompanion(profile, 'p1', MON)).companion.deferrals).toBe(1);
    expect(only(undoDeclineCompanion(profile, 'p1', MON)).companion).toMatchObject({ declinedOn: undefined, deferrals: 0 });
  });

  it('«hacerla hoy» la acepta y se puede deshacer', () => {
    let profile = acceptCompanion(profileWith(program()), 'p1', MON);
    expect(companionStatus(only(profile), MON)).toEqual({ kind: 'aceptada', index: 0 });
    profile = undoAcceptCompanion(profile, 'p1');
    expect(companionStatus(only(profile), MON)).toMatchObject({ kind: 'oferta' });
  });

  it('hacerla avanza el puntero, apunta lo que salió y la siguiente toca el próximo día señalado', () => {
    let profile = declineCompanion(profileWith(program()), 'p1', MON);
    profile = completeCompanion(profile, 'p1', TUE, { label: 'Press banca · test', loadKg: 110, rpe: 8, durationMin: 40 });
    expect(only(profile).companion).toMatchObject({ cursor: 1, lastResolvedOn: TUE, deferrals: 0, declinedOn: undefined });
    expect(profile.companionLog).toEqual([{ id: 'p1|0', programId: 'p1', index: 0, date: TUE, outcome: 'hecha', label: 'Press banca · test', loadKg: 110, rpe: 8, durationMin: 40 }]);
    expect(companionStatus(only(profile), TUE)).toEqual({ kind: 'hecha-hoy' });
    expect(companionStatus(only(profile), WED)).toMatchObject({ kind: 'oferta', index: 1, late: false });
    expect(companionCounts(profile, 'p1')).toEqual({ done: 1, skipped: 0 });
  });

  it('saltar avanza sin hacerla y queda apuntado como saltada', () => {
    const profile = skipCompanion(profileWith(program()), 'p1', MON, 'Press banca');
    expect(only(profile).companion.cursor).toBe(1);
    expect(profile.companionLog?.[0]).toMatchObject({ outcome: 'saltada', index: 0 });
    expect(companionCounts(profile, 'p1')).toEqual({ done: 0, skipped: 1 });
  });

  it('pausar N días: nada hasta pasada la pausa', () => {
    const profile = pauseCompanion(profileWith(program()), 'p1', MON, 3);
    expect(only(profile).companion.pausedUntil).toBe('2026-11-18');
    expect(companionStatus(only(profile), WED)).toEqual({ kind: 'pausado', until: '2026-11-18' });
    expect(companionStatus(only(profile), '2026-11-19')).toMatchObject({ kind: 'oferta', late: true });
  });

  it('al llegar a la última sesión de la temporada, el programa termina; y pasada su fecha de fin, también', () => {
    const p = program();
    const done = { ...p, companion: { ...p.companion, cursor: 24, lastResolvedOn: FRI } };
    expect(companionStatus(done, '2027-01-11')).toEqual({ kind: 'terminado' });
    expect(companionStatus(program({ endDate: '2026-12-01' }), '2026-12-02')).toEqual({ kind: 'terminado' });
  });

  it('un programa normal (sin companion) no se toca', () => {
    const plain: StrengthProgram = { id: 'x', startDate: MON, endDate: '2027-01-01', method: '531', lifts: [] };
    expect(isCompanionProgram(plain)).toBe(false);
    const profile = makeProfile({ strengthPrograms: [plain] });
    expect(acceptCompanion(profile, 'x', MON)).toBe(profile);
  });
});

describe('la sesión del programa y la convivencia con el macro', () => {
  it('un programa que convive NO sustituye la sesión del macro (uno normal, sí)', () => {
    const date = new Date(`${WED}T12:00:00`);
    const macroOnly = generateSessionForDate(makeProfile({ macrocycles: [{ id: 'm', label: 'M', startDate: '2026-11-09', endDate: '2027-06-27' }], trainingDaysPerWeek: 6 }), [], date, []);
    const withCompanion = generateSessionForDate(profileWith(program()), [], date, []);
    expect(withCompanion.strengthProgramLabel).toBeUndefined();
    expect(withCompanion.blocks.map((b) => b.block)).toEqual(macroOnly.blocks.map((b) => b.block));

    const normal = { ...program(), companion: undefined } as unknown as StrengthProgram;
    const replaced = generateSessionForDate(makeProfile({ strengthPrograms: [normal], trainingDaysPerWeek: 6 }), [], date, []);
    expect(replaced.strengthProgramLabel).toBeDefined();
  });

  it('un programa que convive, sin macro, no cuenta como estructura de entreno', () => {
    expect(hasActiveTrainingStructure(makeProfile({ macrocycles: [], strengthPrograms: [program()] }), WED)).toBe(false);
  });

  it('la sesión 1 del Bloque de Temporada es un test del primer levantamiento de la lista, con su carga de referencia', () => {
    const plan = generateCompanionSession(profileWith(program()), [], program(), MON);
    expect(plan).not.toBeNull();
    expect(plan).toMatchObject({ index: 0, week: 1, perWeek: 3, total: 24, isTest: true, movementId: 'bench-press' });
    expect(plan!.loadKg).toBeGreaterThan(0);
    expect(plan!.title).toContain('test');
  });

  it('las sesiones siguientes rotan de levantamiento y las olas suben de semana en semana', () => {
    const p = program();
    const at = (cursor: number) => generateCompanionSession(profileWith(p), [], { ...p, companion: { ...p.companion, cursor } }, MON)!;
    expect(at(1).movementId).toBe('back-squat');
    // el tercer puesto de la semana de test es el test de complex del programa (varios movimientos a la misma carga)
    expect(at(2).blocks.length).toBeGreaterThan(1);
    expect(at(2).format).toContain('Complex');
    expect(at(5).movementId).toBe('strict-press');
    // semana 2 (índice 3-5) ya no es test, semana 3 pesa más que la 2 con el mismo levantamiento
    expect(at(3).isTest).toBe(false);
    expect(at(6).loadKg).toBeGreaterThan(at(3).loadKg);
    expect(at(3).week).toBe(2);
    expect(at(6).week).toBe(3);
  });

  it('halterofilia no genera sesión de complemento', () => {
    const p = program({ method: 'haltero' });
    expect(generateCompanionSession(profileWith(p), [], p, MON)).toBeNull();
  });
});
