import { describe, expect, it } from 'vitest';
import type { AthleteProfile } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { SKILL_PROGRESSION_TARGETS } from '../../data/movements/skillProgressions';
import { buildBlocksToCompetition } from '../../engine/seasonSetup';
import { DEFAULT_STRENGTH_PROGRAM_LIFTS } from '../../engine/strengthPrograms';
import { makeMacro, makeProfile as fixtureProfile } from '../../engine/__fixtures';
import {
  addDaysIso,
  applyPlan,
  commitItems,
  getNode,
  METHOD_WEEKS,
  nextMondayIso,
  phaseWeeksFor,
  PROGRAM_CATS,
  reviewNotes,
  suggestionFromProfile,
  type CommitKind,
  type FlowState,
  type PlanItem,
  type RexCtx,
  type RexNode,
  type RexOption,
} from './rexFlow';

const TODAY = '2026-11-04'; // miércoles

let n = 0;
const mkCtx = (profile: AthleteProfile): RexCtx => ({ profile, todayIso: TODAY, newId: () => `id-${++n}` });
const emptyProfile = (o: Partial<AthleteProfile> = {}) => fixtureProfile({ macrocycles: [], goals: [], ...o });

type Step = string | { date: string } | { text: string };

/** Recorre una conversación: cada paso es el texto de un botón, o una fecha. Devuelve lo que se queda en el plan y dónde acaba. */
function walk(steps: Step[], profile: AthleteProfile = emptyProfile(), from: { plan?: PlanItem[]; s?: FlowState; node?: string } = {}) {
  const ctx = mkCtx(profile);
  let s: FlowState = from.s ?? {};
  const plan: PlanItem[] = [...(from.plan ?? [])];
  let id = from.node ?? 'start';
  for (const step of steps) {
    const node: RexNode = getNode(id, s, ctx, plan);
    if (typeof step === 'string') {
      const option: RexOption | undefined = node.options?.find((o) => o.label === step);
      if (!option) throw new Error(`En «${id}» no hay botón «${step}». Hay: ${node.options?.map((o) => o.label).join(' | ')}`);
      if (option.reset) s = {};
      s = { ...s, ...option.set };
      if (option.commit) {
        plan.push(...commitItems(option.commit, s, ctx));
        id = 'more';
      } else id = option.next ?? 'more';
    } else if ('text' in step) {
      if (!node.input) throw new Error(`En «${id}» no se pide un texto`);
      s = { ...s, [node.input.field]: step.text.trim().slice(0, node.input.max) };
      plan.push(...commitItems(node.input.commit, s, ctx));
      id = 'more';
    } else {
      if (!node.date) throw new Error(`En «${id}» no se pide una fecha`);
      s = { ...s, [node.date.field]: step.date };
      if (node.date.commit) {
        plan.push(...commitItems(node.date.commit, s, ctx));
        id = 'more';
      } else id = node.date.next ?? 'more';
    }
  }
  return { s, plan, id, ctx };
}

describe('Rex: que la conversación esté bien cosida', () => {
  const ALL_IDS = [
    'start', 'more', 'o_type', 'o_lift_any', 'o_lift', 'o_oly', 'o_skill', 'o_skill_level', 'o_comp', 'o_comp_days', 'o_comp_end', 'o_when', 'o_date', 'o_push',
    'm_dur', 'm_phase', 'm_start', 'm_name', 'p_goal', 'p_method', 'p_lifts', 'p_dur', 'p_start', 'p_warn', 'r_gap', 't_when', 't_gap', 'i_suggest', 'i_block', 'i_ok',
    'c_feel', 'c_next', 'c_next_date', 'c_next_days', 'c_next_end', 'c_next_guess', 'o_kg', 'o_kg_input', 'o_kg_check', 'd_date', 'd_days', 'd_end',
  ];
  const rich: FlowState = { type: 'subir-pr', movementId: 'back-squat', detail: 'Sentadilla trasera', cat: 'oly', method: '531', weeks: 8, targetDate: '2027-01-01', why: 'x' };
  const ctx = mkCtx(emptyProfile({ macrocycles: [makeMacro({ id: 'm', label: 'M', startDate: '2026-10-01', endDate: '2026-12-01' })], strengthPrograms: [{ id: 'p', startDate: '2026-10-28', endDate: '2026-12-22', method: '531', lifts: [] }] }));

  it('cada botón lleva a una pregunta que existe (o a la revisión) y ninguna pregunta se queda sin salida', () => {
    for (const id of ALL_IDS) {
      const node = getNode(id, rich, ctx, []);
      expect(node.text.length, id).toBeGreaterThan(10);
      expect([Boolean(node.options?.length), Boolean(node.date), Boolean(node.input), Boolean(node.number)].filter(Boolean), `«${id}» tiene botones, una fecha o un texto: una sola cosa`).toHaveLength(1);
      for (const o of node.options ?? []) {
        expect(Boolean(o.next) || Boolean(o.commit), `«${id}» → «${o.label}» no lleva a ningún sitio`).toBe(true);
        if (o.next && o.next !== 'review') expect(ALL_IDS, `«${id}» → «${o.label}» apunta a «${o.next}»`).toContain(o.next);
      }
      if (node.date) expect(Boolean(node.date.next) || Boolean(node.date.commit), id).toBe(true);
      if (node.input) expect(node.input.suggested.length, id).toBeGreaterThan(0);
    }
  });

  it('todos los levantamientos que ofrece existen en el catálogo, y todos los métodos de fuerza tienen su camino', () => {
    for (const id of ['o_lift_any', 'o_lift', 'o_oly', 'o_skill']) {
      const opts = getNode(id, rich, ctx, []).options ?? [];
      expect(opts.length, id).toBeGreaterThan(1);
      for (const o of opts) expect(getMovementById(o.set?.movementId ?? ''), `${id} · ${o.label}`).toBeDefined();
    }
  });

  it('no deja fuera ningún método de programa de la app', () => {
    const offered = new Set(PROGRAM_CATS.flatMap((c) => c.methods));
    for (const m of ['531', 'lineal', 'ondulante', 'conjugado', 'ruso', 'texas', 'juggernaut', 'haltero', 'temporada', 'dieSet', 'mayhem-base', 'mayhem-tecnica', 'mayhem-pico'] as const) expect(offered.has(m), m).toBe(true);
  });
});

