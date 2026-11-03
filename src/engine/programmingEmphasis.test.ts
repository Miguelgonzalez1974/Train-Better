import { describe, expect, it } from 'vitest';
import type { AthleteProfile, EmphasisItem, SessionHistoryEntry } from '../data/athlete/types';
import { computeResponseProfile } from './responseProfile';
import { buildMicrocyclePlan, planEnergySystems, planWodDomains, type EmphasisLevers } from './weekPlan';
import { activeEmphasisItems, ensureEmphasisPlan, EMPHASIS_REVIEW_DAYS, emphasisLevers, leverFor, sessionEmphasis } from './programmingEmphasis';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';

const rp = computeResponseProfile([], [], new Date('2026-03-02T12:00:00'), [], []);

function plan(n: 3 | 4 | 5 | 6, phase: 1 | 2 | 3 | 4, emphasis: EmphasisLevers | null, weeklySplit = true, week = phase) {
  return buildMicrocyclePlan({ weeklySplit, macroId: 'm', weekNumber: week, phase, trainingDaysPerWeek: n, responseProfile: rp, avoidedPatterns: new Set(), goalForcedPattern: null, goalForcedFamily: null, emphasis });
}

describe('palancas de la semana: sin diagnóstico todo sale igual', () => {
  it('sin énfasis (o vacío) la semana es exactamente la de antes', () => {
    for (const n of [3, 4, 5, 6] as const) {
      for (const phase of [1, 2, 3, 4] as const) {
        const base = plan(n, phase, null);
        expect(plan(n, phase, {}), `n=${n} fase=${phase}`).toEqual(base);
      }
    }
  });
});

describe('palanca del motor', () => {
  const slots = (n: number) => Array.from({ length: n - 1 }, (_, i) => i + 1); // todos menos el benchmark (día 0)
  const count = (sys: string[], n: number, who: string) => slots(n).filter((s) => sys[s] === who).length;

  it('con el motor largo con margen, la semana lleva dos WODs aeróbicos (uno si hay pocos WODs) y no pierde el resto', () => {
    for (let week = 1; week <= 12; week++) {
      for (const n of [4, 5] as const) {
        const phase = 2;
        const base = planEnergySystems('m', week, phase, n);
        const biased = planEnergySystems('m', week, phase, n, 'base-aerobica');
        expect(count(biased, n, 'base-aerobica'), `n=${n} sem ${week}`).toBeGreaterThanOrEqual(slots(n).length >= 4 ? 2 : 1);
        // el día 0 (benchmark) y la longitud no cambian
        expect(biased[0]).toBe(base[0]);
        expect(biased).toHaveLength(base.length);
        // solo se cambian días: el resto de sistemas de la fase siguen presentes si ya estaban repetidos
        const changed = biased.filter((s, i) => s !== base[i]).length;
        expect(changed).toBeLessThanOrEqual(1);
      }
    }
  });

  it('nunca en la descarga, y el aeróbico largo nunca en el pico', () => {
    for (const n of [4, 5] as const) {
      expect(planEnergySystems('m', 1, 4, n, 'base-aerobica')).toEqual(planEnergySystems('m', 1, 4, n));
      expect(planEnergySystems('m', 1, 4, n, 'umbral')).toEqual(planEnergySystems('m', 1, 4, n));
      expect(planEnergySystems('m', 1, 3, n, 'base-aerobica')).toEqual(planEnergySystems('m', 1, 3, n));
    }
  });

  it('con la potencia con margen, también en el pico', () => {
    const biased = planEnergySystems('m', 1, 3, 5, 'potencia');
    expect(count(biased, 5, 'potencia')).toBeGreaterThanOrEqual(2);
  });
});

describe('otras palancas', () => {
  it('el patrón con margen gana el día libre del reparto semanal', () => {
    expect(plan(6, 1, { pattern: 'verticalPush' }, true, 3).strengthPattern[5]).toBe('verticalPush');
    expect(plan(6, 1, { pattern: 'horizontalPush' }, true, 3).strengthPattern[5]).toBe('horizontalPush');
  });

  it('la familia de oly con margen abre la alternancia', () => {
    for (const fam of ['snatch', 'clean'] as const) {
      const p = plan(5, 1, { olyFamily: fam });
      const first = p.olyFamily[0];
      expect(first).toBe(fam);
    }
  });

  it('los gimnásticos con margen llevan al menos tantos WODs como sin él, y un WOD más cuando hay empate', () => {
    for (const n of [4, 5, 6] as const) {
      for (const phase of [1, 2] as const) {
        const sys = planEnergySystems('m', 3, phase, n);
        const a = planWodDomains(n, sys).filter((d) => d === 'gymnastics').length;
        const b = planWodDomains(n, sys, true).filter((d) => d === 'gymnastics').length;
        expect(b, `n=${n} fase=${phase}`).toBeGreaterThanOrEqual(a);
      }
    }
  });
});

