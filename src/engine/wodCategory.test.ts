import { describe, expect, it } from 'vitest';
import type { PersonalRecords, SessionBlockResult } from '../data/athlete/types';
import { classifyWod, classifyWodBlocks, HEAVY_FROM_1RM, LONG_MIN, SPEED_MAX_MIN, WOD_CATEGORY_LABEL } from './wodCategory';

const prs: Partial<PersonalRecords> = { backSquat: 140, frontSquat: 120, benchPress: 100, deadlift: 180, strictPress: 70, clean: 110, snatch: 85, cleanAndJerk: 105 };
const bench = (id: string): SessionBlockResult => ({ block: 'wod', movementId: `benchmark:${id}` });
/** Un WOD generado: una entrada por movimiento, con su formato y carga. */
const gen = (format: string, lines: { id: string; kg?: number; reps?: string }[], extra: Partial<SessionBlockResult> = {}): SessionBlockResult[] =>
  lines.map((l) => ({ block: 'wod', movementId: l.id, format, reps: l.reps ?? '10', ...(l.kg ? { loadKg: l.kg } : {}), ...extra }));

describe('categorías de un WOD de referencia', () => {
  it('Fran es de velocidad, Cindy larga y Annie de peso corporal', () => {
    expect(classifyWodBlocks([bench('fran')], { prs }).category).toBe('velocidad');
    expect(classifyWodBlocks([bench('cindy')], { prs }).category).toBe('largo');
    expect(classifyWodBlocks([bench('annie')], { prs }).category).toBe('peso-corporal');
  });

  it('Diane (peso muerto al 57 % de tu 1RM) es pesado, con el porqué', () => {
    const v = classifyWodBlocks([bench('diane')], { prs });
    expect(v.category).toBe('pesado');
    expect(v.reason).toContain('57 %');
    expect(v.reason).toContain('1RM');
  });

  it('lo pesado es relativo a ti: con un 1RM mucho mayor, el mismo WOD pasa a ligero', () => {
    const strong = { ...prs, deadlift: 260 };
    expect(classifyWodBlocks([bench('diane')], { prs: strong }).category).toBe('ligero');
  });

  it('sin tu marca de la barra no se puede medir si es pesado: no cuenta, y lo dice', () => {
    const v = classifyWodBlocks([bench('diane')], { prs: {} });
    expect(v.category).toBeNull();
    expect(v.reason).toContain('marca');
  });

  it('Karen (balón) es ligera: lleva peso de implementos, no barra', () => {
    expect(classifyWodBlocks([bench('karen')], { prs }).category).toBe('ligero');
  });
});

describe('categorías de un WOD generado', () => {
  it('un AMRAP de más de 20 minutos con barra es largo; el mismo en 12 minutos, por su carga', () => {
    const lines = [{ id: 'deadlift', kg: 100 }, { id: 'burpee' }];
    expect(classifyWodBlocks(gen('AMRAP 25 min', lines), { prs }).category).toBe('largo');
    expect(classifyWodBlocks(gen('AMRAP 12 min', lines), { prs }).category).toBe('pesado');
  });

  it('casi todo cardio: resistencia; si es muy corto, velocidad', () => {
    const cardio = [{ id: 'row', reps: '500m' }, { id: 'run', reps: '400m' }, { id: 'air-bike', reps: '15 cal' }];
    expect(classifyWodBlocks(gen('AMRAP 15 min', cardio), { prs }).category).toBe('resistencia');
    expect(classifyWodBlocks(gen('AMRAP 4 min', cardio), { prs }).category).toBe('velocidad');
    // El cardio muy largo es resistencia, no largo.
    expect(classifyWodBlocks(gen('AMRAP 30 min', cardio), { prs }).category).toBe('resistencia');
  });

  it('muy corto es velocidad, salvo una barra muy pesada para ti', () => {
    expect(classifyWodBlocks(gen('AMRAP 4 min', [{ id: 'deadlift', kg: 100 }, { id: 'burpee' }]), { prs }).category).toBe('velocidad');
    expect(classifyWodBlocks(gen('AMRAP 4 min', [{ id: 'deadlift', kg: 140 }, { id: 'burpee' }]), { prs }).category).toBe('pesado');
  });

  it('sin carga externa, de 5 a 20 minutos: peso corporal', () => {
    expect(classifyWodBlocks(gen('AMRAP 12 min', [{ id: 'kipping-pull-up' }, { id: 'push-up' }, { id: 'air-squat' }]), { prs }).category).toBe('peso-corporal');
  });

  it('el umbral de pesado es una fracción de tu 1RM', () => {
    const justUnder = Math.floor(180 * HEAVY_FROM_1RM) - 2;
    const justOver = Math.ceil(180 * HEAVY_FROM_1RM) + 2;
    expect(classifyWodBlocks(gen('AMRAP 12 min', [{ id: 'deadlift', kg: justUnder }, { id: 'burpee' }]), { prs }).category).toBe('ligero');
    expect(classifyWodBlocks(gen('AMRAP 12 min', [{ id: 'deadlift', kg: justOver }, { id: 'burpee' }]), { prs }).category).toBe('pesado');
    expect(SPEED_MAX_MIN).toBeLessThan(LONG_MIN);
  });
});

describe('lo que no cuenta', () => {
  it('la recuperación activa y un día sin WOD no dicen nada (silencio)', () => {
    const rec = gen('RPE 2 · 45 min total', [{ id: 'air-bike', reps: '45 min total' }, { id: 'row', reps: '500m' }]);
    const v = classifyWodBlocks(rec, { prs });
    expect(v.category).toBeNull();
    expect(v.silent).toBe(true);
    expect(classifyWodBlocks([], { prs }).silent).toBe(true);
  });

  it('un WOD cuya duración no se sabe no se clasifica, y lo dice (sin silencio)', () => {
    const v = classifyWodBlocks(gen('For Time', [{ id: 'thruster', kg: 40 }, { id: 'burpee' }]), { prs });
    expect(v.category).toBeNull();
    expect(v.silent).toBeUndefined();
    expect(v.reason).toContain('cuánto dura');
  });

  it('classifyWod lee la parte pedida de un día de doble WOD', () => {
    const part1 = gen('AMRAP 4 min', [{ id: 'burpee' }, { id: 'air-squat' }], { wodPart: 1 });
    const part2 = gen('AMRAP 25 min', [{ id: 'kipping-pull-up' }, { id: 'push-up' }], { wodPart: 2 });
    const session = { blocks: [...part1, ...part2] };
    expect(classifyWod(session, 1, { prs }).category).toBe('velocidad');
    expect(classifyWod(session, 2, { prs }).category).toBe('largo');
  });

  it('todas las categorías tienen nombre', () => {
    expect(Object.values(WOD_CATEGORY_LABEL)).toHaveLength(6);
  });
});
