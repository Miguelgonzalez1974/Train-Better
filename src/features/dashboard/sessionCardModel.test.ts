import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { makeProfile } from '../../engine/__fixtures';
import { agoText, buildSessionCard, topsBefore, type SessionCardInput } from './sessionCardModel';
import type { StrainView } from './StrainRing';

const TODAY = '2026-11-25';
const base = makeProfile();
const profile = { ...base, prs: { ...base.prs, backSquat: 125 } };

const session: DailySession = {
  date: TODAY,
  mesocycleWeek: 1,
  isRestDay: false,
  source: 'generated',
  blocks: [
    { block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 },
    { block: 'wod', movementId: 'burpee', reps: 'AMRAP', format: 'AMRAP 12 min', title: 'Prueba' },
  ],
};
const set = (date: string, kg: number, extra: Partial<WorkSetEntry> = {}): WorkSetEntry => ({ date, movementId: 'back-squat', block: 'strength', setNumber: 1, kg, reps: 5, ...extra });
const strain = (over: Partial<StrainView> = {}): StrainView => ({
  target: { low: 45, high: 65, readiness: 60, yesterday: null, reasons: [], provisional: false, setOn: TODAY },
  planned: { strain: 62, minutes: 55, rpe: 7 } as StrainView['planned'],
  fit: null,
  real: null,
  status: 'sin-sesion' as StrainView['status'],
  learning: {} as StrainView['learning'],
  ...over,
});
const input = (over: Partial<SessionCardInput> = {}): SessionCardInput => ({ isToday: true, session, entry: undefined, strain: strain(), profile, history: [], workLog: [], dayIso: TODAY, companionDone: [], ...over });
const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: TODAY, mesocycleWeek: 1, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 8, durationMin: 45, ...over });

describe('la tarjeta de sesión, antes de entrenar', () => {
  it('peso principal con su %, el WOD con lo que es y cómo se hace, y el esfuerzo previsto junto al título', () => {
    const card = buildSessionCard(input());
    expect(card.kind).toBe('pending');
    expect(card.action).toBe('plan');
    expect(card.title).toMatch(/^Hoy: .*Squat.* \+ WOD$/);
    expect(card.figures.map((f) => f.value)).toEqual(['100 kg', 'Burpee']);
    expect(card.figures[0].label).toMatch(/5×5 · 80 %$/);
    expect(card.figures[1]).toMatchObject({ kind: 'wod', label: 'WOD · AMRAP 12 min' });
    expect(card.effort).toEqual({ value: 62, planned: true, label: 'previsto', over: false, high: 65 });
    expect(card.line).toBeUndefined();
  });

  it('dice de dónde partes con la última vez y su mini historial', () => {
    const card = buildSessionCard(input({ workLog: [set('2026-11-04', 90), set('2026-11-18', 97.5), set('2026-11-18', 92.5, { setNumber: 2 })] }));
    expect(card.line).toMatchObject({ icon: 'history', text: 'Última vez: 97,5 kg · hace 1 sem', spark: [90, 97.5] });
  });

  it('si el coach cambió la sesión, ese aviso manda sobre la comparación', () => {
    const card = buildSessionCard(input({ session: { ...session, dayLight: { color: 'ambar', reasons: [] } }, workLog: [set('2026-11-18', 97.5)] }));
    expect(card.line).toMatchObject({ icon: 'alert', warn: true });
  });

  it('avisa cuando lo previsto se pasa del objetivo', () => {
    const card = buildSessionCard(input({ strain: strain({ planned: { strain: 80, minutes: 55, rpe: 8 } as StrainView['planned'] }) }));
    expect(card.effort).toMatchObject({ value: 80, label: 'se pasa', over: true });
  });

  it('descanso, competición sin sesión y día pasado sin registrar', () => {
    expect(buildSessionCard(input({ session: { ...session, isRestDay: true } }))).toMatchObject({ kind: 'rest', figures: [] });
    expect(buildSessionCard(input({ session: null }))).toMatchObject({ kind: 'empty', action: 'plan' });
    expect(buildSessionCard(input({ isToday: false, session: null }))).toMatchObject({ kind: 'missing', action: 'none' });
  });
});