describe('qué palanca mueve cada fila', () => {
  it('motor, fuerza, halterofilia y gimnásticos tienen palanca; la constancia y lo desconocido, no', () => {
    expect(leverFor('motor', 'base-aerobica')).toEqual({ engine: 'base-aerobica' });
    expect(leverFor('motor', 'todos')).toBeNull();
    expect(leverFor('fuerza', 'benchPress')).toEqual({ pattern: 'horizontalPush' });
    expect(leverFor('fuerza', 'deadlift')).toEqual({ pattern: 'hinge' });
    expect(leverFor('halterofilia', 'snatch')).toEqual({ olyFamily: 'snatch' });
    expect(leverFor('halterofilia', 'jerk')).toEqual({ olyFamily: 'clean' });
    expect(leverFor('gimnasticos', 'rx')).toEqual({ gymnastics: true });
    expect(leverFor('constancia', 'dias')).toBeNull();
  });
});

// ---------- El plan en el perfil ----------

const TODAY = new Date('2026-11-03T12:00:00');
const entry = (offset: number, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => {
  const d = new Date('2026-10-01T12:00:00');
  d.setDate(d.getDate() + offset);
  return { date: d.toISOString().slice(0, 10), mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: 60, ...over };
};
const wod = (offset: number, system: SessionHistoryEntry['energySystem'], perf: number): SessionHistoryEntry => {
  const seconds = Math.round(600 / perf);
  return entry(offset, {
    energySystem: system,
    wodResult: { scoreType: 'time', value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
    wodTargetBase: { kind: 'for-time', unit: 'seconds', mid: 600 },
  });
};
// 8 WODs en Rx: los largos van muy por debajo de lo estimado -> el motor largo es lo que más margen tiene.
const HISTORY = [wod(0, 'potencia', 1.04), wod(1, 'potencia', 1.04), wod(2, 'umbral', 0.97), wod(3, 'umbral', 0.97), wod(4, 'base-aerobica', 0.78), wod(5, 'base-aerobica', 0.78), wod(6, 'umbral', 0.97), wod(7, 'potencia', 1.04)];
const base = (over: Partial<AthleteProfile> = {}): AthleteProfile =>
  makeProfile({ onboardedAt: '2026-10-30T00:00:00.000Z', bodyweightLog: [{ date: '2026-10-01', kg: 82 }], prs: { backSquat: 140, frontSquat: 115, benchPress: 105, deadlift: 165, strictPress: 70, clean: 105, snatch: 80, cleanAndJerk: 100 }, ...over });

describe('ensureEmphasisPlan', () => {
  it('la primera vez crea el plan encendido, con lo que aplica de las áreas fiables', () => {
    const p = ensureEmphasisPlan(base(), HISTORY, TODAY);
    expect(p.emphasisPlan).toMatchObject({ enabled: true, computedOn: '2026-11-03', since: '2026-11-03', removed: [] });
    expect(p.emphasisPlan!.items.map((i) => i.key)).toContain('motor:base-aerobica');
  });

  it('no se recalcula antes de 28 días, y a los 28 sí', () => {
    const first = ensureEmphasisPlan(base(), HISTORY, TODAY);
    expect(ensureEmphasisPlan(first, HISTORY, new Date('2026-11-20T12:00:00'))).toBe(first);
    const later = ensureEmphasisPlan(first, HISTORY, new Date('2026-12-02T12:00:00'));
    expect(later).not.toBe(first);
    expect(later.emphasisPlan!.computedOn).toBe('2026-12-02');
    expect(later.emphasisPlan!.since).toBe('2026-11-03'); // el inicio no se mueve
    expect(EMPHASIS_REVIEW_DAYS).toBe(28);
  });

  it('con el interruptor apagado no toca nada', () => {
    const off = base({ emphasisPlan: { enabled: false, items: [], removed: [] } });
    expect(ensureEmphasisPlan(off, HISTORY, TODAY)).toBe(off);
  });

  it('sin datos suficientes el plan queda vacío y se vuelve a mirar a la semana', () => {
    const first = ensureEmphasisPlan(base(), [], TODAY);
    expect(first.emphasisPlan!.items).toEqual([]);
    expect(ensureEmphasisPlan(first, HISTORY, new Date('2026-11-06T12:00:00'))).toBe(first);
    expect(ensureEmphasisPlan(first, HISTORY, new Date('2026-11-10T12:00:00')).emphasisPlan!.items.length).toBeGreaterThan(0);
  });

  it('conserva lo que el atleta quitó al recalcular', () => {
    const first = ensureEmphasisPlan(base(), HISTORY, TODAY);
    const removed = { ...first, emphasisPlan: { ...first.emphasisPlan!, removed: ['motor:base-aerobica'] } };
    const later = ensureEmphasisPlan(removed, HISTORY, new Date('2026-12-05T12:00:00'));
    expect(later.emphasisPlan!.removed).toEqual(['motor:base-aerobica']);
  });
});

describe('lo que aplica cada día', () => {
  const item = (key: string, area: EmphasisItem['area'], row: string): EmphasisItem => ({ key, area, row, action: 'x', why: 'por qué' });
  const withPlan = (over: Partial<NonNullable<AthleteProfile['emphasisPlan']>> = {}, extra: Partial<AthleteProfile> = {}) =>
    base({ emphasisPlan: { enabled: true, since: '2026-11-03', computedOn: '2026-11-03', items: [item('motor:base-aerobica', 'motor', 'base-aerobica'), item('fuerza:benchPress', 'fuerza', 'benchPress')], removed: [], ...over }, ...extra });

  it('mueve las palancas de lo que aplica, desde el día de inicio y no antes', () => {
    expect(emphasisLevers(withPlan(), '2026-11-03')).toMatchObject({ engine: 'base-aerobica', pattern: 'horizontalPush' });
    expect(emphasisLevers(withPlan(), '2026-11-02')).toBeNull();
  });

  it('sin interruptor, sin nada, lo quitado y lo que dices que no cuadra no cuentan', () => {
    expect(emphasisLevers(withPlan({ enabled: false }), '2026-11-04')).toBeNull();
    expect(emphasisLevers(withPlan({ items: [] }), '2026-11-04')).toBeNull();
    const quitado = emphasisLevers(withPlan({ removed: ['motor:base-aerobica'] }), '2026-11-04')!;
    expect(quitado.pattern).toBe('horizontalPush');
    expect(quitado.engine).toBeUndefined();
    const noCuadra = withPlan({}, { diagnosisChecks: { motor: { verdict: 'no-cuadra', samples: 8, date: '2026-11-03' } } });
    expect(activeEmphasisItems(noCuadra).map((i) => i.key)).toEqual(['fuerza:benchPress']);
  });

  it('cuenta la sesión: la frase de arriba y una etiqueta con su porqué en los bloques que llevan el énfasis', () => {
    const e = sessionEmphasis(withPlan(), '2026-11-04', { strengthPattern: 'horizontalPush', energySystem: 'base-aerobica', wodDomain: 'monostructural', olyFamily: 'clean', accessoryReinforced: true })!;
    expect(e.summary).toBe('Estas semanas: más motor largo y más empuje horizontal.');
    expect(e.reviewOn).toBe('2026-12-01');
    expect(e.blocks.strength?.label).toBe('Énfasis · empuje horizontal');
    expect(e.blocks.wod?.label).toBe('Énfasis · motor largo');
    expect(e.blocks.accessory?.label).toBe('Énfasis · empuje horizontal');
    expect(e.blocks.wod?.why).toBe('por qué');
    // un día sin esos bloques no lleva etiquetas, pero la frase de arriba sí
    const quiet = sessionEmphasis(withPlan(), '2026-11-04', { strengthPattern: 'squat', energySystem: 'umbral', wodDomain: 'weighted', olyFamily: 'snatch', accessoryReinforced: false })!;
    expect(quiet.blocks).toEqual({});
    expect(quiet.summary).toContain('más motor largo');
  });
});

describe('en el motor de sesiones', () => {
  // Macro de 12 semanas desde el lunes 5 de enero: la semana 2 del mesociclo (intensificación) es la fase de umbral dominante.
  const macro = makeMacro({ id: 'macro-emphasis', startDate: '2026-01-05', endDate: '2026-12-27' });
  const prof = (emphasisPlan?: AthleteProfile['emphasisPlan']) => makeProfile({ trainingDaysPerWeek: 5, macrocycles: [macro], ...(emphasisPlan ? { emphasisPlan } : {}) });
  const days = consecutiveDates('2026-01-05', 84);
  const sessions = (p: AthleteProfile) => days.map((d) => generateSessionForDate(p, [], d, p.goals));
  const plan: AthleteProfile['emphasisPlan'] = {
    enabled: true,
    since: '2026-01-01',
    computedOn: '2026-01-01',
    items: [{ key: 'motor:base-aerobica', area: 'motor', row: 'base-aerobica', action: 'x', why: 'tus WODs largos van por debajo' }],
    removed: [],
  };

  it('sin plan o apagado la programación es idéntica a la de siempre', () => {
    const off = sessions(prof({ ...plan!, enabled: false }));
    const none = sessions(prof());
    expect(off).toEqual(none);
  });

  it('con el motor largo con margen, hay más días de WOD aeróbico y las sesiones lo cuentan', () => {
    const base = sessions(prof());
    const biased = sessions(prof(plan));
    const aerobic = (s: ReturnType<typeof sessions>) => s.filter((x) => x.energySystem === 'base-aerobica').length;
    expect(aerobic(biased)).toBeGreaterThan(aerobic(base));
    const tagged = biased.filter((x) => x.profileEmphasis?.blocks.wod);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged[0].profileEmphasis!.summary).toContain('más motor largo');
    expect(base.every((x) => !x.profileEmphasis)).toBe(true);
    // la estructura no cambia: mismos días de descanso y misma fase de cada día
    expect(biased.map((x) => [x.isRestDay, x.mesocycleWeek])).toEqual(base.map((x) => [x.isRestDay, x.mesocycleWeek]));
  });

  it('antes del día de inicio no cambia nada', () => {
    const late = sessions(prof({ ...plan!, since: '2027-01-01' }));
    expect(late).toEqual(sessions(prof()));
  });
});
