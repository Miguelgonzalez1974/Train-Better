import { describe, it, expect } from 'vitest';
import type { CatalogWod, WodSource } from './wodCatalog';
import { explainChoice, pickRanked, rankCatalogWods, type SelectionContext } from './wodSelection';

let seq = 0;
function wod(over: Partial<CatalogWod> = {}): CatalogWod {
  seq += 1;
  return {
    id: `bm:t${seq}`,
    origin: 'benchmark',
    refId: `t${seq}`,
    source: 'mayhem',
    name: `WOD ${seq}`,
    text: 'For time: 21-15-9 Thrusters, Pull-ups',
    format: 'forTime',
    durationMin: 12,
    durationBasis: 'cap',
    energy: 'umbral',
    movementIds: ['thruster', 'strict-pull-up'],
    unresolved: [],
    domainCounts: { gymnastics: 1, weighted: 1, monostructural: 0 },
    leadDomain: 'gymnastics',
    hasLoadedLift: false,
    hasHighSkill: false,
    exclusions: [],
    usable: true,
    ...over,
  };
}

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  targetMin: 12,
  energy: 'umbral',
  leadDomain: null,
  lowInterference: false,
  lightPref: 0,
  competitionPeak: false,
  excludePatterns: new Set(),
  painAvoided: new Set(),
  recentCatalogIds: new Set(),
  ...over,
});

const top = (catalog: CatalogWod[], c: SelectionContext) => rankCatalogWods(catalog, c)[0]?.wod;

describe('selección del WOD real — filtros duros', () => {
  it('descarta lo no programable, lo reciente y lo de otras fuentes', () => {
    const ok = wod();
    const unusable = wod({ usable: false, exclusions: ['sin-duracion'] });
    const recent = wod();
    const other = wod({ source: 'invictus' });
    const ranked = rankCatalogWods([ok, unusable, recent, other], ctx({ recentCatalogIds: new Set([recent.id]), allowedSources: ['mayhem'] }));
    expect(ranked.map((r) => r.wod.id)).toEqual([ok.id]);
  });

  it('un aviso de molestia nunca se relaja: ni por movimientos ni por palabras del texto', () => {
    const jump = wod({ movementIds: ['box-jump-over', 'strict-pull-up'], text: '3 rounds: 10 Box Jump Overs, 5 Pull-ups' });
    const sneaky = wod({ movementIds: ['strict-pull-up'], text: 'For time: 50 Double Unders, 10 Pull-ups (hop over the box)' });
    const safe = wod({ movementIds: ['strict-pull-up', 'row'], text: 'For time: 10 Pull-ups, 500 m Row' });
    const ranked = rankCatalogWods([jump, sneaky, safe], ctx({ painAvoided: new Set(['jump'] as never) }));
    expect(ranked.map((r) => r.wod.id)).toEqual([safe.id]);
  });

  it('los patrones de la fuerza de hoy se evitan mientras queden alternativas, y se relajan si dejarían el grupo casi vacío', () => {
    const squats = Array.from({ length: 4 }, () => wod({ movementIds: ['air-squat'] }));
    const pulls = Array.from({ length: 10 }, () => wod({ movementIds: ['strict-pull-up'] }));
    const withAlternatives = rankCatalogWods([...squats, ...pulls], ctx({ excludePatterns: new Set(['squat'] as never) }));
    expect(withAlternatives.every((r) => !squats.includes(r.wod))).toBe(true);
    const fewAlternatives = rankCatalogWods([...squats, pulls[0]], ctx({ excludePatterns: new Set(['squat'] as never) }));
    expect(fewAlternatives.length).toBe(5);
  });

  it('un WOD con demasiados movimientos no se sirve como WOD del día', () => {
    const long = wod({ movementIds: ['air-squat', 'strict-pull-up', 'push-up', 'row', 'box-jump-over', 'thruster', 'burpee', 'sit-up'] });
    expect(rankCatalogWods([long], ctx())).toEqual([]);
  });
});

