import { describe, expect, it } from 'vitest';
import type { PrLogEntry, ProgressionRecord, ProgressionVerdict, SetFeedbackEntry, WorkSetEntry } from '../data/athlete/types';
import {
  acceptProposal,
  buildProgressionLedger,
  cleanNeededOn,
  dismissProposal,
  evaluateStrengthSession,
  liftProgression,
  progressionFactors,
  progressionNote,
  progressionProposal,
  progressionReason,
  PROGRESSION_MAX,
  PROGRESSION_MIN,
  ruleVerdict,
  sessionProgressionView,
} from './progression';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';

const rec = (date: string, verdict: ProgressionVerdict, extra: Partial<ProgressionRecord> = {}): ProgressionRecord => ({
  date,
  movementId: 'back-squat',
  key: 'backSquat',
  verdict,
  prescribedKg: 100,
  topKg: 100,
  prescribedSets: 5,
  prescribedReps: 3,
  ...extra,
});

/** Una racha de sesiones, un día de diferencia, a partir del 1 de octubre. */
const run = (verdicts: ProgressionVerdict[]) => verdicts.map((v, i) => rec(`2026-10-${String(i + 1).padStart(2, '0')}`, v));

const sets = (n: number, kg: number, reps: number): WorkSetEntry[] =>
  Array.from({ length: n }, (_, i) => ({ date: '2026-10-05', movementId: 'back-squat', block: 'strength' as const, setNumber: i + 1, kg, reps }));

const block = { movementId: 'back-squat', sets: 5, reps: '3', loadKg: 100 };
const fb = (extra: Partial<SetFeedbackEntry>): SetFeedbackEntry => ({
  date: '2026-10-05',
  movementId: 'back-squat',
  block: 'strength',
  prescribedKg: 100,
  prescribedReps: 3,
  prescribedSets: 5,
  feel: 'justo',
  ...extra,
});

describe('evaluar una sesión de fuerza', () => {
  const evaluate = (s: WorkSetEntry[], feedback?: SetFeedbackEntry, b: Parameters<typeof evaluateStrengthSession>[0]['block'] = block) =>
    evaluateStrengthSession({ date: '2026-10-05', block: b, key: 'backSquat', sets: s, feedback });

  it('series completas con RPE hasta 8,5 = limpia; más duro = dura', () => {
    expect(evaluate(sets(5, 100, 3), fb({ actualRpe: 8 }))?.verdict).toBe('limpia');
    expect(evaluate(sets(5, 100, 3), fb({ actualRpe: 8.5 }))?.verdict).toBe('limpia');
    expect(evaluate(sets(5, 100, 3), fb({ actualRpe: 9 }))?.verdict).toBe('dura');
  });

  it('sin RPE manda la sensación de la primera serie, y sin nada la sesión queda solo como hecha', () => {
    expect(evaluate(sets(5, 100, 3), fb({ feel: 'sobro' }))?.verdict).toBe('limpia');
    expect(evaluate(sets(5, 100, 3), fb({ feel: 'duro' }))?.verdict).toBe('dura');
    expect(evaluate(sets(5, 100, 3), undefined)?.verdict).toBe('hecha');
  });

  it('una serie con menos reps de las pedidas, o un peso más bajo de lo prescrito, es fallo', () => {
    const short = sets(5, 100, 3);
    short[4] = { ...short[4], reps: 2 };
    expect(evaluate(short, fb({ actualRpe: 8 }))?.verdict).toBe('fallo');
    expect(evaluate(sets(5, 90, 3), fb({ actualRpe: 8 }))?.verdict).toBe('fallo');
    // un poco por debajo (dentro del 5 %) no es fallo
    expect(evaluate(sets(5, 97.5, 3), fb({ actualRpe: 8 }))?.verdict).toBe('limpia');
  });

  it('con datos a medias, series sueltas o reps que no son un número limpio no juzga', () => {
    expect(evaluate(sets(3, 100, 3), fb({ actualRpe: 8 }))).toBeNull();
    expect(evaluate(sets(5, 100, 3), fb({ actualRpe: 8 }), { ...block, reps: '5-3-1' })).toBeNull();
    expect(evaluate(sets(1, 100, 1), undefined, { ...block, sets: 1, logAsSingle: true })).toBeNull();
    expect(evaluateStrengthSession({ date: '2026-10-05', block, key: null, sets: sets(5, 100, 3) })).toBeNull();
  });

  it('lo anotado guarda lo prescrito y lo movido', () => {
    const r = evaluate(sets(5, 102.5, 3), fb({ actualRpe: 7.5 }))!;
    expect(r).toMatchObject({ prescribedKg: 100, topKg: 102.5, prescribedSets: 5, prescribedReps: 3, rpe: 7.5, key: 'backSquat' });
  });
});

