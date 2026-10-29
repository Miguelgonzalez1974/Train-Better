import { describe, expect, it } from 'vitest';
import { dataDays, effortFit, readinessBand, trendBins, trendSentence, type TrendPoint } from './weekTrend';

const T = { low: 45, high: 65 };
const day = (n: number, strain: number | null, readiness: number | null, target: TrendPoint['target'] = T): TrendPoint => ({
  iso: `2026-10-${String(20 + n).padStart(2, '0')}`,
  strain,
  readiness,
  target,
  planned: null,
});

describe('weekTrend', () => {
  it('readinessBand usa los mismos cortes que el color de la preparación', () => {
    expect(readinessBand(65)).toBe('good');
    expect(readinessBand(64)).toBe('mid');
    expect(readinessBand(41)).toBe('mid');
    expect(readinessBand(40)).toBe('low');
  });

  it('effortFit separa descanso, por debajo, dentro y por encima', () => {
    expect(effortFit({ strain: 0, target: T })).toBe('rest');
    expect(effortFit({ strain: 30, target: T })).toBe('below');
    expect(effortFit({ strain: 55, target: T })).toBe('within');
    expect(effortFit({ strain: 71, target: T })).toBe('over');
    expect(effortFit({ strain: null, target: T })).toBe('unknown');
    expect(effortFit({ strain: 50, target: null })).toBe('unknown');
  });

  it('trendBins cuenta los días de cada tramo y no cuenta los descansos', () => {
    const pts = [day(1, 30, 30), day(2, 55, 50), day(3, 60, 70), day(4, 71, 90), day(5, 0, 80), day(6, null, null)];
    const bins = trendBins(pts);
    expect(bins.effort).toEqual([1, 2, 1]);
    expect(bins.readiness).toEqual([1, 1, 3]);
  });

  it('con menos de 4 días con datos no hay frase', () => {
    expect(dataDays([day(1, 50, 60), day(2, null, null), day(3, 0, null)])).toBe(1);
    expect(trendSentence([day(1, 50, 60), day(2, 55, 62), day(3, null, null)])).toBeNull();
  });

  it('avisa del día que te pasaste con la preparación justa', () => {
    const pts = [day(1, 55, 78), day(2, 60, 70), day(3, 0, 85), day(4, 71, 45), day(5, 58, 61)];
    expect(trendSentence(pts)).toContain('sábado');
    expect(trendSentence(pts)).toContain('45');
  });

  it('dos días pasados con poca preparación piden un día suave', () => {
    const pts = [day(1, 70, 40), day(2, 72, 50), day(3, 50, 60), day(4, 55, 62)];
    expect(trendSentence(pts)).toMatch(/2 días/);
  });

  it('dentro del objetivo y con buena preparación, lo celebra', () => {
    const pts = [day(1, 55, 78), day(2, 60, 70), day(3, 0, 85), day(4, 58, 72)];
    expect(trendSentence(pts)).toContain('así se gana forma');
  });

  it('hoy no se cuenta por debajo mientras el día no ha terminado', () => {
    // Una semana como la real: cuatro descansos, dentro dos días y hoy con poco esfuerzo registrado.
    const pts = [day(1, 0, 63), day(2, 0, 73), day(3, 0, 69), day(4, 0, 72), day(5, 55, 75), day(6, 60, 76), day(7, 21, 79)];
    expect(trendBins(pts).effort).toEqual([1, 2, 0]);
    expect(trendBins(pts, pts[6].iso).effort).toEqual([0, 2, 0]);
    expect(trendSentence(pts, pts[6].iso)).toContain('así se gana forma');
  });

  it('si solo hay hoy con poco esfuerzo, no juzga el día', () => {
    const pts = [day(1, 0, 63), day(2, 0, 73), day(3, 0, 69), day(4, 0, 72), day(7, 21, 79)];
    expect(trendSentence(pts, pts[4].iso)).toContain('no ha terminado');
  });

  it('quedarse por debajo la mayoría de los días con buena preparación invita a apretar', () => {
    const pts = [day(1, 20, 80), day(2, 25, 75), day(3, 55, 70), day(4, 0, 85)];
    expect(trendSentence(pts)).toContain('margen para apretar');
  });

  it('un solo día por debajo entre varios dentro se nombra', () => {
    const pts = [day(1, 55, 70), day(2, 60, 72), day(3, 58, 68), day(4, 20, 80)];
    const s = trendSentence(pts)!;
    expect(s).toContain('salvo el sábado');
    expect(s).toContain('margen');
  });

  it('pasarse con buena preparación no es una alarma', () => {
    const pts = [day(1, 70, 80), day(2, 72, 75), day(3, 50, 70), day(4, 55, 72)];
    expect(trendSentence(pts)).toContain('siempre llegando bien');
  });
});
