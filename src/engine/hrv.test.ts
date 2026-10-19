import { describe, it, expect } from 'vitest';
import type { ReadinessCheck } from '../data/athlete/types';
import { computeHrvPart, computeHrvStatus, hrvScore, hrvVsNow, hrvVsOf, HRV_NEEDED, HRV_PROVISIONAL_MIN, restingHrBaseline } from './hrv';
import { getReadinessFactor } from './readiness';
import { computeReadinessScore } from './readinessScore';
import { computeReadinessLearning } from './readinessLearning';

const TODAY = '2026-04-20';
const iso = (offset: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const base = { sleep: 'bien', soreness: 'leve', stress: 'bajo', motivation: 'alta' } as const;
const check = (offset: number, hrv?: number, hr?: number, extra: Partial<ReadinessCheck> = {}): ReadinessCheck => ({
  date: iso(offset),
  ...base,
  ...(hrv !== undefined ? { hrv } : {}),
  ...(hr !== undefined ? { restingHr: hr } : {}),
  ...extra,
});
/** `n` mediciones diarias anteriores a hoy con rMSSD alrededor de `around` (oscila ±`spread`). */
const series = (n: number, around = 64, spread = 6, hr = 55): ReadinessCheck[] =>
  Array.from({ length: n }, (_, i) => check(-(i + 1), around + (i % 2 === 0 ? spread : -spread), hr));

describe('HRV: la nota de 0 a 10 y el pulso', () => {
  it('la nota que enseña HRV4Training es dos veces el logaritmo natural del rMSSD', () => {
    expect(hrvScore(64)).toBe(8.3);
    expect(hrvScore(40)).toBe(7.4);
  });

  it('la media de pulso en reposo son las últimas dos semanas sin contar hoy, con al menos 3 mediciones', () => {
    const log = [check(-1, undefined, 52), check(-2, undefined, 54), check(-3, undefined, 56), check(0, undefined, 90)];
    expect(restingHrBaseline(log, TODAY)).toBe(54);
    expect(restingHrBaseline(log.slice(0, 2), TODAY)).toBeNull();
    expect(restingHrBaseline([check(-30, undefined, 70), check(-31, undefined, 70), check(-32, undefined, 70)], TODAY)).toBeNull();
  });
});

describe('HRV: tu rango normal', () => {
  it('sin ninguna medición no hay estado; con pocas, reúne datos y cuenta cuántas lleva', () => {
    expect(computeHrvStatus([], TODAY).state).toBe('sin-datos');
    const some = computeHrvStatus([...series(5), check(0, 64)], TODAY);
    expect(some).toMatchObject({ state: 'reuniendo', n: 6, needed: HRV_NEEDED, range: null });
    expect(some.today).toMatchObject({ rmssd: 64, score: 8.3, vs: null });
  });

  it('con 14 mediciones previas hay rango (media ± 0,75 desviaciones en logaritmo) y dice dónde cae hoy', () => {
    const log = series(HRV_NEEDED);
    const status = computeHrvStatus([...log, check(0, 64)], TODAY);
    expect(status.state).toBe('listo');
    expect(status.range!.low).toBeLessThan(64);
    expect(status.range!.high).toBeGreaterThan(64);
    expect(status.today!.vs).toBe('normal');
    expect(computeHrvStatus([...log, check(0, 30)], TODAY).today!.vs).toBe('bajo');
    expect(computeHrvStatus([...log, check(0, 130)], TODAY).today!.vs).toBe('alto');
  });

  it('con 6 mediciones previas aún no hay ningún rango (la de hoy no cuenta para calcularlo)', () => {
    const status = computeHrvStatus([...series(HRV_PROVISIONAL_MIN - 1), check(0, 64)], TODAY);
    expect(status).toMatchObject({ state: 'reuniendo', provisional: false, range: null, n: HRV_PROVISIONAL_MIN });
  });

  it('con 7 a 13 mediciones previas hay un rango PROVISIONAL, y con 14 el completo', () => {
    const provisional = computeHrvStatus([...series(HRV_PROVISIONAL_MIN), check(0, 64)], TODAY);
    expect(provisional).toMatchObject({ state: 'listo', provisional: true });
    expect(provisional.range).not.toBeNull();
    expect(provisional.today!.vs).toBe('normal');
    expect(computeHrvStatus([...series(HRV_NEEDED - 1), check(0, 64)], TODAY).provisional).toBe(true);
    expect(computeHrvStatus([...series(HRV_NEEDED), check(0, 64)], TODAY).provisional).toBe(false);
  });

  it('el rango provisional no se guarda en el check-in (no mueve la carga ni el semáforo) pero sí se lee para el taper', () => {
    // 7 mediciones de hace más de una semana + la de hoy (baja): sin media de 7 días, manda la de hoy
    const older = series(14, 64, 12).filter((c) => c.date <= iso(-8));
    const provisional = computeHrvStatus([...older, check(0, 30)], TODAY);
    expect(provisional).toMatchObject({ state: 'listo', provisional: true, week: null });
    expect(hrvVsNow(provisional)).toBe('bajo');
    expect(hrvVsOf(provisional)).toBeUndefined();
    const full = computeHrvStatus([...series(21, 64, 12).filter((c) => c.date <= iso(-8)), check(0, 30)], TODAY);
    expect(full).toMatchObject({ provisional: false, week: null });
    expect(hrvVsOf(full)).toBe('bajo');
  });

  it('la media de 7 días necesita 3 mediciones y se compara con el rango', () => {
    const log = series(40);
    expect(computeHrvStatus([...log, check(0, 64)], TODAY).week!.n).toBe(7);
    const lowWeek = [...log.filter((c) => c.date < iso(-6)), ...[0, -1, -2, -3].map((o) => check(o, 35))];
    const status = computeHrvStatus(lowWeek, TODAY);
    expect(status.week).toMatchObject({ n: 4, vs: 'bajo' });
    expect(hrvVsOf(status)).toBe('bajo');
    const two = computeHrvStatus([...log.filter((c) => c.date < iso(-6)), check(0, 35), check(-1, 35)], TODAY);
    expect(two.week).toBeNull();
    expect(hrvVsOf(two)).toBe('bajo'); // sin media de 7 días, manda la medición de hoy
  });

  it('un rango con mediciones casi idénticas no queda absurdamente estrecho', () => {
    const flat = Array.from({ length: 16 }, (_, i) => check(-(i + 1), 64));
    const { range } = computeHrvStatus([...flat, check(0, 64)], TODAY);
    expect(range!.high - range!.low).toBeGreaterThanOrEqual(2);
    expect(computeHrvStatus([...flat, check(0, 64)], TODAY).today!.vs).toBe('normal');
  });
});

describe('HRV: lo que resta a la preparación y a la carga', () => {
  // Variación de ±12 ms alrededor de 64: un rango de unos 55–74 ms, que una sola medición baja no arrastra por sí sola.
  const log = series(20, 64, 12);

  it('hasta tener rango la HRV no resta nada, pero el pulso sí tiene su propia media', () => {
    const early = computeHrvPart([...series(5, 64, 6, 55), check(0, 20, 64)], TODAY);
    expect(early.hrvPenalty).toBe(0);
    expect(early.hrPenalty).toBe(3);
    expect(early.detail).toContain('Llevas 6 de 7 mediciones');
    expect(computeHrvPart([], TODAY)).toMatchObject({ penalty: 0, detail: '' });
  });

  it('con el rango provisional la HRV resta la mitad y lo dice', () => {
    const prov = series(HRV_PROVISIONAL_MIN, 64, 12);
    const part = computeHrvPart([...prov, check(0, 30)], TODAY);
    expect(part.status.provisional).toBe(true);
    expect(part.hrvPenalty).toBe(2); // 3 de una medición baja suelta, a la mitad (redondeado)
    expect(part.detail).toContain('(provisional)');
    expect(computeHrvPart([...series(HRV_NEEDED, 64, 12), check(0, 30)], TODAY).hrvPenalty).toBe(3);
  });

  it('con rango: dentro no resta; una medición baja suelta resta 3; la semana baja resta 6 y 2 más si hoy también', () => {
    expect(computeHrvPart([...log, check(0, 64)], TODAY).penalty).toBe(0);
    expect(computeHrvPart([...log, check(0, 30)], TODAY).hrvPenalty).toBe(3);
    const lowWeek = [...log.filter((c) => c.date < iso(-5)), ...[0, -1, -2, -3, -4].map((o) => check(o, 35, 55))];
    expect(computeHrvPart(lowWeek, TODAY).hrvPenalty).toBe(8);
    const lowWeekHighToday = [...log.filter((c) => c.date < iso(-5)), check(0, 64, 55), ...[-1, -2, -3, -4].map((o) => check(o, 35, 55))];
    expect(computeHrvPart(lowWeekHighToday, TODAY).hrvPenalty).toBe(6);
  });

  it('un HRV alto nunca resta, y el pulso resta 2 (+5 ppm) o 3 (+8 ppm) sobre tu media', () => {
    expect(computeHrvPart([...log, check(0, 130)], TODAY).penalty).toBe(0);
    expect(computeHrvPart([...log, check(0, 64, 60)], TODAY).hrPenalty).toBe(2);
    expect(computeHrvPart([...log, check(0, 64, 63)], TODAY).hrPenalty).toBe(3);
    expect(computeHrvPart([...log, check(0, 64, 57)], TODAY).hrPenalty).toBe(0);
  });

  it('entra en la nota de preparación: restada tal cual', () => {
    const sane = [...log, check(0, 64, 55)];
    const low = [...log, check(0, 30, 55)];
    const input = (readinessLog: ReadinessCheck[]) => ({ readinessLog, history: [], setFeedbackLog: undefined, painFlags: undefined, today: new Date(`${TODAY}T12:00:00`) });
    // los checks base se parecen entre sí; con feel idéntico la diferencia es solo la HRV
    const a = computeReadinessScore(input(sane));
    const b = computeReadinessScore(input(low));
    expect(a.hrv.penalty).toBe(0);
    expect(b.hrv.penalty).toBe(3);
    expect(a.total! - b.total!).toBe(3);
  });

  it('una HRV por debajo de tu rango pesa como una señal más en contra de la carga', () => {
    const none: ReadinessCheck = { date: TODAY, sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'baja' }; // -1
    expect(getReadinessFactor(none).factor).toBe(1);
    const low = getReadinessFactor({ ...none, hrvVs: 'bajo' });
    expect(low.factor).toBeLessThan(1);
    expect(low.isLow).toBe(true);
    expect(getReadinessFactor({ ...none, hrvVs: 'normal' }).factor).toBe(1);
    expect(getReadinessFactor({ ...none, hrvVs: 'alto' }).factor).toBe(1);
  });
});

describe('HRV: lo que aprende el coach', () => {
  it('cruza los días con HRV baja con cómo te salieron las sesiones', () => {
    const log: ReadinessCheck[] = [];
    const history = [];
    for (let i = 0; i < 16; i++) {
      const low = i % 2 === 0;
      const c = check(-i - 1, 64, 55, { hrvVs: low ? 'bajo' : 'normal' });
      log.push(c);
      history.push({ date: c.date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx' as const, rpe: low ? 8.5 : 7, durationMin: 60 });
    }
    const hrv = computeReadinessLearning(log, history).insights.find((i) => i.key === 'hrv');
    expect(hrv).toMatchObject({ label: 'HRV', condition: 'tu HRV cae por debajo de tu rango', nBad: 8, nOk: 8, delta: 1.5 });
  });
});