describe('el estado de un levantamiento sale del registro', () => {
  it('sin registro el factor es 1 y no hay decisiones', () => {
    const p = liftProgression([], 'backSquat');
    expect(p.factor).toBe(1);
    expect(p.decisions).toEqual([]);
    expect(progressionFactors(undefined)).toEqual({});
  });

  it('dos sesiones limpias seguidas suben 2,5 %; una sola o separadas por una que no es limpia, no', () => {
    expect(liftProgression(run(['limpia']), 'backSquat').factor).toBe(1);
    expect(liftProgression(run(['limpia', 'limpia']), 'backSquat').factor).toBe(1.025);
    expect(liftProgression(run(['limpia', 'dura', 'limpia']), 'backSquat').factor).toBe(1);
    expect(liftProgression(run(['limpia', 'hecha', 'limpia', 'limpia']), 'backSquat').factor).toBe(1.025);
  });

  it('tras subir hay que volver a ganárselo: cuatro limpias seguidas = dos pasos', () => {
    const p = liftProgression(run(['limpia', 'limpia', 'limpia', 'limpia']), 'backSquat');
    expect(p.factor).toBe(1.05);
    expect(p.decisions.map((d) => d.kind)).toEqual(['subir', 'subir']);
    expect(p.cleanStreak).toBe(0);
  });

  it('dos sesiones con fallos seguidas bajan 5 %; un fallo suelto, no', () => {
    expect(liftProgression(run(['fallo']), 'backSquat').factor).toBe(1);
    expect(liftProgression(run(['fallo', 'limpia', 'fallo']), 'backSquat').factor).toBe(1);
    const p = liftProgression(run(['fallo', 'fallo']), 'backSquat');
    expect(p.factor).toBe(0.95);
    expect(p.decisions[0].kind).toBe('bajar');
  });

  it('el factor tiene tope por arriba y por abajo', () => {
    const many = run(Array.from({ length: 12 }, () => 'limpia' as const).concat(Array.from({ length: 12 }, () => 'limpia' as const)));
    // fechas distintas: octubre solo tiene 31 días, usamos dos meses
    const spread = many.map((r, i) => ({ ...r, date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10) }));
    expect(liftProgression(spread, 'backSquat').factor).toBe(PROGRESSION_MAX);
    const fails = Array.from({ length: 20 }, (_, i) => rec(new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), 'fallo'));
    expect(liftProgression(fails, 'backSquat').factor).toBe(PROGRESSION_MIN);
  });

  it('cada levantamiento va por su cuenta', () => {
    const bench = run(['limpia', 'limpia']).map((r) => ({ ...r, key: 'benchPress', movementId: 'bench-press' }));
    expect(progressionFactors([...run(['fallo']), ...bench])).toEqual({ benchPress: 1.025 });
  });

  it('cuando el PR cambia, lo anterior ya no cuenta (la base es otra)', () => {
    const prLog: PrLogEntry[] = [{ date: '2026-10-02', key: 'backSquat', kg: 105 }];
    // limpias el 1 y el 2 (el 2 no cuenta: mismo día que el cambio), y el 3 en adelante
    const p = liftProgression(run(['limpia', 'limpia', 'limpia']), 'backSquat', prLog);
    expect(p.factor).toBe(1);
    expect(p.cleanStreak).toBe(1);
    expect(liftProgression(run(['limpia', 'limpia', 'limpia', 'limpia']), 'backSquat', prLog).factor).toBe(1.025);
    // un PR de otro levantamiento no afecta
    expect(liftProgression(run(['limpia', 'limpia']), 'backSquat', [{ date: '2026-10-02', key: 'deadlift', kg: 150 }]).factor).toBe(1.025);
  });

  it('lo aceptado vale desde su fecha, no reescribe lo anterior', () => {
    const settings = { cleanNeeded: 3 as const, cleanNeededSince: '2026-10-10' };
    expect(cleanNeededOn('2026-10-09', settings)).toBe(2);
    expect(cleanNeededOn('2026-10-10', settings)).toBe(3);
    // las dos limpias anteriores a la fecha siguen subiendo; después hacen falta tres
    const before = run(['limpia', 'limpia']);
    const after = ['2026-10-10', '2026-10-11'].map((d) => rec(d, 'limpia'));
    expect(liftProgression([...before, ...after], 'backSquat', undefined, settings).factor).toBe(1.025);
    expect(liftProgression([...before, ...after, rec('2026-10-12', 'limpia')], 'backSquat', undefined, settings).factor).toBe(1.05);
  });
});

