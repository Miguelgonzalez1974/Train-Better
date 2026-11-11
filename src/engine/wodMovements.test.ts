import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry, WodScalingEntry } from '../data/athlete/types';
import { analyzeWodMovements, buildWodDetail, buildWorkGoal, scalingAlternatives, workGoalFor, zoneOf } from './wodMovements';

const TODAY = '2026-12-20';
const entry = (date: string, ids: string[], scaling: WodScalingEntry[] | undefined, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date,
  mesocycleWeek: 2,
  movementIds: ids,
  rxOrScaled: scaling && scaling.length > 0 ? 'scaled' : 'rx',
  rpe: 7,
  durationMin: 60,
  wodMovementIds: ids,
  ...(scaling ? { wodScaling: scaling } : {}),
  ...extra,
});
const swap = (movementId: string, substituteId = 'ring-row'): WodScalingEntry => ({ movementId, kind: 'movimiento', substituteId });
const light = (movementId: string, loadKg: number, rxKg: number): WodScalingEntry => ({ movementId, kind: 'peso', loadKg, rxKg });
const day = (n: number) => `2026-12-${String(n).padStart(2, '0')}`;

describe('zonas del WOD', () => {
  it('cada movimiento cae en su zona', () => {
    expect(zoneOf('handstand-push-up')).toBe('gimnasticos');
    expect(zoneOf('row')).toBe('cardio');
    expect(zoneOf('double-under')).toBe('cardio');
    expect(zoneOf('thruster')).toBe('barra');
    expect(zoneOf('burpee')).toBe('corporal');
    expect(zoneOf('no-existe')).toBeNull();
  });

  it('las alternativas para cambiar un movimiento son las mas faciles del catalogo que existen', () => {
    for (const a of scalingAlternatives('handstand-push-up')) expect(a.name.length).toBeGreaterThan(0);
    expect(scalingAlternatives('no-existe')).toEqual([]);
  });
});

describe('Tu WOD por zonas', () => {
  const history = [
    entry(day(2), ['handstand-push-up', 'thruster'], [swap('handstand-push-up', 'pike-push-up'), light('thruster', 30, 43)]),
    entry(day(5), ['handstand-push-up', 'burpee'], [swap('handstand-push-up', 'pike-push-up')]),
    entry(day(9), ['thruster', 'row'], [light('thruster', 30, 43)]),
    entry(day(12), ['thruster', 'burpee'], []),
    entry(day(15), ['handstand-push-up', 'row'], [swap('handstand-push-up', 'pike-push-up')], { wodResult: { scoreType: 'time', value: 'CAP · 5+3', capped: true } }),
    entry(day(18), ['thruster', 'burpee', 'row'], [light('thruster', 35, 43)]),
  ];

  it('reparte cada zona en Rx, peso, movimiento y cap, con porcentajes que suman 100', () => {
    const r = analyzeWodMovements(history, TODAY, 8);
    expect(r.wods).toBe(6);
    for (const z of r.zones) expect(z.rx + z.peso + z.movimiento + z.cap).toBe(100);
    const g = r.zones.find((z) => z.zone === 'gimnasticos')!;
    expect(g.wods).toBe(3);
    // 2 con el movimiento cambiado y 1 capped (el cap manda sobre el resto)
    expect(g.movimiento).toBe(67);
    expect(g.cap).toBe(33);
    const b = r.zones.find((z) => z.zone === 'barra')!;
    expect(b.peso).toBeGreaterThan(0);
    expect(r.zones.map((z) => z.zone)).toEqual(['gimnasticos', 'barra', 'cardio', 'corporal']);
  });

  it('marca como flojo el movimiento que cambias seguido, con por cual y cuantas veces', () => {
    const r = analyzeWodMovements(history, TODAY, 8);
    const hspu = r.improve.find((f) => f.movementId === 'handstand-push-up')!;
    expect(hspu.kind).toBe('movimiento');
    expect(hspu.scaled).toBe(3);
    expect(hspu.detail).toMatch(/Cambiado por .* en 3 de 3/);
    expect(hspu.workable).toBe(true);
  });

  it('marca el peso escalado con los kilos y el porcentaje del Rx', () => {
    const r = analyzeWodMovements(history, TODAY, 8);
    const th = r.improve.find((f) => f.movementId === 'thruster')!;
    expect(th.kind).toBe('peso');
    expect(th.detail).toMatch(/de 43 kg · \d+ % del Rx/);
  });

  it('el movimiento cambiado va antes que el de peso, y lo que haces bien sale aparte', () => {
    const r = analyzeWodMovements(history, TODAY, 8);
    expect(r.improve[0].kind).toBe('movimiento');
    expect(r.good).toContain('Burpee');
  });

  it('con pocos casos no hay marca: dos escalados sueltos de peso no son un patron', () => {
    const few = [entry(day(2), ['thruster'], [light('thruster', 30, 43)]), entry(day(5), ['thruster'], [light('thruster', 30, 43)]), entry(day(9), ['thruster'], [])];
    expect(analyzeWodMovements(few, TODAY, 8).improve).toEqual([]);
  });

  it('las entradas sin anotar el escalado no cuentan; las Rx de antes si', () => {
    const legacy: SessionHistoryEntry[] = [
      { ...entry(day(2), ['thruster'], undefined), rxOrScaled: 'scaled' },
      { ...entry(day(5), ['thruster'], undefined), rxOrScaled: 'rx' },
    ];
    expect(analyzeWodMovements(legacy, TODAY, 8).wods).toBe(1);
  });

  it('el periodo recorta y la tendencia compara las dos mitades', () => {
    const r4 = analyzeWodMovements(history, TODAY, 4);
    expect(r4.wods).toBe(6);
    const old = [entry('2026-09-01', ['thruster'], [light('thruster', 30, 43)]), ...history];
    expect(analyzeWodMovements(old, TODAY, 8).wods).toBe(6);
    expect(analyzeWodMovements(old, TODAY, null).wods).toBe(7);
    const trend = analyzeWodMovements(
      [entry(day(1), ['burpee'], [swap('burpee')]), entry(day(3), ['burpee'], [swap('burpee')]), entry(day(14), ['burpee'], []), entry(day(18), ['burpee'], [])],
      TODAY,
      4,
    ).zones[0].trend;
    expect(trend).toEqual({ before: 0, now: 100 });
  });
});

