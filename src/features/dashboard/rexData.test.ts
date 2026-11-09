import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult, SessionHistoryEntry } from '../../data/athlete/types';
import { makeProfile } from '../../engine/__fixtures';
import { parseAsk } from './rexAsk';
import { dataAnswer, whyAnswer, type DataCtx } from './rexData';
import { markLiftByKey } from './rexMarks';

const FRIDAY = 5;
const TODAY = '2026-11-09';
const lift = (k: string) => markLiftByKey(k)!;

const profile = makeProfile({
  prs: { backSquat: 140, frontSquat: 110, benchPress: 90, deadlift: 180, strictPress: 55, clean: 100, snatch: 75, cleanAndJerk: 100 },
  workLog: [
    { date: '2026-11-02', movementId: 'snatch', block: 'oly', setNumber: 1, kg: 60, reps: 2 },
    { date: '2026-11-06', movementId: 'snatch', block: 'oly', setNumber: 1, kg: 62.5, reps: 2 },
    { date: '2026-11-06', movementId: 'snatch', block: 'oly', setNumber: 2, kg: 65, reps: 1 },
    { date: '2026-11-06', movementId: 'snatch', block: 'oly', setNumber: 3, kg: 70, reps: 1, quality: 'fallada' },
  ],
  prLog: [
    { date: '2026-09-03', key: 'backSquat', kg: 125 },
    { date: '2026-10-03', key: 'backSquat', kg: 140 },
  ],
  bodyweightLog: [
    { date: '2026-11-01', kg: 83 },
    { date: '2026-11-07', kg: 82.4 },
  ],
});

const block = (b: Partial<SessionBlockResult> & Pick<SessionBlockResult, 'block'>): SessionBlockResult => ({ movementId: 'back-squat', ...b });
const session: DailySession = {
  date: TODAY,
  mesocycleWeek: 2,
  isRestDay: false,
  energySystem: 'umbral',
  coachReasons: ['Semana de intensificación: sube la carga un poco. Segunda frase que no sale.', 'Dormiste poco: bajo el volumen del accesorio.'],
  blocks: [
    block({ block: 'warmup', movementId: 'jumping-jacks' }),
    block({ block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 112.5, notes: 'Peso de trabajo al 80 % de tu 1RM. Sin más.' }),
    block({ block: 'wod', movementId: 'thruster', format: 'AMRAP 12 min', title: 'Tormenta' }),
    block({ block: 'accessory', movementId: 'pull-up', sets: 3 }),
  ],
};

const ctx = (over: Partial<DataCtx> = {}): DataCtx => ({ profile, history: [], session, todayIso: TODAY, marksTarget: 'marcas', planTarget: 'planificacion', ...over });

const entry = (date: string, durationMin = 60): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: ['snatch'], rpe: 7, rxOrScaled: 'rx', durationMin });