describe('la tarjeta de sesión, ya hecha', () => {
  const done = (over: Partial<SessionCardInput> = {}) =>
    buildSessionCard(input({ session: null, entry: entry({ wodResult: { scoreType: 'rounds+reps', value: '7+12' } }), strain: strain({ real: 86 }), workLog: [set('2026-11-18', 97.5), set(TODAY, 102.5)], ...over }));

  it('el peso movido (con récord y %), el resultado del WOD y el esfuerzo real que se pasa', () => {
    const card = done();
    expect(card.kind).toBe('done');
    expect(card.action).toBe('done');
    expect(card.meta).toBe('45 min · RPE 8');
    expect(card.figures.map((f) => f.value)).toEqual(['102,5 kg', '7+12 Rx']);
    expect(card.figures[0].label).toMatch(/récord · 82 %$/);
    expect(card.figures[1]).toMatchObject({ kind: 'wod', label: 'WOD' });
    expect(card.effort).toMatchObject({ value: 86, planned: false, label: 'te pasas +21', over: true });
    // Ya hecha, la última línea no lleva mini gráfico: ahí van los minutos y el RPE.
    expect(card.line).toEqual({ icon: 'up', text: '+5 kg frente a la última vez' });
  });

  it('igual o menos que la última vez', () => {
    expect(done({ workLog: [set('2026-11-18', 102.5), set(TODAY, 102.5)] }).line).toMatchObject({ icon: 'same', text: 'Igual que la última vez' });
    expect(done({ workLog: [set('2026-11-18', 105), set(TODAY, 102.5)] }).line).toMatchObject({ icon: 'down', text: '−2,5 kg frente a la última vez' });
  });

  it('una serie fallada no cuenta como el peso movido', () => {
    expect(done({ workLog: [set(TODAY, 102.5), set(TODAY, 110, { setNumber: 2, quality: 'fallada' })] }).figures[0].value).toBe('102,5 kg');
  });

  it('sin comparación posible, dice lo que no se hizo', () => {
    const card = done({ entry: entry({ skipped: [{ block: 'wod' }] }), workLog: [set(TODAY, 100)] });
    expect(card.figures[1]).toMatchObject({ value: '—', label: 'WOD sin hacer' });
    expect(card.line).toMatchObject({ icon: 'alert', text: 'Sin el WOD.' });
  });
});

describe('ayudas', () => {
  it('cuánto hace', () => {
    expect([agoText('2026-11-24', TODAY), agoText('2026-11-22', TODAY), agoText('2026-11-18', TODAY), agoText('2026-11-04', TODAY)]).toEqual(['ayer', 'hace 3 días', 'hace 1 sem', 'hace 3 sem']);
  });

  it('el peso más alto de cada día anterior, en orden y sin fallos', () => {
    const log = [set('2026-11-18', 95), set('2026-11-11', 90), set('2026-11-18', 97.5, { setNumber: 2 }), set('2026-11-18', 120, { setNumber: 3, quality: 'fallada' }), set(TODAY, 130)];
    expect(topsBefore(log, 'back-squat', TODAY)).toEqual([{ date: '2026-11-11', kg: 90 }, { date: '2026-11-18', kg: 97.5 }]);
  });
});

