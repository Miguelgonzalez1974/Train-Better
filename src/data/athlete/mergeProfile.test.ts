import { describe, it, expect } from 'vitest';
import { mergeProfile, mergeHistory, snapshotSyncBase } from './mergeProfile';
import { DEFAULT_PROFILE } from './types';
import type { AthleteProfile, SessionHistoryEntry, WorkSetEntry } from './types';

const base = (): AthleteProfile => JSON.parse(JSON.stringify(DEFAULT_PROFILE));
const ws = (date: string, movementId: string, setNumber: number, kg: number): WorkSetEntry => ({
  date,
  movementId,
  setNumber,
  kg,
  reps: 3,
  block: 'strength',
});
/** Fecha ISO local (mismo metodo que `localTodayIso` en mergeProfile.ts) para no desalinear con timezone en el test. */
function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('mergeProfile — logs: union por clave', () => {
  it('worklog: une entradas de ambos dispositivos (no se pierde ninguna)', () => {
    const remote = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 100)] };
    const local = { ...base(), workLog: [ws('2026-03-02', 'deadlift', 1, 150)] };
    const merged = mergeProfile(remote, local);
    expect(merged.workLog).toHaveLength(2);
    expect(merged.workLog?.map((e) => e.movementId).sort()).toEqual(['back-squat', 'deadlift']);
  });

  it('worklog: en la misma serie (misma clave) gana el local', () => {
    const remote = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 100)] };
    const local = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 105)] };
    const merged = mergeProfile(remote, local);
    expect(merged.workLog).toHaveLength(1);
    expect(merged.workLog?.[0].kg).toBe(105);
  });

  it('pesajes y readiness: union por fecha', () => {
    const remote = { ...base(), bodyweightLog: [{ date: '2026-03-01', kg: 80 }] };
    const local = { ...base(), bodyweightLog: [{ date: '2026-03-03', kg: 79 }] };
    expect(mergeProfile(remote, local).bodyweightLog).toHaveLength(2);
  });

  it('prLog: union, dedup exacto por date+key+kg', () => {
    const p = { date: '2026-03-01', key: 'deadlift', kg: 200 };
    const remote = { ...base(), prLog: [p, { date: '2026-02-01', key: 'snatch', kg: 90 }] };
    const local = { ...base(), prLog: [p, { date: '2026-03-05', key: 'clean', kg: 120 }] };
    const merged = mergeProfile(remote, local);
    expect(merged.prLog).toHaveLength(3);
  });

  it('trainingDatesLog y reviewedMacroWeeks: union de sets', () => {
    const remote = { ...base(), trainingDatesLog: ['2026-03-01', '2026-03-02'], reviewedMacroWeeks: ['m:1'] };
    const local = { ...base(), trainingDatesLog: ['2026-03-02', '2026-03-03'], reviewedMacroWeeks: ['m:2'] };
    const merged = mergeProfile(remote, local);
    expect(merged.trainingDatesLog).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(merged.reviewedMacroWeeks?.sort()).toEqual(['m:1', 'm:2']);
  });

  it('sessionCache: la sesion propia del atleta gana a la generada', () => {
    const remote = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [], genVersion: 14 } },
    };
    const local = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 0, isRestDay: false, blocks: [], source: 'custom' as const } },
    };
    const merged = mergeProfile(remote, local);
    expect(merged.sessionCache?.['2026-03-01'].source).toBe('custom');
  });

  it('sessionCache: un movimiento corregido a mano (editedByAthlete) tambien gana a la version generada sin editar', () => {
    // Bug real: cambiar floor press por bench press en modo edicion no protegia la sesion frente a
    // la sincronizacion -- un segundo dispositivo con la version sin editar podia pisarla igual que
    // pisaba la de la cache vieja (ver el fix anterior de hasRealActivity, para cuando ya hay entreno
    // registrado). Este cubre el caso "el atleta acaba de editar, todavia no ha entrenado".
    const remote = {
      ...base(),
      sessionCache: {
        '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [{ block: 'strength' as const, movementId: 'floor-press' }], genVersion: 30 },
      },
    };
    const local = {
      ...base(),
      sessionCache: {
        '2026-03-01': {
          date: '2026-03-01',
          mesocycleWeek: 1,
          isRestDay: false,
          blocks: [{ block: 'strength' as const, movementId: 'bench-press' }],
          genVersion: 30,
          editedByAthlete: true,
        },
      },
    };
    const merged = mergeProfile(remote, local);
    expect(merged.sessionCache?.['2026-03-01'].blocks[0].movementId).toBe('bench-press');
  });

  it('sessionCache: gana el lado con entreno real registrado ese dia, aunque el genVersion empate (bug real: un segundo dispositivo con cache vieja de "hoy" pisaba la sesion ya entrenada al sincronizar mas tarde)', () => {
    const remote = {
      ...base(),
      workLog: [ws('2026-03-01', 'bench-press', 1, 50)],
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 2, isRestDay: false, blocks: [], genVersion: 30 } },
    };
    const local = {
      ...base(),
      workLog: [],
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [], genVersion: 30 } },
    };
    const merged = mergeProfile(remote, local);
    expect(merged.sessionCache?.['2026-03-01'].mesocycleWeek).toBe(2);
  });

  it('sessionCache: una sesion cerrada en el historial (WOD sin barra, sin entradas en workLog) tambien cuenta como entreno real', () => {
    const remoteHistory: SessionHistoryEntry[] = [
      { date: '2026-03-01', mesocycleWeek: 2, movementIds: ['burpee'], rxOrScaled: 'rx', rpe: 8, durationMin: 20 },
    ];
    const remote = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 2, isRestDay: false, blocks: [], genVersion: 30 } },
    };
    const local = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [], genVersion: 30 } },
    };
    const merged = mergeProfile(remote, local, remoteHistory, []);
    expect(merged.sessionCache?.['2026-03-01'].mesocycleWeek).toBe(2);
  });

  it('sessionCache: recorta por cercania a hoy, no alfabeticamente -- "hoy" nunca desaparece por tener muchos dias futuros cacheados', () => {
    // Bug real: WeekStrip cachea dias futuros al previsualizarlos. Con 21+ de esos, "hoy" era la
    // fecha alfabeticamente mas "antigua" del lote (por detras de un monton de fechas futuras) y el
    // recorte por texto se la comia -- la sesion de hoy, ya entrenada, desaparecia de la cache.
    const now = new Date();
    const today = addDaysIso(now, 0);
    const sessionCache: AthleteProfile['sessionCache'] = {
      [today]: { date: today, mesocycleWeek: 99, isRestDay: false, blocks: [] },
    };
    for (let i = 1; i <= 25; i++) {
      const d = addDaysIso(now, i);
      sessionCache![d] = { date: d, mesocycleWeek: 1, isRestDay: false, blocks: [] };
    }
    const merged = mergeProfile(base(), { ...base(), sessionCache });
    expect(merged.sessionCache?.[today]?.mesocycleWeek).toBe(99);
  });

  it('sessionCache: sin entreno registrado en ninguno de los dos, se mantiene el criterio por genVersion', () => {
    const remote = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [], genVersion: 25 } },
    };
    const local = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 2, isRestDay: false, blocks: [], genVersion: 30 } },
    };
    const merged = mergeProfile(remote, local);
    expect(merged.sessionCache?.['2026-03-01'].mesocycleWeek).toBe(2);
  });
});