describe('Rex contesta con tus datos', () => {
  it('el último levantamiento: la fecha, las series y la más pesada (sin contar las falladas)', () => {
    const a = dataAnswer({ what: 'ultimo-levantamiento', lift: lift('snatch') }, ctx());
    expect(a.text).toBe('La última vez fue el 6 nov (hace 3 días): 2 series, la más pesada 65 kg × 1.');
    expect(a.actions[0]).toMatchObject({ label: 'Ver la gráfica', ask: 'ver la grafica de Snatch' });
  });

  it('sin series apuntadas pero con sesión, lo dice; sin nada, también', () => {
    const noLog = makeProfile({ ...profile, workLog: [] });
    expect(dataAnswer({ what: 'ultimo-levantamiento', lift: lift('snatch') }, ctx({ profile: noLog, history: [entry('2026-11-05')] })).text).toMatch(/5 nov.*no hay pesos apuntados/);
    expect(dataAnswer({ what: 'ultimo-levantamiento', lift: lift('snatch') }, ctx({ profile: noLog })).tone).toBe('mid');
  });

  it('la última marca: cuándo se apuntó', () => {
    expect(dataAnswer({ what: 'ultimo-test', lift: lift('backSquat') }, ctx()).text).toBe('Tu marca actual (140 kg) se apuntó el 3 oct (hace 37 días).');
    expect(dataAnswer({ what: 'ultimo-test', lift: lift('pushPress') }, ctx()).tone).toBe('mid');
  });

  it('el peso actual y cómo cambió', () => {
    expect(dataAnswer({ what: 'peso-actual' }, ctx()).lead).toBe('82,4 kg.');
    expect(dataAnswer({ what: 'peso-actual' }, ctx()).text).toMatch(/hace 2 días \(−0,6 kg/);
  });

  it('cuánto dura hoy, o por qué no hay sesión', () => {
    const a = dataAnswer({ what: 'duracion' }, ctx());
    expect(a.lead).toMatch(/^Unos \d+ min\.$/);
    expect(a.text).toMatch(/fuerza, wod, accesorio/);
    expect(dataAnswer({ what: 'duracion' }, ctx({ session: { ...session, isRestDay: true } })).lead).toBe('Hoy no hay sesión.');
    expect(dataAnswer({ what: 'duracion' }, ctx({ history: [entry(TODAY, 55)] })).text).toBe('Tardaste 55 min.');
  });

  it('las sesiones de la semana y del mes', () => {
    const a = dataAnswer({ what: 'sesiones' }, ctx({ history: [entry('2026-11-03'), entry('2026-11-05'), entry('2026-10-28')] }));
    expect(a.text).toMatch(/Esta semana \d de \d previstas; este mes 2 sesiones registradas/);
  });

  it('la racha sin hoy no la corta', () => {
    const a = dataAnswer({ what: 'racha' }, ctx({ history: [] }));
    expect(a.lead).toBe('Tu racha.');
    expect(a.text).toMatch(/racha|Llevas/);
  });
});

describe('Rex explica la sesión', () => {
  it('por qué hoy así: los motivos del coach, solo la primera frase de cada uno', () => {
    const a = whyAnswer('sesion', ctx());
    expect(a.text).toBe('Semana de intensificación: sube la carga un poco. Dormiste poco: bajo el volumen del accesorio.');
  });

  it('por qué ese peso: el % de tu marca y lo que anotó el coach', () => {
    const a = whyAnswer('peso', ctx());
    expect(a.text).toBe('Back Squat: 112,5 kg es el 80 % de tu marca de Back Squat (140 kg). Peso de trabajo al 80 % de tu 1RM.');
  });

  it('por qué ese WOD: el nombre y el sistema energético', () => {
    expect(whyAnswer('wod', ctx()).text).toBe('«Tormenta». Trabaja umbral.');
    const withReason = { ...session, coachReasons: ['Hoy: umbral — duración media a ritmo cómodo-duro. Otra frase.', ...(session.coachReasons ?? [])] };
    expect(whyAnswer('wod', ctx({ session: withReason })).text).toBe('«Tormenta». Hoy: umbral — duración media a ritmo cómodo-duro.');
    const noWod: DailySession = { ...session, blocks: session.blocks.filter((b) => b.block !== 'wod') };
    expect(whyAnswer('wod', ctx({ session: noWod })).lead).toBe('Hoy no hay WOD.');
  });

  it('en un día de descanso o ya entrenado no inventa motivos', () => {
    expect(whyAnswer('sesion', ctx({ session: { ...session, isRestDay: true } })).lead).toBe('Hoy no hay sesión.');
    expect(whyAnswer('peso', ctx({ history: [entry(TODAY)] })).lead).toBe('Hoy ya entrenaste.');
  });
});

describe('leer estas preguntas', () => {
  it('datos propios', () => {
    expect(parseAsk('¿cuál fue mi último snatch?', FRIDAY)).toMatchObject({ kind: 'dato', question: { what: 'ultimo-levantamiento' } });
    expect(parseAsk('cuándo fue la última vez que hice sentadilla', FRIDAY)).toMatchObject({ kind: 'dato', question: { what: 'ultimo-levantamiento' } });
    expect(parseAsk('cuándo fue mi último test de sentadilla', FRIDAY)).toMatchObject({ kind: 'dato', question: { what: 'ultimo-test' } });
    expect(parseAsk('mi racha', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'racha' } });
    expect(parseAsk('cuántos días llevo seguidos', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'racha' } });
    expect(parseAsk('cuántas sesiones llevo este mes', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'sesiones' } });
    expect(parseAsk('¿cuánto dura la sesión de hoy?', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'duracion' } });
    expect(parseAsk('cuánto peso', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'peso-actual' } });
  });

  it('por qué', () => {
    expect(parseAsk('¿por qué este peso?', FRIDAY)).toEqual({ kind: 'por-que', about: 'peso' });
    expect(parseAsk('por qué 112 kg', FRIDAY)).toEqual({ kind: 'por-que', about: 'peso' });
    expect(parseAsk('¿Por qué este WOD?', FRIDAY)).toEqual({ kind: 'por-que', about: 'wod' });
    expect(parseAsk('por qué hoy me toca esto', FRIDAY)).toEqual({ kind: 'por-que', about: 'sesion' });
    expect(parseAsk('por qué hoy descanso', FRIDAY)).toEqual({ kind: 'por-que', about: 'sesion' });
  });

  it('lo de antes sigue igual', () => {
    expect(parseAsk('apunta 82,4 kg', FRIDAY)).toEqual({ kind: 'peso', kg: 82.4 });
    expect(parseAsk('apunta mi peso', FRIDAY)).toEqual({ kind: 'modulo', target: 'peso' });
    expect(parseAsk('cuánto levanto en snatch', FRIDAY)).toMatchObject({ kind: 'marca-ver', open: false });
    expect(parseAsk('mi constancia', FRIDAY)).toEqual({ kind: 'modulo', target: 'constancia' });
    expect(parseAsk('qué toca mañana', FRIDAY).kind).toBe('dia');
  });
});