describe('lo que es el WOD', () => {
  const conWod = (blocks: DailySession['blocks']) => buildSessionCard(input({ session: { ...session, blocks: [session.blocks[0], ...blocks] } })).figures[1];

  it('de una programación salen sus movimientos y sus intervalos', () => {
    const real = [{ block: 'wod' as const, movementId: 'benchmark:pj-row-dumbbell-snatch', format: 'Every 90 sec for 15 min: 200 m Row, Dumbbell Snatch (50/35 lb).' }];
    expect(conWod(real)).toEqual({ kind: 'wod', value: 'Row · Dumbbell Snatch', label: 'WOD · intervalos 15 min' });
  });

  it('un clásico sale por su nombre, con tu marca si ya lo hiciste', () => {
    const fran = [{ block: 'wod' as const, movementId: 'benchmark:fran', format: '21-15-9 for time' }];
    const figure = buildSessionCard(input({ history: [entry({ date: '2026-10-01', movementIds: ['benchmark:fran'], wodResult: { scoreType: 'time', value: '4:58' } })], session: { ...session, blocks: fran } })).figures[0];
    expect(figure.value).toBe('Fran');
    expect(figure.label).toMatch(/^WOD · .*tu marca 4:58$/);
  });

  it('con muchos movimientos nombra tres y resume el resto', () => {
    const muchos = ['burpee', 'thruster', 'box-jump', 'double-under', 'wall-ball'].map((movementId) => ({ block: 'wod' as const, movementId, format: 'For Time (3 rondas)' }));
    expect(conWod(muchos)).toEqual({ kind: 'wod', value: 'Burpee · Thruster · Box Jump +2', label: 'WOD · por tiempo' });
  });

  it('ya hecho, el resultado arriba y debajo lo que era', () => {
    const card = buildSessionCard(input({ session: null, entry: entry({ rxOrScaled: 'scaled', wodResult: { scoreType: 'rounds+reps', value: '6+12' }, wodBlocks: [{ block: 'wod', movementId: 'thruster' }, { block: 'wod', movementId: 'burpee' }] }) }));
    expect(card.figures[card.figures.length - 1]).toEqual({ kind: 'wod', value: '6+12 escalado', label: 'WOD · Thruster · Burpee' });
  });

  it('un título largo pierde el «Hoy:»', () => {
    const largo = { ...session, source: 'custom' as const, customTitle: 'Sesión de competición larga' };
    expect(buildSessionCard(input({ session: largo })).title).toBe('Sesión de competición larga');
  });
});

describe('datos incompletos', () => {
  it('un registro antiguo sin movimientos o una serie sin ejercicio no rompen la tarjeta', () => {
    const rotos = [{ date: '2026-01-01' }] as unknown as SessionHistoryEntry[];
    expect(buildSessionCard(input({ history: rotos, session: { ...session, blocks: [{ block: 'wod', movementId: 'benchmark:fran', format: 'forTime' }] } })).kind).toBe('pending');
    const sinNombre = [{ date: TODAY, kg: 80, block: 'strength' }] as unknown as WorkSetEntry[];
    expect(buildSessionCard(input({ session: null, entry: entry(), strain: strain({ real: 50 }), workLog: sinNombre })).kind).toBe('done');
    expect(buildSessionCard(input({ session: null, entry: { date: TODAY } as unknown as SessionHistoryEntry })).meta).toBeUndefined();
  });

  it('un WOD sin límite enseña sus movimientos y su formato', () => {
    const libre = { ...session, blocks: [{ block: 'wod', movementId: 'burpee', title: 'Un nombre larguísimo de WOD', format: 'Por calidad' }] } as unknown as DailySession;
    expect(buildSessionCard(input({ session: libre })).figures[0]).toEqual({ kind: 'wod', value: 'Burpee', label: 'WOD · Por calidad' });
  });

  it('un resultado sin rellenar («0 reps») no sale como marca', () => {
    const card = buildSessionCard(input({ session: null, entry: entry({ wodResult: { scoreType: 'reps', value: '0 reps' } }), strain: strain({ real: 50 }) }));
    expect(card.figures.some((f) => f.value.startsWith('0 reps'))).toBe(false);
  });

  it('si algo falla al calcularla, sale una tarjeta mínima en vez de romper el Resumen', () => {
    const imposible = { ...session, blocks: null } as unknown as DailySession;
    expect(buildSessionCard(input({ session: imposible }))).toMatchObject({ title: 'Tu sesión de hoy', action: 'plan', figures: [] });
  });
});