describe('mergeProfile — config: gana el local', () => {
  it('PRs: se toman los locales tal cual (dispositivo ya configurado, con onboardedAt)', () => {
    const remote = { ...base(), onboardedAt: '2026-01-01', prs: { ...base().prs, deadlift: 200 } };
    const local = { ...base(), onboardedAt: '2026-01-01', prs: { ...base().prs, deadlift: 190 } };
    expect(mergeProfile(remote, local).prs.deadlift).toBe(190);
  });

  it('dispositivo recien instalado (local sin onboardedAt): PRs y dias/semana ceden a lo remoto, no al perfil de fabrica', () => {
    // Bug real: tras reinstalar la app (o borrar datos del navegador), el local arranca en
    // DEFAULT_PROFILE sin onboardedAt. Si esos valores de fabrica "ganan por ser el local", pisan
    // en silencio los datos reales del atleta que ya vivian en remoto — "6 dias/semana" volvia a
    // "4" y los PRs volvian a los de partida.
    const remote = {
      ...base(),
      onboardedAt: '2026-01-01',
      trainingDaysPerWeek: 6 as const,
      prs: { ...base().prs, deadlift: 200, clean: 130 },
    };
    const local = base(); // recien instalado: sin onboardedAt, valores de fabrica
    const merged = mergeProfile(remote, local);
    expect(merged.trainingDaysPerWeek).toBe(6);
    expect(merged.prs.deadlift).toBe(200);
    expect(merged.prs.clean).toBe(130);
    expect(merged.onboardedAt).toBe('2026-01-01');
  });

  it('objetivos: union por id, gana el local en misma id', () => {
    const remote: AthleteProfile = {
      ...base(),
      goals: [{ id: 'g1', type: 'subir-pr', movementId: 'snatch', targetDate: '2026-05-01', emphasis: 'moderado', createdAt: '2026-01-01' }],
    };
    const local: AthleteProfile = {
      ...base(),
      goals: [
        { id: 'g1', type: 'subir-pr', movementId: 'snatch', targetDate: '2026-05-01', emphasis: 'intensivo', createdAt: '2026-01-01' },
        { id: 'g2', type: 'elevar-fuerza', movementId: 'deadlift', targetDate: '2026-06-01', emphasis: 'moderado', createdAt: '2026-02-01' },
      ],
    };
    const merged = mergeProfile(remote, local);
    expect(merged.goals).toHaveLength(2);
    expect(merged.goals.find((g) => g.id === 'g1')?.emphasis).toBe('intensivo');
  });

  it('painFlags: la version con clearedDate (el atleta lo quito) gana', () => {
    const remote: AthleteProfile = {
      ...base(),
      painFlags: [{ id: 'p1', area: 'hombro', createdDate: '2026-03-01', until: null }],
    };
    const local: AthleteProfile = {
      ...base(),
      painFlags: [{ id: 'p1', area: 'hombro', createdDate: '2026-03-01', until: null, clearedDate: '2026-03-10' }],
    };
    expect(mergeProfile(remote, local).painFlags?.[0].clearedDate).toBe('2026-03-10');
  });

  it('un campo nuevo no contemplado se conserva desde lo remoto (no se pierde)', () => {
    const remote = { ...base(), _futuro: 42 } as unknown as AthleteProfile;
    const merged = mergeProfile(remote, base()) as unknown as { _futuro?: number };
    expect(merged._futuro).toBe(42);
  });

  it('weeklyLocks: union por fecha, ninguna semana bloqueada en un dispositivo se pierde', () => {
    const remote = { ...base(), weeklyLocks: { '2026-03-02': { strengthMovementId: 'back-squat' } } };
    const local = { ...base(), weeklyLocks: { '2026-03-04': { olyMovementId: 'snatch' } } };
    const merged = mergeProfile(remote, local);
    expect(merged.weeklyLocks?.['2026-03-02']?.strengthMovementId).toBe('back-squat');
    expect(merged.weeklyLocks?.['2026-03-04']?.olyMovementId).toBe('snatch');
  });

  it('weeklyLocks: en la misma fecha gana el local (decision de planificacion deliberada)', () => {
    const remote = { ...base(), weeklyLocks: { '2026-03-02': { strengthMovementId: 'back-squat' } } };
    const local = { ...base(), weeklyLocks: { '2026-03-02': { strengthMovementId: 'front-squat' } } };
    const merged = mergeProfile(remote, local);
    expect(merged.weeklyLocks?.['2026-03-02']?.strengthMovementId).toBe('front-squat');
  });

  it('nutritionPrefs: los campos de los menús antiguos no se arrastran al fusionar, el diario y los alimentos propios sí', () => {
    const legacy = {
      excludedFoodIds: ['salmon'],
      swaps: { '2026-03-02|cena|carb': 'arroz' },
      doneMeals: { '2026-03-02': [0, 1] },
      trainingHours: { '0': 17 },
      staples: ['aceite'],
      customMeals: { '2026-10-06': { desayuno: [{ foodId: 'skyr', grams: 200 }] } },
    };
    const remote = { ...base(), nutritionPrefs: { ...legacy, extraFoods: { '2026-10-06': [{ id: 'e1', hour: 10, items: [{ foodId: 'platano', grams: 120 }] }] } } };
    const local = { ...base(), nutritionPrefs: { ...legacy, customFoods: [{ id: 'c1', name: 'Barrita', proteinPer100: 15, carbsPer100: 55, group: 'Extra' as const }] } };
    const merged = mergeProfile(remote, local).nutritionPrefs as Record<string, unknown>;
    for (const k of Object.keys(legacy)) expect(k in merged, k).toBe(false);
    expect(Object.keys(merged).sort()).toEqual(['customFoods', 'extraFoods']);
    expect((merged.extraFoods as Record<string, unknown[]>)['2026-10-06']).toHaveLength(1);
    expect(merged.customFoods).toHaveLength(1);
  });

  it('nutritionPrefs: un dispositivo sin preferencias hereda las remotas', () => {
    const remote = { ...base(), nutritionPrefs: { customFoods: [{ id: 'c1', name: 'Barrita', proteinPer100: 15, carbsPer100: 55, group: 'Extra' as const }] } };
    expect(mergeProfile(remote, base()).nutritionPrefs?.customFoods?.map((f) => f.id)).toEqual(['c1']);
  });
  it('nutritionPrefs: los alimentos propios se unen por id, gana el local en el mismo id', () => {
    const remote = { ...base(), nutritionPrefs: { customFoods: [{ id: 'c1', name: 'Barrita', proteinPer100: 15, carbsPer100: 55, group: 'Extra' as const }] } };
    const local = {
      ...base(),
      nutritionPrefs: {
        customFoods: [
          { id: 'c1', name: 'Barrita (editada)', proteinPer100: 16, carbsPer100: 50, group: 'Extra' as const },
          { id: 'c2', name: 'Batido', proteinPer100: 30, carbsPer100: 10, group: 'Proteína' as const },
        ],
      },
    };
    const merged = mergeProfile(remote, local).nutritionPrefs?.customFoods;
    expect(merged).toHaveLength(2);
    expect(merged?.find((f) => f.id === 'c1')?.name).toBe('Barrita (editada)');
    expect(merged?.find((f) => f.id === 'c2')?.name).toBe('Batido');
  });

  it('nutritionPrefs: los extras del dia se unen por id dentro de cada fecha — no se pierde ninguno de los dos dispositivos', () => {
    const remote = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-06': [{ id: 'e1', hour: 10, items: [{ foodId: 'platano', grams: 120 }] }] } } };
    const local = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-06': [{ id: 'e2', hour: 19, items: [{ foodId: 'cafe', grams: 1 }] }] } } };
    const merged = mergeProfile(remote, local).nutritionPrefs?.extraFoods?.['2026-10-06'];
    expect(merged?.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('nutritionPrefs: en el mismo extra (mismo id) gana el local', () => {
    const remote = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-06': [{ id: 'e1', hour: 10, items: [{ foodId: 'platano', grams: 120 }] }] } } };
    const local = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-06': [{ id: 'e1', hour: 10, items: [{ foodId: 'platano', grams: 240 }] }] } } };
    const merged = mergeProfile(remote, local).nutritionPrefs?.extraFoods?.['2026-10-06'];
    expect(merged).toHaveLength(1);
    expect(merged?.[0].items[0].grams).toBe(240);
  });
});

describe('mergeProfile — esfuerzo previsto del día (strainTargets.planned)', () => {
  const target = (over: Record<string, unknown> = {}) => ({ low: 60, high: 80, readiness: 72, yesterday: null, reasons: [], provisional: false, setOn: '2026-11-02', ...over });

  it('si la versión que gana no trae el previsto, se conserva el de la otra', () => {
    const remote = { ...base(), strainTargets: { '2026-11-02': target({ planned: 65 }) } };
    const local = { ...base(), strainTargets: { '2026-11-02': target() } };
    expect(mergeProfile(remote, local).strainTargets?.['2026-11-02']?.planned).toBe(65);
    expect(mergeProfile(local, remote).strainTargets?.['2026-11-02']?.planned).toBe(65);
  });

  it('con previsto en las dos, gana el local (el último visto antes de entrenar)', () => {
    const remote = { ...base(), strainTargets: { '2026-11-02': target({ planned: 65 }) } };
    const local = { ...base(), strainTargets: { '2026-11-02': target({ planned: 55 }) } };
    expect(mergeProfile(remote, local).strainTargets?.['2026-11-02']?.planned).toBe(55);
  });

  it('un día sin previsto sigue sin él', () => {
    const remote = { ...base(), strainTargets: { '2026-11-02': target() } };
    expect(mergeProfile(remote, base()).strainTargets?.['2026-11-02']).not.toHaveProperty('planned');
  });
});

describe('mergeProfile — lo que dijiste del diagnóstico', () => {
  const check = (date: string, verdict: 'cuadra' | 'no-cuadra') => ({ verdict, samples: 5, date });

  it('por área gana la respuesta más reciente, y las áreas de cada lado se conservan', () => {
    const remote = { ...base(), diagnosisChecks: { motor: check('2026-11-01', 'no-cuadra'), fuerza: check('2026-11-02', 'cuadra') } };
    const local = { ...base(), diagnosisChecks: { motor: check('2026-11-03', 'cuadra') } };
    const merged = mergeProfile(remote, local).diagnosisChecks;
    expect(merged?.motor?.verdict).toBe('cuadra');
    expect(merged?.fuerza?.verdict).toBe('cuadra');
    // una respuesta antigua del local no pisa a la más reciente del remoto
    const stale = { ...base(), diagnosisChecks: { motor: check('2026-10-20', 'no-cuadra') } };
    expect(mergeProfile(local, stale).diagnosisChecks?.motor?.date).toBe('2026-11-03');
  });

  it('sin respuestas no deja nada', () => {
    expect(mergeProfile(base(), base()).diagnosisChecks).toBeUndefined();
  });
});

describe('mergeHistory', () => {
  const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
    date,
    mesocycleWeek: 1,
    movementIds: ['back-squat'],
    rxOrScaled: 'rx',
    rpe: 7,
    durationMin: 60,
    ...extra,
  });

  it('une dias distintos de ambos dispositivos', () => {
    expect(mergeHistory([entry('2026-03-01')], [entry('2026-03-02')])).toHaveLength(2);
  });

  it('en el mismo dia gana la entrada mas completa (testLoadKg / wodResult rellenados despues)', () => {
    const remote = [entry('2026-03-01')];
    const local = [entry('2026-03-01', { testLoadKg: 180 })];
    const merged = mergeHistory(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].testLoadKg).toBe(180);
  });
});

