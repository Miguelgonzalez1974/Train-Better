import { describe, expect, it } from 'vitest';
import { trendSummary } from './trendSummary';
import type { TrendPoint } from './weekTrend';

const T = { low: 45, high: 65 };
const iso = (offset: number) => {
  const d = new Date('2026-10-01T12:00:00');
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pt = (offset: number, strain: number | null, readiness: number | null): TrendPoint => ({ iso: iso(offset), strain, readiness, target: T, planned: null });
const text = (segs: (string | { b: string } | { delta: string; t: string })[]) => segs.map((s) => (typeof s === 'string' ? s : 'b' in s ? s.b : s.t)).join('');

// Una semana: 4 sesiones (3 dentro, 1 por encima), 3 descansos.
const week = [pt(0, 55, 78), pt(1, 60, 70), pt(2, 0, 85), pt(3, 71, 45), pt(4, 58, 61), pt(5, 0, 80), pt(6, 0, 82)];
const today = iso(6);

describe('trendSummary', () => {
  it('cuenta las sesiones dentro del objetivo y las que se pasan', () => {
    const s = trendSummary(week, [], { range: 7, todayIso: today });
    expect(text(s.rows[0].segs)).toBe('3 de 4 sesiones dentro de tu objetivo, 1 por encima.');
  });

  it('compara la preparación con el periodo anterior', () => {
    const prev = [pt(-7, 50, 60), pt(-6, 55, 62), pt(-5, 0, 64), pt(-4, 58, 60)];
    const s = trendSummary(week, prev, { range: 7, todayIso: today });
    const row = s.rows[1];
    expect(row.label).toBe('Preparación');
    expect(text(row.segs)).toMatch(/Media 72 % \+10 vs los 7 días anteriores/);
  });

  it('sin periodo anterior con datos no compara', () => {
    const s = trendSummary(week, [pt(-7, null, null)], { range: 7, todayIso: today });
    expect(text(s.rows[1].segs)).toBe('Media 72 %');
  });

  it('en 7 días la tercera línea dice cómo llegas ahora', () => {
    const s = trendSummary(week, [], { range: 7, todayIso: today });
    expect(s.rows[2].label).toBe('Ahora');
    expect(text(s.rows[2].segs)).toContain('Llegas bien');
  });

  it('con la competición cerca, el titular y la línea de ahora hablan de llegar fresco', () => {
    const s = trendSummary(week, [], { range: 7, todayIso: today, competitionDays: 8 });
    expect(s.headline).toContain('A 8 días de competir');
    expect(s.headline).toContain('llegar fresco');
    expect(text(s.rows[2].segs)).toContain('afinado');
  });

  it('en un día pasado la tercera línea se llama "Ese día"', () => {
    const s = trendSummary(week, [], { range: 7, todayIso: iso(20) });
    expect(s.rows[2].label).toBe('Ese día');
  });

  it('el esfuerzo medio y los descansos van en "ver más"', () => {
    const s = trendSummary(week, [], { range: 7, todayIso: today });
    expect(s.more.map((r) => r.label)).toEqual(['Esfuerzo', 'Descanso']);
    expect(text(s.more[1].segs)).toBe('3 días sin sesión.');
  });

  it('en 14 días avisa si te pasas más hacia el final', () => {
    const pts = Array.from({ length: 14 }, (_, i) => pt(i, i >= 10 ? 72 : 55, 70));
    const s = trendSummary(pts, [], { range: 14, todayIso: iso(13) });
    expect(s.rows[2].label).toBe('Tendencia');
    expect(text(s.rows[2].segs)).toContain('Te pasas más hacia el final');
  });

  it('en 14 días detecta la preparación que sube', () => {
    const pts = Array.from({ length: 14 }, (_, i) => pt(i, 55, i < 7 ? 55 : 75));
    const s = trendSummary(pts, [], { range: 14, todayIso: iso(13) });
    expect(text(s.rows[2].segs)).toContain('sube hacia el final');
  });

  it('con 30 días y pocos datos dice que falta muestra', () => {
    const pts = Array.from({ length: 30 }, (_, i) => (i < 18 ? pt(i, null, null) : pt(i, 55, 70)));
    const s = trendSummary(pts, [], { range: 30, todayIso: iso(29) });
    expect(s.headline).toContain('poca muestra');
    expect(s.rows).toHaveLength(2);
    expect(s.more).toHaveLength(0);
  });

  it('en 30 días encuentra el día de la semana en que llegas peor si se repite', () => {
    // 28 días desde el 2026-10-01 (jueves): los jueves la preparación es baja.
    const pts = Array.from({ length: 28 }, (_, i) => pt(i, 55, new Date(`${iso(i)}T12:00:00`).getDay() === 4 ? 40 : 75));
    const s = trendSummary(pts, [], { range: 30, todayIso: iso(27) });
    expect(s.rows[2].label).toBe('Patrón');
    expect(text(s.rows[2].segs)).toContain('Los jueves');
  });

  it('en 30 días sin repetición no inventa un patrón', () => {
    const pts = Array.from({ length: 28 }, (_, i) => pt(i, 55, 70 + (i % 3)));
    const s = trendSummary(pts, [], { range: 30, todayIso: iso(27) });
    expect(text(s.rows[2].segs)).toContain('Sin un patrón claro');
  });
});