describe('selección del WOD real — puntuación', () => {
  it('prefiere la duración que pide el día', () => {
    const near = wod({ durationMin: 12 });
    const far = wod({ durationMin: 28 });
    const short = wod({ durationMin: 4 });
    expect(top([far, short, near], ctx({ targetMin: 12 }))).toBe(near);
    expect(top([far, short, near], ctx({ targetMin: 26 }))).toBe(far);
  });

  it('un día de poca preparación acorta la duración buscada y huye de la barra con carga y los gimnásticos duros', () => {
    const light = wod({ durationMin: 9 });
    const heavy = wod({ durationMin: 12, hasLoadedLift: true, hasHighSkill: true });
    expect(top([heavy, light], ctx({ lightPref: 0 }))).toBe(heavy);
    expect(top([heavy, light], ctx({ lightPref: 1 }))).toBe(light);
  });

  it('un día de fuerza (poca interferencia) prefiere lo que no carga barra', () => {
    const barbell = wod({ hasLoadedLift: true });
    const engine = wod({ hasLoadedLift: false });
    expect(top([barbell, engine], ctx({ lowInterference: true }))).toBe(engine);
  });

  it('encaja el sistema energético y el dominio planificados', () => {
    const power = wod({ durationMin: 12, energy: 'potencia' });
    const threshold = wod({ durationMin: 12, energy: 'umbral' });
    expect(top([power, threshold], ctx({ energy: 'umbral' }))).toBe(threshold);
    const bar = wod({ leadDomain: 'weighted' });
    const cardio = wod({ leadDomain: 'monostructural', domainCounts: { gymnastics: 0, weighted: 0, monostructural: 2 } });
    expect(top([cardio, bar], ctx({ leadDomain: 'weighted' }))).toBe(bar);
  });

  it('para recuperación solo sirven los WODs ligeros', () => {
    const heavy = wod({ energy: 'umbral', hasLoadedLift: true, durationMin: 12 });
    const easy = wod({ energy: 'umbral', durationMin: 12 });
    expect(top([heavy, easy], ctx({ energy: 'recuperacion' }))).toBe(easy);
  });

  it('con la competición cerca prefiere las programaciones de competición', () => {
    const pj = wod({ source: 'pushjerk' });
    const mayhem = wod({ source: 'mayhem' });
    expect(top([pj, mayhem], ctx({ competitionPeak: true }))).toBe(mayhem);
  });

  it('reparte entre programaciones: una fuente que ya llena los últimos WODs puntúa menos', () => {
    const mayhem = wod({ source: 'mayhem' });
    const invictus = wod({ source: 'invictus' });
    const recentSources: WodSource[] = ['mayhem', 'mayhem', 'mayhem', 'mayhem', 'mayhem', 'mayhem'];
    expect(top([mayhem, invictus], ctx({ recentSources }))).toBe(invictus);
  });

  it('evita el mismo formato que los dos últimos', () => {
    const emom = wod({ format: 'emom' });
    const amrap = wod({ format: 'amrap' });
    expect(top([emom, amrap], ctx({ recentFormats: ['emom', 'forTime'] }))).toBe(amrap);
  });

  it('esquiva los patrones que cargará el accesorio de hoy (penaliza, no excluye)', () => {
    const pulls = wod({ movementIds: ['strict-pull-up'] });
    const squats = wod({ movementIds: ['air-squat'] });
    const c = ctx({ softAvoidPatterns: new Set(['verticalPull'] as never) });
    const ranked = rankCatalogWods([pulls, squats], c);
    expect(ranked[0].wod).toBe(squats);
    expect(ranked).toHaveLength(2);
  });
});

describe('selección del WOD real — sorteo y explicación', () => {
  const ranked = rankCatalogWods(
    Array.from({ length: 12 }, (_, i) => wod({ durationMin: 12 + i })),
    ctx(),
  );

  it('es determinista con la misma semilla y siempre sale de los mejores', () => {
    const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const a = pickRanked(ranked, seeded(42))!;
    const b = pickRanked(ranked, seeded(42))!;
    expect(a.wod.id).toBe(b.wod.id);
    for (let s = 1; s < 200; s++) expect(ranked.slice(0, 6)).toContain(pickRanked(ranked, seeded(s)));
  });

  it('no es siempre el primero (variedad) pero el primero sale más que el sexto', () => {
    const counts = new Map<string, number>();
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 2000; i++) {
      const id = pickRanked(ranked, rand)!.wod.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(2);
    expect(counts.get(ranked[0].wod.id) ?? 0).toBeGreaterThan(counts.get(ranked[5].wod.id) ?? 0);
  });

  it('sin candidatos no hay elección', () => {
    expect(pickRanked([], () => 0.5)).toBeNull();
  });

  it('explica por qué: duración, sistema energético, dominio y cómo llegas', () => {
    const c = ctx({ targetMin: 12, energy: 'umbral', leadDomain: 'gymnastics', lightPref: 0.8 });
    const r = rankCatalogWods([wod({ durationMin: 12 })], c)[0];
    const text = explainChoice(r, c).join(' ');
    expect(text).toMatch(/12 min/);
    expect(text).toMatch(/umbral/);
    expect(text).toMatch(/gimnásticos/);
    expect(text).toMatch(/justo/);
  });
});