describe('Trabajarlo', () => {
  it('una habilidad lleva a Mejorar gimnasticos y un levantamiento a su objetivo de fuerza u oly', () => {
    expect(workGoalFor('handstand-push-up')).toMatchObject({ type: 'mejorar-gimnasticos', movementId: 'handstand-push-up' });
    expect(workGoalFor('thruster')).toMatchObject({ type: 'subir-pr', movementId: 'front-squat' });
    expect(workGoalFor('burpee')).toBeNull();
  });

  it('el objetivo se crea a 8 semanas, moderado y con el nivel de partida de una habilidad', () => {
    const g = buildWorkGoal('handstand-push-up', '2026-12-20', () => 'g1')!;
    expect(g).toMatchObject({ id: 'g1', type: 'mejorar-gimnasticos', movementId: 'handstand-push-up', targetDate: '2027-02-14', emphasis: 'moderado', skillLevel: 0.25 });
    expect(buildWorkGoal('burpee', '2026-12-20')).toBeNull();
  });
});

describe('registro largo y lo que se guarda al cerrar', () => {
  it('el registro largo manda sobre el historial de esa fecha y llega mas atras', () => {
    const log = [{ date: day(2), movementIds: ['handstand-push-up'], scaling: [swap('handstand-push-up')] }, { date: day(5), movementIds: ['handstand-push-up'], scaling: [swap('handstand-push-up')] }];
    const hist = [entry(day(2), ['handstand-push-up'], []), entry(day(9), ['handstand-push-up'], [])];
    const r = analyzeWodMovements(hist, TODAY, 8, log);
    // el dia 2 sale del registro (escalado), no del historial (Rx); el dia 9 solo esta en el historial
    expect(r.wods).toBe(3);
    expect(r.improve[0]?.movementId).toBe('handstand-push-up');
  });

  it('buildWodDetail: Rx guarda una lista vacia; escalado guarda lo anotado; sin movimientos que preguntar, nada', () => {
    const asked = [{ movementId: 'thruster', part: 1 as const }];
    expect(buildWodDetail(asked, 'rx', [swap('thruster')], 'duro')).toEqual({ scaling: [], feel: 'duro' });
    expect(buildWodDetail(asked, 'scaled', [swap('thruster'), swap('burpee')], undefined)).toEqual({ scaling: [swap('thruster')] });
    expect(buildWodDetail(asked, 'scaled', [], 'justo')).toEqual({ feel: 'justo' });
    expect(buildWodDetail([], 'rx', [], 'duro')).toBeUndefined();
  });
});
