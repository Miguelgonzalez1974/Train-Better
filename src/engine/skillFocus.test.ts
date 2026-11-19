import { describe, expect, it } from 'vitest';
import { getMovementById } from '../data/movements';
import { HANDSTAND_WALK_LADDER, MU_LADDERS, SKILL_WAVE_WEEKS } from '../data/movements/skillFocusLadders';
import { buildSkillFocusEntries, skillOfSlot, skillPosition, skillWeekSplit } from './skillFocus';

const never = () => false;

describe('foco de skill: handstand walk y muscle-up', () => {
  it('todos los pasos de las escaleras son movimientos reales y cada ola tiene 4 semanas', () => {
    const all = [...HANDSTAND_WALK_LADDER, ...MU_LADDERS.bar, ...MU_LADDERS.ring];
    for (const step of all) {
      expect(getMovementById(step.movementId), step.movementId).toBeDefined();
      expect(step.wave).toHaveLength(SKILL_WAVE_WEEKS);
    }
  });

  it('una semana 2 de muscle-up y 1 de handstand walk, y la siguiente al revés', () => {
    // Semana del 23 nov 2026 (lunes) = A; la del 30 nov = B; la del 7 dic = A otra vez.
    expect([0, 1, 2].map((s) => skillOfSlot('2026-11-23', s))).toEqual(['mu', 'hsw', 'mu']);
    expect([0, 1, 2].map((s) => skillOfSlot('2026-11-30', s))).toEqual(['hsw', 'mu', 'hsw']);
    expect([0, 1, 2].map((s) => skillOfSlot('2026-12-07', s))).toEqual(['mu', 'hsw', 'mu']);
    expect(skillWeekSplit('2026-11-26')).toEqual({ mu: 2, hsw: 1 });
    expect(skillWeekSplit('2026-12-03')).toEqual({ mu: 1, hsw: 2 });
  });

  it('el día de la semana no cambia la semana: domingo y lunes son de semanas distintas', () => {
    expect(skillOfSlot('2026-11-29', 0)).toBe('mu'); // domingo: todavía la semana A que empezó el lunes 23
    expect(skillOfSlot('2026-11-30', 0)).toBe('hsw'); // lunes: empieza la B
  });

  it('antes de empezar, y sin nada guardado, cada habilidad está en su primer paso y primera semana', () => {
    expect(skillPosition(undefined, 'mu', '2026-11-19')).toMatchObject({ stepIndex: 0, waveWeek: 0 });
    expect(skillPosition(undefined, 'hsw', '2026-11-23')).toMatchObject({ stepIndex: 0, waveWeek: 0 });
  });

  it('cada 4 semanas sube de paso y la 4ª semana de cada paso es el test', () => {
    expect(skillPosition(undefined, 'hsw', '2026-12-14')).toMatchObject({ stepIndex: 0, waveWeek: 3 });
    expect(skillPosition(undefined, 'hsw', '2026-12-21')).toMatchObject({ stepIndex: 1, waveWeek: 0 });
    expect(skillPosition(undefined, 'hsw', '2026-12-21').nextStepFrom).toBe('2027-01-18');
  });

  it('el paso guardado y la fecha desde la que cuenta mandan; en el último paso la ola se repite', () => {
    const settings = { muKind: 'ring' as const, mu: { step: 3, since: '2026-12-01' } };
    expect(skillPosition(settings, 'mu', '2026-12-01')).toMatchObject({ stepIndex: 3, stepCount: 5, waveWeek: 0 });
    expect(skillPosition(settings, 'mu', '2026-12-29')).toMatchObject({ stepIndex: 4, waveWeek: 0 });
    const top = skillPosition(settings, 'mu', '2027-02-02');
    expect(top).toMatchObject({ stepIndex: 4, waveWeek: 1, nextStepFrom: null });
  });

  it('el bloque lleva el paso de hoy con su ola y, si hay paso anterior, un calentamiento técnico ligero antes', () => {
    const settings = { mu: { step: 2, since: '2026-11-23' } };
    const entries = buildSkillFocusEntries(settings, '2026-11-24', 0, never)!;
    expect(entries.map((e) => e.movementId)).toEqual(['muscle-up-transition-drill', 'banded-muscle-up']);
    expect(entries[1]).toMatchObject({ block: 'skill', sets: 5, reps: '2' });
    expect(entries[1].notes).toContain('paso 3 de 4');
    expect(entries[1].notes).toContain('semana 1 de 4');
    expect(entries[1].notes).toContain('2 de muscle-up y 1 de handstand walk');
  });

  it('la semana siguiente sube la exigencia dentro del mismo paso', () => {
    const settings = { mu: { step: 2, since: '2026-11-23' } };
    const w1 = buildSkillFocusEntries(settings, '2026-11-24', 0, never)!.slice(-1)[0];
    const w2 = buildSkillFocusEntries(settings, '2026-12-08', 0, never)!.slice(-1)[0];
    expect(w1.reps).toBe('2');
    expect(w2.reps).toBe('3'); // el 8 dic llevan 2 semanas de ola: 3ª semana, 6 x 3
  });

  it('la semana de test avisa de qué hacer si se clava o no', () => {
    const settings = { hsw: { step: 1, since: '2026-11-23' } };
    // 15 dic: llevan 3 semanas desde el inicio → 4ª semana de la ola; semana B, hueco 0 = handstand walk.
    const test = buildSkillFocusEntries(settings, '2026-12-15', 0, never)!.slice(-1)[0];
    expect(test.movementId).toBe('handstand-hold');
    expect(test.notes).toContain('Semana de test del paso');
  });

  it('con una molestia en el patrón de hoy cae a la otra habilidad; si no puede ninguna, null', () => {
    const noMuscleUp = (id: string) => id.includes('muscle-up') || id === 'chest-to-bar-pull-up' || id === 'muscle-up-transition-drill';
    const entries = buildSkillFocusEntries(undefined, '2026-11-23', 0, noMuscleUp)!; // hoy toca muscle-up
    expect(entries.slice(-1)[0].movementId).toBe('wall-walk');
    expect(buildSkillFocusEntries(undefined, '2026-11-23', 0, () => true)).toBeNull();
  });
});