describe('cada decisión se revisa con la sesión siguiente', () => {
  it('una subida acierta si la siguiente sale limpia y falla si sale dura o con fallos', () => {
    expect(liftProgression(run(['limpia', 'limpia', 'limpia']), 'backSquat').decisions[0].outcome).toBe('acierto');
    expect(liftProgression(run(['limpia', 'limpia', 'dura']), 'backSquat').decisions[0].outcome).toBe('fallo');
    expect(liftProgression(run(['limpia', 'limpia', 'fallo']), 'backSquat').decisions[0].outcome).toBe('fallo');
  });

  it('sin sesión siguiente la decisión queda sin resolver', () => {
    expect(liftProgression(run(['limpia', 'limpia']), 'backSquat').decisions[0].outcome).toBeUndefined();
  });

  it('una bajada acierta si la siguiente no tiene fallos', () => {
    expect(liftProgression(run(['fallo', 'fallo', 'dura']), 'backSquat').decisions[0].outcome).toBe('acierto');
    expect(liftProgression(run(['fallo', 'fallo', 'fallo']), 'backSquat').decisions[0].outcome).toBe('fallo');
  });
});

describe('el libro de aciertos', () => {
  /** n subidas (cada una: 2 limpias) seguidas de una sesión que decide si acertó. */
  function ledgerWith(outcomes: ('acierto' | 'fallo')[]) {
    const records: ProgressionRecord[] = [];
    let day = 0;
    const next = () => new Date(Date.UTC(2026, 0, 1 + day++)).toISOString().slice(0, 10);
    // con tope 1.05 solo caben 2 subidas por levantamiento: una clave distinta por caso
    outcomes.forEach((o, i) => {
      const key = `lift${i}`;
      records.push({ ...rec(next(), 'limpia'), key }, { ...rec(next(), 'limpia'), key }, { ...rec(next(), o === 'acierto' ? 'limpia' : 'dura'), key });
    });
    return buildProgressionLedger(records);
  }

  it('cuenta decisiones, resultados y aciertos', () => {
    const l = ledgerWith(['acierto', 'acierto', 'fallo']);
    expect(l.total).toBe(3);
    expect(l.resolved).toBe(3);
    expect(l.hits).toBe(2);
    expect(l.rows[0].rule).toBe('subir');
    expect(l.rows[0].verdict).toBe('sin-datos');
  });

  it('una regla necesita 5 casos con resultado para el veredicto, y el 70 % para funcionar', () => {
    expect(ruleVerdict(4, 4)).toBe('sin-datos');
    expect(ruleVerdict(5, 4)).toBe('funciona');
    expect(ruleVerdict(10, 7)).toBe('funciona');
    expect(ruleVerdict(10, 6)).toBe('dudosa');
    expect(ledgerWith(['acierto', 'acierto', 'acierto', 'acierto', 'fallo']).rows[0].verdict).toBe('funciona');
    expect(ledgerWith(['acierto', 'acierto', 'acierto', 'fallo', 'fallo']).rows[0].verdict).toBe('dudosa');
  });

  it('sin decisiones no hay filas', () => {
    expect(buildProgressionLedger(run(['limpia']))).toEqual({ total: 0, resolved: 0, hits: 0, rows: [] });
  });

  it('suma la fila del énfasis con lo que dijo la última revisión', () => {
    const plan = {
      enabled: true,
      items: [],
      removed: [],
      review: {
        date: '2026-11-01',
        seen: true,
        entries: [
          { key: 'a', area: 'motor' as const, label: 'A', before: 0.8, now: 0.9, newSamples: 4, decision: 'seguir' as const, reason: '' },
          { key: 'b', area: 'fuerza' as const, label: 'B', before: 0.9, now: 0.95, newSamples: 4, decision: 'graduar' as const, reason: '' },
          { key: 'c', area: 'halterofilia' as const, label: 'C', before: 0.7, now: 0.7, newSamples: 3, decision: 'rotar' as const, reason: '' },
          { key: 'd', area: 'gimnásticos' as never, label: 'D', before: null, now: null, newSamples: 0, decision: 'esperar' as const, reason: '' },
        ],
      },
    };
    const row = buildProgressionLedger([], undefined, undefined, plan).rows.find((r) => r.rule === 'enfasis')!;
    expect(row.cases).toBe(3);
    expect(row.hits).toBe(2);
    expect(row.verdict).toBe('sin-datos');
  });
});