describe('borrados: no vuelven tras sincronizar (fusion de tres vias con la ultima sincronizacion)', () => {
  const macro = (id: string) => ({ id, label: id, startDate: '2026-01-05', endDate: '2026-06-01' });
  const goal = (id: string) => ({ id, type: 'subir-pr' as const, movementId: 'snatch', targetDate: '2026-05-01', emphasis: 'moderado' as const, createdAt: '2026-01-01' });

  it('un macrociclo borrado aqui no revive aunque el remoto aun lo tenga', () => {
    const synced = { ...base(), macrocycles: [macro('invierno'), macro('verano')] };
    const syncBase = snapshotSyncBase(synced, []);
    const local = { ...base(), macrocycles: [macro('verano')] }; // lo borraste aqui; el servidor aun lo tiene
    const merged = mergeProfile(synced, local, undefined, undefined, syncBase);
    expect(merged.macrocycles.map((m) => m.id)).toEqual(['verano']);
  });

  it('un descanso elegido se suma de los dos dispositivos y quitar la marca aqui no la revive', () => {
    expect(mergeProfile({ ...base(), restDates: ['2026-03-01'] }, { ...base(), restDates: ['2026-03-02'] }).restDates).toEqual(['2026-03-01', '2026-03-02']);
    const synced = { ...base(), restDates: ['2026-03-01', '2026-03-02'] };
    const local = { ...base(), restDates: ['2026-03-02'] }; // quitaste la marca del 1 aqui; el servidor aun la tiene
    expect(mergeProfile(synced, local, undefined, undefined, snapshotSyncBase(synced, [])).restDates).toEqual(['2026-03-02']);
  });

  it('sin base (primera sincronizacion) se comporta como la union de siempre', () => {
    const remote = { ...base(), macrocycles: [macro('invierno')] };
    const local = { ...base(), macrocycles: [macro('verano')] };
    expect(mergeProfile(remote, local).macrocycles.map((m) => m.id).sort()).toEqual(['invierno', 'verano']);
  });

  it('lo nuevo del otro dispositivo se conserva y lo que borraron alli desaparece tambien aqui', () => {
    const synced = { ...base(), goals: [goal('a'), goal('b')] };
    const syncBase = snapshotSyncBase(synced, []);
    const remote = { ...base(), goals: [goal('b'), goal('c')] }; // alli borraron a y crearon c
    const merged = mergeProfile(remote, synced, undefined, undefined, syncBase);
    expect(merged.goals.map((g) => g.id).sort()).toEqual(['b', 'c']);
  });

  it('volver a crear algo con la misma clave tras borrarlo si se conserva (serie del modo entreno)', () => {
    const synced = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 100)] };
    const deletedLocally = { ...base(), workLog: [] };
    expect(mergeProfile(synced, deletedLocally, undefined, undefined, snapshotSyncBase(synced, [])).workLog).toHaveLength(0);
    // Tras sincronizar el borrado, la vuelves a marcar: es nueva respecto a la base y entra
    const reAdded = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 102)] };
    expect(mergeProfile(deletedLocally, reAdded, undefined, undefined, snapshotSyncBase(deletedLocally, [])).workLog?.[0].kg).toBe(102);
  });

  it('un apunte del diario de nutricion quitado no vuelve, y uno nuevo si entra', () => {
    const item = (id: string) => ({ id, hour: 9, items: [{ foodId: 'huevos', grams: 110 }] });
    const synced = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-15': [item('x'), item('y')] } } };
    const syncBase = snapshotSyncBase(synced, []);
    const local = { ...base(), nutritionPrefs: { extraFoods: { '2026-10-15': [item('y'), item('z')] } } }; // quitas x, añades z
    const merged = mergeProfile(synced, local, undefined, undefined, syncBase);
    expect(merged.nutritionPrefs?.extraFoods?.['2026-10-15']?.map((e) => e.id).sort()).toEqual(['y', 'z']);
  });

  it('una entrada del historial borrada ("deshacer el registro") no vuelve', () => {
    const e = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });
    const syncBase = snapshotSyncBase(base(), [e('2026-03-01'), e('2026-03-02')]);
    const merged = mergeHistory([e('2026-03-01'), e('2026-03-02')], [e('2026-03-01')], syncBase);
    expect(merged.map((h) => h.date)).toEqual(['2026-03-01']);
  });

  it('la rampa de vuelta borrada aqui no vuelve; una nueva del otro dispositivo si', () => {
    const ramp = { startDate: '2026-03-01', strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 };
    const synced = { ...base(), onboardedAt: '2026-01-01T00:00:00.000Z', intensityRamp: ramp };
    const syncBase = snapshotSyncBase(synced, []);
    const deleted = { ...synced, intensityRamp: undefined };
    expect(mergeProfile(synced, deleted, undefined, undefined, syncBase).intensityRamp).toBeUndefined();
    const newRemote = { ...synced, intensityRamp: { ...ramp, startDate: '2026-04-01' } };
    expect(mergeProfile(newRemote, deleted, undefined, undefined, syncBase).intensityRamp?.startDate).toBe('2026-04-01');
  });
});

