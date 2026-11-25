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
  it('peso principal con su % , el WOD con su límite y el esfuerzo previsto', () => {
    const card = buildSessionCard(input());
    expect(card.kind).toBe('pending');
    expect(card.action).toBe('plan');
    expect(card.title).toMatch(/^Hoy: .*Squat.* y WOD$/);
    expect(card.figures.map((f) => f.value)).toEqual(['100 kg', 'AMRAP 12', '~62']);
    expect(card.figures[0].label).toMatch(/5×5 · 80 %$/);
    expect(card.figures[1].label).toBe('WOD · 12 min');
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
    expect(card.figures[card.figures.length - 1]).toMatchObject({ value: '~80', labelTone: 'over' });
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
    expect(card.figures.map((f) => f.value)).toEqual(['102,5 kg', '7+12', '86']);
    expect(card.figures[0].label).toMatch(/récord · 82 %$/);
    expect(card.figures[1].label).toBe('WOD Rx');
    expect(card.figures[2]).toMatchObject({ tone: 'effort', label: 'te pasas +21', labelTone: 'over' });
    expect(card.line).toMatchObject({ icon: 'up', text: '+5 kg frente a la última vez', spark: [97.5, 102.5] });
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

describe('datos incompletos', () => {
  it('un registro antiguo sin movimientos o una serie sin ejercicio no rompen la tarjeta', () => {
    const rotos = [{ date: '2026-01-01' }] as unknown as SessionHistoryEntry[];
    expect(buildSessionCard(input({ history: rotos, session: { ...session, blocks: [{ block: 'wod', movementId: 'benchmark:fran', format: 'forTime' }] } })).kind).toBe('pending');
    const sinNombre = [{ date: TODAY, kg: 80, block: 'strength' }] as unknown as WorkSetEntry[];
    expect(buildSessionCard(input({ session: null, entry: entry(), strain: strain({ real: 50 }), workLog: sinNombre })).kind).toBe('done');
    expect(buildSessionCard(input({ session: null, entry: { date: TODAY } as unknown as SessionHistoryEntry })).meta).toBeUndefined();
  });

  it('un WOD sin límite no corta su nombre en la cifra grande', () => {
    const libre = { ...session, blocks: [{ block: 'wod', movementId: 'burpee', title: 'Un nombre larguísimo de WOD', format: 'Por calidad' }] } as unknown as DailySession;
    expect(buildSessionCard(input({ session: libre })).figures[0]).toEqual({ value: 'WOD', label: 'Por calidad' });
  });

  it('un resultado sin rellenar («0 reps») no sale como marca', () => {
    const card = buildSessionCard(input({ session: null, entry: entry({ wodResult: { scoreType: 'reps', value: '0 reps' } }), strain: strain({ real: 50 }) }));
    expect(card.figures.map((f) => f.value)).not.toContain('0 reps');
  });

  it('si algo falla al calcularla, sale una tarjeta mínima en vez de romper el Resumen', () => {
    const imposible = { ...session, blocks: null } as unknown as DailySession;
    expect(buildSessionCard(input({ session: imposible }))).toMatchObject({ title: 'Tu sesión de hoy', action: 'plan', figures: [] });
  });
});