describe('la propuesta de pedir tres sesiones limpias', () => {
  const dudosa = () => {
    const records: ProgressionRecord[] = [];
    let day = 0;
    const next = () => new Date(Date.UTC(2026, 0, 1 + day++)).toISOString().slice(0, 10);
    (['acierto', 'fallo', 'fallo', 'fallo', 'acierto'] as const).forEach((o, i) => {
      const key = `lift${i}`;
      records.push({ ...rec(next(), 'limpia'), key }, { ...rec(next(), 'limpia'), key }, { ...rec(next(), o === 'acierto' ? 'limpia' : 'dura'), key });
    });
    return buildProgressionLedger(records);
  };

  it('sale cuando subir sale dudosa y aún se piden dos', () => {
    const p = progressionProposal(dudosa(), undefined, '2026-03-01');
    expect(p).toEqual({ kind: 'tres-limpias', hits: 2, resolved: 5 });
  });

  it('no sale si ya piden tres, ni si el atleta la dejó como estaba hace menos de 28 días', () => {
    expect(progressionProposal(dudosa(), { cleanNeeded: 3, cleanNeededSince: '2026-02-01' }, '2026-03-01')).toBeNull();
    const dismissed = dismissProposal(undefined, '2026-03-01');
    expect(progressionProposal(dudosa(), dismissed, '2026-03-20')).toBeNull();
    expect(progressionProposal(dudosa(), dismissed, '2026-03-29')).not.toBeNull();
  });

  it('aceptarla fija tres desde hoy y quita la pausa; no sale con una regla que funciona o sin datos', () => {
    const accepted = acceptProposal(dismissProposal(undefined, '2026-03-01'), '2026-03-05');
    expect(accepted).toEqual({ cleanNeeded: 3, cleanNeededSince: '2026-03-05' });
    expect(progressionProposal(buildProgressionLedger([]), undefined, '2026-03-01')).toBeNull();
  });
});