describe('Rex: un objetivo', () => {
  it('subir un PR (lo primero que se ofrece) con la sentadilla en 12 semanas, intensivo', () => {
    const { plan, id } = walk(['Un objetivo', 'Subir un PR', 'Sentadilla trasera', '12 semanas', 'Sin peso, solo mejorar', 'Intensivo: casi todo gira alrededor']);
    expect(id).toBe('more');
    const goal = plan[0].payload.goal!;
    expect(goal).toMatchObject({ type: 'subir-pr', movementId: 'back-squat', targetDate: addDaysIso(TODAY, 84), emphasis: 'intensivo', createdAt: TODAY });
    expect(plan[0].title).toBe('Subir PR · Sentadilla trasera');
    expect(plan[0].fx[0]).toMatch(/90-95 %/);
  });

  it('subir un PR también vale para halterofilia', () => {
    const goal = walk(['Un objetivo', 'Subir un PR', 'Snatch', '8 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal!;
    expect(goal).toMatchObject({ type: 'subir-pr', movementId: 'snatch', emphasis: 'moderado' });
  });

  it('ser más fuerte y mejorar la halterofilia usan su propio tipo de objetivo', () => {
    expect(walk(['Un objetivo', 'Ser más fuerte en general', 'Peso muerto', '4 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal).toMatchObject({ type: 'elevar-fuerza', movementId: 'deadlift' });
    expect(walk(['Un objetivo', 'Mejorar mi halterofilia', 'Clean & jerk', '16 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal).toMatchObject({ type: 'mejorar-potencia', movementId: 'clean-and-jerk' });
  });

  it('un gimnástico lleva desde dónde partes (nunca un escalón que ya tienes)', () => {
    const target = SKILL_PROGRESSION_TARGETS[0];
    const goal = walk(['Un objetivo', 'Dominar un gimnástico', target.name, 'A medias', '8 semanas', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal!;
    expect(goal).toMatchObject({ type: 'mejorar-gimnasticos', movementId: target.id, skillLevel: 0.5 });
    expect(walk(['Un objetivo', 'Dominar un gimnástico', target.name, 'Desde cero', '8 semanas', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal!.skillLevel).toBe(0);
  });

  it('resistencia no lleva levantamiento ni nivel', () => {
    const goal = walk(['Un objetivo', 'Más resistencia', '12 semanas', 'Intensivo: casi todo gira alrededor']).plan[0].payload.goal!;
    expect(goal.type).toBe('elevar-resistencia');
    expect(goal.movementId).toBeUndefined();
    expect('skillLevel' in goal).toBe(false);
  });

  it('una competición pide la fecha exacta, de un día o de varios', () => {
    const one = walk(['Un objetivo', 'Prepararme para una competición', { date: '2026-12-12' }, 'Un solo día']).plan[0].payload.goal!;
    expect(one).toMatchObject({ type: 'preparar-competicion', targetDate: '2026-12-12' });
    expect(one.eventEndDate).toBeUndefined();
    const many = walk(['Un objetivo', 'Prepararme para una competición', { date: '2026-12-12' }, 'Varios días', { date: '2026-12-13' }]).plan[0].payload.goal!;
    expect(many).toMatchObject({ targetDate: '2026-12-12', eventEndDate: '2026-12-13' });
  });

  it('se puede elegir una fecha en vez de semanas', () => {
    const goal = walk(['Un objetivo', 'Subir un PR', 'Press banca', 'Elegir una fecha', { date: '2027-02-01' }, 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás']).plan[0].payload.goal!;
    expect(goal.targetDate).toBe('2027-02-01');
  });
});

describe('Rex: macrociclo', () => {
  it('fases: siempre suman el total, con al menos una semana de cada y de descarga', () => {
    expect(phaseWeeksFor(12, 'clasico')).toBeUndefined();
    expect(phaseWeeksFor(3, 'pico')).toBeUndefined();
    for (let total = 4; total <= 40; total++) {
      for (const style of ['base', 'pico'] as const) {
        const p = phaseWeeksFor(total, style)!;
        expect(p.reduce((a, b) => a + b, 0), `${style} ${total}`).toBe(total);
        expect(Math.min(...p), `${style} ${total}`).toBeGreaterThanOrEqual(1);
      }
    }
    expect(phaseWeeksFor(12, 'pico')).toEqual([5, 4, 2, 1]);
  });

  it('un macrociclo de 12 semanas desde hoy acaba el día 84 (inclusive) y mide 12 semanas para la app', () => {
    const m = walk(['Un macrociclo', '12 semanas (3 meses)', 'Con el pico hacia el final', 'Hoy', { text: '' }]).plan[0].payload.macro!;
    expect(m).toMatchObject({ startDate: TODAY, endDate: addDaysIso(TODAY, 83), phaseWeeks: [5, 4, 2, 1] });
    expect(m.label).toContain('12 semanas');
  });

  it('empezar el lunes que viene', () => {
    expect(nextMondayIso(TODAY)).toBe('2026-11-09');
    expect(nextMondayIso('2026-11-09')).toBe('2026-11-16');
    expect(walk(['Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'El lunes que viene', { text: '' }]).plan[0].payload.macro!.startDate).toBe('2026-11-09');
  });

  it('el clásico no fija fases', () => {
    expect('phaseWeeks' in walk(['Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'Hoy', { text: '' }]).plan[0].payload.macro!).toBe(false);
  });

  it('se pueden encadenar: el siguiente arranca el día después del anterior, sin pisarse', () => {
    const first = walk(['Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'Hoy', { text: '' }]);
    const a = first.plan[0].payload.macro!;
    const node = getNode('m_start', { weeks: 8, phases: 'base' }, first.ctx, first.plan);
    const chain = node.options!.find((o) => o.label.startsWith('Justo después del último'))!;
    expect(chain.set?.startIso).toBe(addDaysIso(a.endDate, 1));
    const second = walk(['Un macrociclo', '12 semanas (3 meses)', 'Base primero: más acumulación al principio', chain.label, { text: '' }], emptyProfile(), { plan: first.plan });
    const b = second.plan[1].payload.macro!;
    expect(b.startDate > a.endDate).toBe(true);
    expect(b.phaseWeeks).toEqual([7, 3, 1, 1]);
  });

  it('también se encadena tras un macrociclo que ya tienes', () => {
    const profile = emptyProfile({ macrocycles: [makeMacro({ id: 'x', label: 'X', startDate: '2026-10-01', endDate: '2026-12-16' })] });
    const node = getNode('m_start', { weeks: 8 }, mkCtx(profile), []);
    expect(node.options![0].label).toMatch(/Justo después del último \(17 dic\)/);
  });
});

describe('Rex: programa de fuerza', () => {
  const lifts4 = 'Los 4 clásicos (sentadilla, banca, peso muerto, press)';

  it('un método con duración a elegir pregunta levantamientos y semanas', () => {
    const { plan } = walk(['Un programa de fuerza', 'Frecuencia alta y técnica', 'Ruso / Sheiko', lifts4, '8 semanas', 'Hoy', 'Entendido, añádelo']);
    const p = plan[0].payload.program!;
    expect(p).toMatchObject({ method: 'ruso', startDate: TODAY, endDate: addDaysIso(TODAY, 55) });
    expect(p.lifts).toEqual([...DEFAULT_STRENGTH_PROGRAM_LIFTS]);
    expect(plan[0].title).toBe('Ruso / Sheiko · 8 semanas');
  });

  it('un subconjunto de levantamientos', () => {
    const p = walk(['Un programa de fuerza', 'Fuerza máxima', 'Conjugado', 'Solo sentadilla y peso muerto', '4 semanas', 'Hoy', 'Entendido, añádelo']).plan[0].payload.program!;
    expect(p.lifts).toEqual(['backSquat', 'deadlift']);
  });

  it('los métodos con semanas fijas se las saltan y duran lo que dura su calendario', () => {
    for (const [cat, method] of [['Halterofilia de competición', 'haltero'], ['Medir antes y después', 'temporada']] as const) {
      const label = getNode('p_method', { cat: PROGRAM_CATS.find((c) => c.label === cat)!.cat }, mkCtx(emptyProfile()), []).options![0].label;
      const p = walk(['Un programa de fuerza', cat, label, 'Hoy', 'Entendido, añádelo']).plan[0].payload.program!;
      expect(p.method).toBe(method);
      expect(p.endDate).toBe(addDaysIso(TODAY, METHOD_WEEKS[method]! * 7 - 1));
      expect(p.lifts.length).toBeGreaterThan(0);
    }
  });

  it('el nombre del botón no repite las semanas cuando el método ya las lleva', () => {
    const labels = getNode('p_method', { cat: 'oly' }, mkCtx(emptyProfile()), []).options!.map((o) => o.label);
    expect(labels.some((l) => /semanas\) \(/.test(l))).toBe(false);
    expect(labels.some((l) => /Mayhem Burgener — Base \(6 semanas\)/.test(l))).toBe(true);
  });

  it('antes de añadirlo avisa de que pausa el macrociclo y los objetivos, y "Mejor no" no añade nada', () => {
    const warn = getNode('p_warn', {}, mkCtx(emptyProfile()), []);
    expect(warn.text).toMatch(/objetivos quedan en pausa/);
    const out = walk(['Un programa de fuerza', 'Volver tras un parón', 'Lineal', lifts4, '4 semanas', 'Hoy', 'Mejor no']);
    expect(out.plan).toHaveLength(0);
    expect(out.id).toBe('more');
  });

  it('ofrece encadenar tras un programa que ya tienes', () => {
    const profile = emptyProfile({ strengthPrograms: [{ id: 'p', startDate: '2026-10-28', endDate: '2026-12-22', method: '531', lifts: [] }] });
    const node = getNode('p_start', { method: 'lineal' }, mkCtx(profile), []);
    expect(node.options![0].label).toMatch(/Justo después del último \(23 dic\)/);
  });
});

describe('Rex: rampa y temporada', () => {
  it('la rampa según el parón usa las semanas que ya usa la app', () => {
    const ramp = (gap: string) => walk(['Una rampa de vuelta', gap]).plan[0].payload.ramp!;
    expect(ramp('Menos de 3 semanas')).toEqual({ startDate: TODAY, strengthWeeks: 2, olyWeeks: 2, wodWeeks: 1 });
    expect(ramp('De 3 a 6 semanas')).toMatchObject({ strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 });
    expect(ramp('Más de 6 semanas')).toMatchObject({ strengthWeeks: 6, olyWeeks: 6, wodWeeks: 4 });
  });

  it('avisa si ya tienes una rampa (la sustituye)', () => {
    const profile = emptyProfile({ intensityRamp: { startDate: TODAY, strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 } });
    expect(getNode('r_gap', {}, mkCtx(profile), []).text).toMatch(/la sustituiría/);
  });

  it('una temporada son varias cosas a la vez: rampa si vienes de un parón, macro con el pico al final y la competición en su último día', () => {
    const { plan } = walk(['Una temporada completa', '12 semanas', 'Sí, de 3 a 6 semanas']);
    expect(plan.map((p) => p.kind)).toEqual(['Rampa', 'Macrociclo', 'Objetivo']);
    const macro = plan[1].payload.macro!;
    expect(macro.phaseWeeks).toEqual([5, 4, 2, 1]);
    expect(plan[2].payload.goal).toMatchObject({ type: 'preparar-competicion', targetDate: macro.endDate });
    expect(plan[0].payload.ramp).toMatchObject({ strengthWeeks: 4 });
  });

  it('sin parón no lleva rampa', () => {
    expect(walk(['Una temporada completa', '8 semanas', 'No, vengo entrenando']).plan.map((p) => p.kind)).toEqual(['Macrociclo', 'Objetivo']);
  });
});

describe('Rex: "no lo sé, ayúdame"', () => {
  const withEmphasis = (area: 'fuerza' | 'halterofilia' | 'motor' | 'gimnasticos', row: string) =>
    emptyProfile({ emphasisPlan: { enabled: true, items: [{ key: `${area}:${row}`, area, row, action: 'x', why: 'va por debajo de lo esperable' }], removed: [] } });

  it('si el perfil ya prioriza algo, propone eso con su motivo', () => {
    const sug = suggestionFromProfile(withEmphasis('fuerza', 'deadlift'))!;
    expect(sug.state).toMatchObject({ type: 'elevar-fuerza', movementId: 'deadlift' });
    const out = walk(['No lo sé, ayúdame', 'Sí, adelante', '8 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás'], withEmphasis('fuerza', 'deadlift'));
    expect(out.plan[0].payload.goal).toMatchObject({ type: 'elevar-fuerza', movementId: 'deadlift' });
    expect(getNode('i_suggest', {}, mkCtx(withEmphasis('fuerza', 'deadlift')), []).text).toMatch(/Mirando tu perfil.*peso muerto/);
  });

  it('halterofilia y motor se traducen a su objetivo', () => {
    expect(suggestionFromProfile(withEmphasis('halterofilia', 'snatch'))!.state).toMatchObject({ type: 'mejorar-potencia', movementId: 'snatch' });
    expect(suggestionFromProfile(withEmphasis('halterofilia', 'jerk'))!.state).toMatchObject({ movementId: 'clean-and-jerk' });
    expect(suggestionFromProfile(withEmphasis('motor', 'base-aerobica'))!.state).toMatchObject({ type: 'elevar-resistencia' });
  });

  it('sin nada que priorizar pregunta qué te frena y no dice que lo ha mirado en el perfil', () => {
    const node = getNode('i_suggest', {}, mkCtx(emptyProfile()), []);
    expect(node.text).toMatch(/Qué te frena/);
    const out = walk(['No lo sé, ayúdame', 'Me falta fuerza', 'Sí, adelante', '8 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás']);
    expect(getNode('i_ok', { type: 'elevar-fuerza', detail: 'Sentadilla trasera', why: 'x' }, mkCtx(emptyProfile()), []).text).not.toMatch(/Mirando tu perfil/);
    expect(out.plan[0].payload.goal).toMatchObject({ type: 'elevar-fuerza', movementId: 'back-squat' });
  });

  it('un énfasis de un área sin objetivo equivalente (gimnásticos) no se propone', () => {
    expect(suggestionFromProfile(withEmphasis('gimnasticos', 'x'))).toBeNull();
  });

  it('"mejor otra cosa" vuelve al principio sin tocar el plan', () => {
    const kept = walk(['Un objetivo', 'Más resistencia', '8 semanas', 'Moderado: se mezcla con lo demás']).plan;
    const out = walk(['No lo sé, ayúdame', 'Me falta fuerza', 'Mejor otra cosa'], emptyProfile(), { plan: kept });
    expect(out.plan).toHaveLength(1);
    expect(out.id).toBe('start');
    expect(out.s).toEqual({});
  });
});

describe('Rex: varias cosas y crear el plan', () => {
  it('cada cosa nueva empieza de cero: no arrastra lo contestado en la anterior', () => {
    const { plan } = walk(['Un objetivo', 'Subir un PR', 'Sentadilla trasera', '12 semanas', 'Sin peso, solo mejorar', 'Intensivo: casi todo gira alrededor', 'Un objetivo', 'Más resistencia', '8 semanas', 'Moderado: se mezcla con lo demás']);
    expect(plan).toHaveLength(2);
    expect(plan[1].payload.goal!.movementId).toBeUndefined();
    expect(plan[1].payload.goal!.emphasis).toBe('moderado');
  });

  it('aplicar el plan suma lo nuevo sin tocar lo que ya había ni mutar el perfil', () => {
    const profile = emptyProfile({ intensityRamp: { startDate: '2026-10-01', strengthWeeks: 2, olyWeeks: 2, wodWeeks: 1 } });
    const before = JSON.stringify(profile);
    const { plan } = walk(['Un objetivo', 'Más resistencia', '8 semanas', 'Moderado: se mezcla con lo demás', 'Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'Hoy', { text: '' }, 'Una rampa de vuelta', 'Más de 6 semanas'], profile);
    const next = applyPlan(profile, plan);
    expect(JSON.stringify(profile)).toBe(before);
    expect(next.goals).toHaveLength(1);
    expect(next.macrocycles).toHaveLength(1);
    expect(next.intensityRamp).toMatchObject({ strengthWeeks: 6, startDate: TODAY });
    expect(applyPlan(profile, [])).toEqual(profile);
  });

  it('los ids de lo creado son únicos', () => {
    const { plan } = walk(['Un objetivo', 'Más resistencia', '8 semanas', 'Moderado: se mezcla con lo demás', 'Un objetivo', 'Más resistencia', '4 semanas', 'Moderado: se mezcla con lo demás']);
    expect(new Set(plan.map((p) => p.id)).size).toBe(2);
  });

  describe('avisos de la revisión', () => {
    const programDays = (start: string, end: string): PlanItem =>
      ({ id: 'a', kind: 'Programa', short: 'x', title: 'Prog', sub: '', fx: [], payload: {}, start, end }) as PlanItem;
    const macroDays = (start: string, end: string, title = 'Macro'): PlanItem => ({ id: 'b', kind: 'Macrociclo', short: 'x', title, sub: '', fx: [], payload: {}, start, end });
    const base = emptyProfile({ macrocycles: [makeMacro({ id: 'm', label: 'Otoño', startDate: '2026-09-23', endDate: '2026-12-16' })] });

    it('un programa avisa de que pausa lo demás, con sus fechas', () => {
      expect(reviewNotes([programDays('2026-11-04', '2026-12-29')], base, TODAY).join(' ')).toMatch(/4 nov al 29 dic manda el programa de fuerza/);
    });

    it('un programa solo, sin nada que pausar, no avisa', () => {
      expect(reviewNotes([programDays('2026-11-04', '2026-12-29')], emptyProfile(), TODAY)).toEqual([]);
    });

    it('dos programas que se pisan, o un macrociclo que pisa a uno existente, se avisan', () => {
      expect(reviewNotes([programDays('2026-11-04', '2026-12-01'), programDays('2026-11-20', '2026-12-30')], emptyProfile(), TODAY).join(' ')).toMatch(/se pisan/);
      expect(reviewNotes([macroDays('2026-11-10', '2027-01-01', 'Invierno')], base, TODAY).join(' ')).toMatch(/«Invierno» se pisa con «Otoño»/);
    });

    it('macrociclos encadenados sin pisarse solo recuerdan que va uno detrás de otro', () => {
      const notes = reviewNotes([macroDays('2026-12-17', '2027-02-10'), macroDays('2027-02-11', '2027-04-01')], base, TODAY);
      expect(notes).toEqual(['Los macrociclos van uno detrás de otro: solo hay uno activo cada día.']);
    });

    it('una rampa nueva avisa de que sustituye a la que tienes', () => {
      const profile = emptyProfile({ intensityRamp: { startDate: TODAY, strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 } });
      const ramp = { id: 'ramp', kind: 'Rampa', short: 'x', title: 'Rampa', sub: '', fx: [], payload: {} } as PlanItem;
      expect(reviewNotes([ramp], profile, TODAY)).toEqual(['La rampa nueva sustituye a la que tenías.']);
    });
  });
});

describe('Rex: lo que crea es lo que la app espera', () => {
  it('todos los tipos de commit producen cosas con datos completos', () => {
    const ctx = mkCtx(emptyProfile());
    const s: FlowState = { type: 'elevar-fuerza', movementId: 'back-squat', detail: 'Sentadilla trasera', weeks: 8, push: 'moderado', phases: 'base', startIso: TODAY, method: 'lineal', lifts: ['backSquat'], ramp: { s: 2, o: 2, w: 1 } };
    for (const kind of ['obj', 'macro', 'prog', 'ramp', 'season'] as CommitKind[]) {
      const items = commitItems(kind, s, ctx);
      expect(items.length, kind).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.title.length, kind).toBeGreaterThan(0);
        expect(it.fx.length, kind).toBeGreaterThan(0);
        expect(Object.values(it.payload).filter(Boolean), kind).toHaveLength(1);
      }
    }
  });

  it('los programas y macrociclos creados tienen fechas ordenadas y duración exacta en semanas', () => {
    const ctx = mkCtx(emptyProfile());
    const m = commitItems('macro', { weeks: 12, startIso: TODAY, phases: 'clasico' }, ctx)[0].payload.macro!;
    const p = commitItems('prog', { method: '531', weeks: 8, startIso: TODAY }, ctx)[0].payload.program!;
    expect(m.startDate < m.endDate).toBe(true);
    expect(p.startDate < p.endDate).toBe(true);
    expect((new Date(`${m.endDate}T00:00:00`).getTime() - new Date(`${m.startDate}T00:00:00`).getTime()) / 86_400_000 / 7).toBeCloseTo(12, 0);
  });
});

describe('Rex: el nombre del macrociclo', () => {
  const upTo = ['Un macrociclo', '12 semanas (3 meses)', 'Clásico: ciclos de 4 semanas en bucle', 'Hoy'] as const;

  it('lo último que pregunta es el nombre, y propone el automático por si lo dejas vacío', () => {
    const out = walk([...upTo]);
    expect(out.id).toBe('m_name');
    const node = getNode('m_name', out.s, out.ctx, out.plan);
    expect(node.input).toMatchObject({ field: 'label', suggested: 'Macro 12 semanas · 4 nov', max: 60, commit: 'macro' });
    expect(node.text).toContain('Macro 12 semanas · 4 nov');
  });

  it('con un nombre puesto, lo lleva el macrociclo (sin espacios de más)', () => {
    expect(walk([...upTo, { text: '  Prep competición invierno  ' }]).plan[0].payload.macro!.label).toBe('Prep competición invierno');
  });

  it('vacío o solo espacios, usa el automático', () => {
    expect(walk([...upTo, { text: '   ' }]).plan[0].payload.macro!.label).toBe('Macro 12 semanas · 4 nov');
  });

  it('un nombre larguísimo se recorta', () => {
    expect(walk([...upTo, { text: 'x'.repeat(200) }]).plan[0].payload.macro!.label).toHaveLength(60);
  });

  it('el nombre automático sigue la fecha de arranque elegida', () => {
    const out = walk(['Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'El lunes que viene']);
    expect(getNode('m_name', out.s, out.ctx, out.plan).input!.suggested).toBe('Macro 8 semanas · 9 nov');
  });

  it('el nombre de un macro no se arrastra al siguiente', () => {
    const first = walk([...upTo, { text: 'Primero' }]);
    const second = walk(['Un macrociclo', '8 semanas', 'Clásico: ciclos de 4 semanas en bucle', 'Hoy', { text: '' }], emptyProfile(), { plan: first.plan });
    expect(second.plan[1].payload.macro!.label).toMatch(/^Macro 8 semanas/);
  });

  it('una temporada se llama como ella misma, sin preguntar', () => {
    expect(walk(['Una temporada completa', '12 semanas', 'No, vengo entrenando']).plan[0].payload.macro!.label).toMatch(/^Temporada 12 semanas/);
  });
});


describe('Rex: despues de la competicion', () => {
  // Competicion del 6 al 7 de noviembre; hoy es 10 (martes siguiente).
  const NOW = '2026-11-10';
  const comp = { id: 'g-comp', type: 'preparar-competicion' as const, targetDate: '2026-11-06', eventEndDate: '2026-11-07', emphasis: 'intensivo' as const, createdAt: '2026-09-01' };
  const otono = makeMacro({ id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-12-16' });
  const profile = () => emptyProfile({ goals: [comp], macrocycles: [otono] });
  const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const run = (steps: Step[], p: AthleteProfile = profile()) => {
    const ctx = { profile: p, todayIso: NOW, newId: (() => { let i = 0; return () => `n-${++i}`; })() };
    let s: FlowState = {};
    let id = 'c_feel';
    const plan: PlanItem[] = [];
    for (const step of steps) {
      const node = getNode(id, s, ctx, plan);
      if (typeof step === 'string') {
        const o = node.options?.find((x) => plain(x.label) === plain(step));
        if (!o) throw new Error(`En ${id} no hay boton ${step}. Hay: ${node.options?.map((x) => x.label).join(' | ')}`);
        s = { ...s, ...o.set };
        if (o.commit) plan.push(...commitItems(o.commit, s, ctx));
        else id = o.next ?? 'more';
      } else if ('date' in step) {
        const d = node.date!;
        s = { ...s, [d.field]: step.date };
        if (d.commit) plan.push(...commitItems(d.commit, s, ctx));
        else id = d.next ?? 'more';
      }
    }
    return { s, plan, ctx };
  };

  it('pregunta como fue, y con fecha de la siguiente monta cierre, vuelta suave, bloques y la competicion', () => {
    const { plan } = run(['Bien', 'Ya tengo fecha', { date: '2027-03-12' }, 'Un solo dia']);
    expect(plan.map((p) => p.kind)).toEqual(['Cierre', 'Rampa', 'Macrociclo', 'Macrociclo', 'Macrociclo', 'Objetivo']);
    expect(plan[0].payload.close).toEqual({ goalId: 'g-comp', feeling: 4 });
    const macros = plan.filter((p) => p.kind === 'Macrociclo').map((p) => p.payload.macro!);
    // empiezan el lunes 16, sin huecos, y el ultimo cubre la competicion y una semana mas
    expect(macros[0].startDate).toBe('2026-11-16');
    expect(macros[1].startDate).toBe(addDaysIso(macros[0].endDate, 1));
    expect(macros[2].startDate).toBe(addDaysIso(macros[1].endDate, 1));
    expect(macros[2].endDate).toBe('2027-03-19');
    expect(plan[5].payload.goal).toMatchObject({ type: 'preparar-competicion', targetDate: '2027-03-12' });
  });

  it('aplicar: guarda el resultado, recorta el macro de otono y deja la nueva competicion', () => {
    const { plan } = run(['Muy bien', 'Ya tengo fecha', { date: '2027-03-12' }, 'Un solo dia']);
    const next = applyPlan(profile(), plan, NOW);
    expect(next.goals.find((g) => g.id === 'g-comp')?.result).toEqual({ feeling: 5, closedAt: NOW });
    expect(next.goals.filter((g) => g.type === 'preparar-competicion')).toHaveLength(2);
    expect(next.macrocycles.find((m) => m.id === 'otono')?.endDate).toBe('2026-11-15');
    expect(next.intensityRamp).toBeDefined();
    // ningun dia queda cubierto por dos macros
    const sorted = [...next.macrocycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startDate > sorted[i - 1].endDate).toBe(true);
  });

  it('sin fecha: provisional a las semanas elegidas, marcada como tal', () => {
    const { plan } = run(['Regular', 'Aun no la se', '16 semanas']);
    const goal = plan.find((p) => p.kind === 'Objetivo')!.payload.goal!;
    expect(goal.provisional).toBe(true);
    expect(goal.targetDate).toBe(addDaysIso(NOW, 16 * 7));
    expect(plan.find((p) => p.kind === 'Objetivo')!.sub).toContain('provisional');
  });

  it('si la siguiente ya esta apuntada, la usa sin duplicarla', () => {
    const next = { ...comp, id: 'g-next', targetDate: '2027-02-06', eventEndDate: '2027-02-07' };
    const p = emptyProfile({ goals: [comp, next], macrocycles: [otono] });
    const { plan } = run(['Bien', 'Si, montalo'], p);
    expect(plan.some((x) => x.kind === 'Objetivo')).toBe(false);
    expect(plan.filter((x) => x.kind === 'Macrociclo').length).toBeGreaterThan(0);
    expect(applyPlan(p, plan, NOW).goals.filter((g) => g.type === 'preparar-competicion')).toHaveLength(2);
  });

  it('con menos de cuatro semanas no monta bloques, solo el cierre, la vuelta y la competicion', () => {
    const { plan } = run(['Mal', 'Ya tengo fecha', { date: '2026-11-28' }, 'Un solo dia']);
    expect(plan.map((p) => p.kind)).toEqual(['Cierre', 'Rampa', 'Objetivo']);
  });

  it('con una competicion de varias dias, el macro cubre hasta el ultimo mas una semana', () => {
    const { plan } = run(['Bien', 'Ya tengo fecha', { date: '2027-01-15' }, 'Varios dias', { date: '2027-01-17' }]);
    const macros = plan.filter((p) => p.kind === 'Macrociclo').map((p) => p.payload.macro!);
    expect(macros[macros.length - 1].endDate).toBe('2027-01-24');
    expect(plan.find((p) => p.kind === 'Objetivo')!.payload.goal).toMatchObject({ targetDate: '2027-01-15', eventEndDate: '2027-01-17' });
  });

  it('Ahora mismo no compito: cierra y pone la rampa, sin crear macros ni otra competicion, y el macro sigue', () => {
    const { plan } = run(['Bien', 'Ahora mismo no compito']);
    expect(plan.map((p) => p.kind)).toEqual(['Cierre', 'Rampa']);
    const next = applyPlan(profile(), plan, NOW);
    expect(next.macrocycles).toEqual(profile().macrocycles);
    expect(next.goals.filter((g) => g.type === 'preparar-competicion')).toHaveLength(1);
    expect(next.goals[0].result).toEqual({ feeling: 4, closedAt: NOW });
  });

  it('cada bloque lleva el id de la competicion a la que va, para poder reajustarse si cambia la fecha', () => {
    const { plan } = run(['Bien', 'Ya tengo fecha', { date: '2027-03-12' }, 'Un solo dia']);
    const goalId = plan.find((p) => p.kind === 'Objetivo')!.payload.goal!.id;
    const macros = plan.filter((p) => p.kind === 'Macrociclo').map((p) => p.payload.macro!);
    expect(macros.length).toBeGreaterThan(0);
    for (const m of macros) expect(m.forGoalId).toBe(goalId);
  });
});


describe('Rex: meta en kilos', () => {
  // TODAY (4 nov 2026); la sentadilla del perfil de pruebas es de 170 kg.
  const base = () => emptyProfile({ prs: { backSquat: 170, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 } });
  const toDate = ['Un objetivo', 'Subir un PR', 'Sentadilla trasera'];

  it('despues de la fecha, pregunta el peso con tu marca actual y metas sugeridas', () => {
    const w = walk([...toDate, '12 semanas'], base());
    expect(w.id).toBe('o_kg');
    const node = getNode('o_kg', w.s, w.ctx, w.plan);
    expect(node.text).toContain('170 kg');
    expect(node.options!.map((o) => o.label)).toEqual(['175 kg · +5', '180 kg · +10', '187,5 kg · +17,5', 'Otro peso', 'Sin peso, solo mejorar']);
  });

  it('elegir una meta la comprueba (cuanto por semana y si es realista) y se guarda con su punto de partida', () => {
    const w = walk([...toDate, '12 semanas', '180 kg · +10'], base());
    expect(w.id).toBe('o_kg_check');
    const text = getNode('o_kg_check', w.s, w.ctx, w.plan).text;
    expect(text).toContain('por semana');
    expect(text).toContain('180 kg');
    const done = walk(['Sí, esa meta', 'Moderado: se mezcla con lo demás'], base(), { s: w.s, node: 'o_kg_check' });
    const goal = done.plan[0].payload.goal!;
    expect(goal.targetKg).toBe(180);
    expect(goal.startKg).toBe(170);
    expect(done.plan[0].sub).toContain('180 kg');
  });

  it('una meta muy ambiciosa ofrece una mas ajustada', () => {
    const w = walk([...toDate, '4 semanas'], base());
    const node = getNode('o_kg_check', { ...w.s, targetKg: 200 }, w.ctx, w.plan);
    expect(node.text).toContain('ambiciosa');
    expect(node.options!.some((o) => /^Mejor \d/.test(o.label))).toBe(true);
  });

  it('sin peso, el objetivo se crea como siempre (sin meta ni punto de partida)', () => {
    const w = walk([...toDate, '12 semanas', 'Sin peso, solo mejorar', 'Moderado: se mezcla con lo demás'], base());
    const goal = w.plan[0].payload.goal!;
    expect(goal.targetKg).toBeUndefined();
    expect(goal.startKg).toBeUndefined();
  });

  it('sin una marca de ese levantamiento no se pregunta el peso; y los objetivos que no son de fuerza tampoco', () => {
    const noPr = emptyProfile({ prs: { backSquat: 0, frontSquat: 0, benchPress: 0, deadlift: 0, strictPress: 0, clean: 0, snatch: 0, cleanAndJerk: 0 } });
    expect(walk([...toDate, '12 semanas'], noPr).id).toBe('o_push');
    expect(walk(['Un objetivo', 'Más resistencia', '12 semanas'], base()).id).toBe('o_push');
  });

  it('Otro peso pide un numero', () => {
    const w = walk([...toDate, '12 semanas', 'Otro peso'], base());
    const node = getNode('o_kg_input', w.s, w.ctx, w.plan);
    expect(node.number).toMatchObject({ field: 'targetKg', next: 'o_kg_check' });
    expect(node.number!.min).toBeGreaterThan(170);
  });
});
describe('Rex: confirmar la fecha de una competicion provisional', () => {
  const NOW = '2026-11-10';
  const provisional = { id: 'gp', type: 'preparar-competicion' as const, targetDate: '2027-03-02', emphasis: 'moderado' as const, createdAt: '2026-11-10', provisional: true };
  const blocks = buildBlocksToCompetition('2026-11-16', '2027-03-02', (() => { let i = 0; return () => `b${++i}`; })(), 'gp');
  const otono = makeMacro({ id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-11-15' });
  const profile = () => emptyProfile({ goals: [provisional], macrocycles: [otono, ...blocks] });
  const ctx = () => ({ profile: profile(), todayIso: NOW, newId: (() => { let i = 0; return () => `n-${++i}`; })() });

  it('pregunta la fecha y, con ella, propone el cambio con lo que se reajusta', () => {
    const c = ctx();
    const first = getNode('d_date', {}, c, []);
    expect(first.text).toContain('provisional');
    expect(first.date).toMatchObject({ field: 'targetDate', next: 'd_days' });
    const items = commitItems('date', { targetDate: '2027-03-16' }, c);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('Cambio');
    expect(items[0].sub).toContain('(provisional)');
    expect(items[0].fx.join(' ')).toMatch(/2 semanas más tarde/);
  });

  it('aplicar cambia la fecha, quita lo provisional y reajusta los bloques de esa competicion', () => {
    const c = ctx();
    const items = commitItems('date', { targetDate: '2027-03-16' }, c);
    const next = applyPlan(profile(), items, NOW);
    const goal = next.goals.find((g) => g.id === 'gp')!;
    expect(goal.targetDate).toBe('2027-03-16');
    expect(goal.provisional).toBeUndefined();
    const mine = next.macrocycles.filter((m) => m.forGoalId === 'gp');
    expect(mine[mine.length - 1].endDate).toBe('2027-03-23');
  });

  it('sin competicion provisional no hay nada que confirmar', () => {
    const c = { profile: emptyProfile({ goals: [{ ...provisional, provisional: undefined }] }), todayIso: NOW };
    expect(commitItems('date', { targetDate: '2027-03-16' }, c)).toEqual([]);
    expect(getNode('d_date', {}, c, []).options).toBeDefined();
  });
});