describe('progresion por resultados: sincronizacion', () => {
  const r = (date: string, movementId = 'back-squat') => ({
    date,
    movementId,
    key: 'backSquat',
    verdict: 'limpia' as const,
    prescribedKg: 100,
    topKg: 100,
    prescribedSets: 5,
    prescribedReps: 3,
  });

  it('los resultados de los dos dispositivos se unen por fecha y movimiento', () => {
    const merged = mergeProfile({ ...base(), progressionLog: [r('2026-03-01')] }, { ...base(), progressionLog: [r('2026-03-02')] }).progressionLog;
    expect(merged?.map((e) => e.date)).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('deshacer una sesion aqui no revive su resultado aunque el servidor aun lo tenga', () => {
    const synced = { ...base(), progressionLog: [r('2026-03-01'), r('2026-03-02')] };
    const local = { ...base(), progressionLog: [r('2026-03-02')] };
    expect(mergeProfile(synced, local, undefined, undefined, snapshotSyncBase(synced, [])).progressionLog?.map((e) => e.date)).toEqual(['2026-03-02']);
  });

  it('un dispositivo sin registro hereda el remoto, y sin registro en ninguno no queda nada', () => {
    expect(mergeProfile({ ...base(), progressionLog: [r('2026-03-01')] }, base()).progressionLog).toHaveLength(1);
    expect(mergeProfile(base(), base()).progressionLog).toBeUndefined();
  });

  it('la marca de calidad de una serie (justa, fallada) viaja con la serie y la del local gana', () => {
    const set = (extra: object) => ({ date: '2026-03-01', movementId: 'back-squat', block: 'strength' as const, setNumber: 1, kg: 100, reps: 3, ...extra });
    const merged = mergeProfile({ ...base(), workLog: [set({})] }, { ...base(), workLog: [set({ quality: 'fallada' })] }).workLog;
    expect(merged).toHaveLength(1);
    expect(merged?.[0].quality).toBe('fallada');
    // volver a "bien" en el local quita la marca
    expect(mergeProfile({ ...base(), workLog: [set({ quality: 'fallada' })] }, { ...base(), workLog: [set({})] }).workLog?.[0].quality).toBeUndefined();
  });
  it('los ajustes aceptados se unen por campo y gana el local', () => {
    const remote = { ...base(), progressionSettings: { cleanNeeded: 3 as const, cleanNeededSince: '2026-03-01' } };
    const local = { ...base(), progressionSettings: { proposalDismissedOn: '2026-03-05' } };
    expect(mergeProfile(remote, local).progressionSettings).toEqual({ cleanNeeded: 3, cleanNeededSince: '2026-03-01', proposalDismissedOn: '2026-03-05' });
    expect(mergeProfile(base(), base()).progressionSettings).toBeUndefined();
  });
});