describe('lo que enseña la tarjeta al cerrar la sesión', () => {
  it('con la segunda limpia sube: carga de la próxima vez y por qué', () => {
    const records = [rec('2026-10-01', 'limpia'), rec('2026-10-05', 'limpia', { prescribedKg: 100 })];
    const v = sessionProgressionView(records, undefined, undefined, '2026-10-05', 'back-squat')!;
    expect(v.change).toBe('subio');
    expect(v.nextKg).toBe(102.5);
    expect(v.deltaPct).toBe(2.5);
    expect(progressionReason(v)).toMatch(/2 sesiones limpias/);
  });

  it('con la primera limpia se queda igual y cuenta 1 de 2', () => {
    const v = sessionProgressionView([rec('2026-10-05', 'limpia')], undefined, undefined, '2026-10-05', 'back-squat')!;
    expect(v.change).toBe('igual');
    expect(v.cleanStreak).toBe(1);
    expect(v.needed).toBe(2);
    expect(v.nextKg).toBeUndefined();
  });

  it('un fallo suelto no baja nada y lo dice', () => {
    const v = sessionProgressionView([rec('2026-10-05', 'fallo')], undefined, undefined, '2026-10-05', 'back-squat')!;
    expect(v.change).toBe('igual');
    expect(progressionReason(v)).toMatch(/fallo suelto/);
  });

  it('sin registro de ese día no hay nada que enseñar', () => {
    expect(sessionProgressionView([rec('2026-10-04', 'limpia')], undefined, undefined, '2026-10-05', 'back-squat')).toBeNull();
  });

  it('la nota de la sesión dice cuánto se mueve la carga', () => {
    expect(progressionNote(1)).toBe('');
    expect(progressionNote(1.025)).toContain('Sube un 2,5 %');
    expect(progressionNote(0.95)).toContain('Baja un 5 %');
  });
});

describe('el generador aplica la progresión', () => {
  const macro = makeMacro({ id: 'macro-prog', startDate: '2026-01-05', endDate: '2026-12-27' });
  const days = consecutiveDates('2026-03-02', 14);
  const keys = ['backSquat', 'frontSquat', 'benchPress', 'deadlift', 'strictPress'];
  const log = (verdicts: ProgressionVerdict[]): ProgressionRecord[] =>
    keys.flatMap((key) => verdicts.map((v, i) => ({ ...rec(`2026-02-${String(10 + i).padStart(2, '0')}`, v), key })));
  const strengthLoads = (p: ReturnType<typeof makeProfile>) =>
    days.map((d) => generateSessionForDate(p, [], d, p.goals).blocks.find((b) => b.block === 'strength'));

  it('sin registro la sesión es idéntica a la de antes', () => {
    const base = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro] });
    const withEmpty = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro], progressionLog: [] });
    expect(strengthLoads(withEmpty)).toEqual(strengthLoads(base));
  });

  it('con dos sesiones limpias la carga de fuerza sube y la nota lo dice; con dos con fallos, baja', () => {
    const base = strengthLoads(makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro] }));
    const up = strengthLoads(makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro], progressionLog: log(['limpia', 'limpia']) }));
    const down = strengthLoads(makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro], progressionLog: log(['fallo', 'fallo']) }));
    let raised = 0;
    let lowered = 0;
    base.forEach((b, i) => {
      if (!b?.loadKg || !up[i]?.loadKg || !down[i]?.loadKg || b.movementId !== up[i]!.movementId) return;
      expect(up[i]!.loadKg!, `sube ${days[i]}`).toBeGreaterThanOrEqual(b.loadKg);
      expect(down[i]!.loadKg!, `baja ${days[i]}`).toBeLessThanOrEqual(b.loadKg);
      if (up[i]!.loadKg! > b.loadKg) {
        raised++;
        expect(up[i]!.notes).toContain('por tus sesiones limpias');
      }
      if (down[i]!.loadKg! < b.loadKg) lowered++;
    });
    expect(raised).toBeGreaterThan(0);
    expect(lowered).toBeGreaterThan(0);
  });
});
