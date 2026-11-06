import { describe, expect, it } from 'vitest';
import { buildPlanRexSuggestions, planCompletedSuggestion, planNoticesSuggestion, planStateSuggestion, type PlanRexContext } from './rexPlan';

const base: PlanRexContext = {
  hasTrainingSession: true,
  light: { color: 'verde', name: 'Día verde' },
  planned: 64.6,
  fit: { kind: 'dentro', diff: 0 },
  target: { low: 55, high: 75 },
  hardness: 0,
  canHarder: true,
  competition: null,
  painLabels: [],
  emphasis: null,
  notices: { count: 0, actionable: false },
};
const mk = (o: Partial<PlanRexContext> = {}): PlanRexContext => ({ ...base, ...o });

describe('Rex en Planificación: la frase del estado del día', () => {
  it('semáforo como verbo en color y el esfuerzo previsto frente al objetivo', () => {
    const s = planStateSuggestion(mk())!;
    expect(s).toMatchObject({ id: 'plan-estado', lead: 'Día verde.', tone: 'good', dismissible: false });
    expect(s.text).toBe('Día verde. Esfuerzo previsto ~65, dentro de tu objetivo (55–75).');
  });

  it('el color sigue al semáforo y sin check-in habla de la sesión de hoy', () => {
    expect(planStateSuggestion(mk({ light: { color: 'ambar', name: 'Día ámbar' } }))!.tone).toBe('mid');
    expect(planStateSuggestion(mk({ light: { color: 'rojo', name: 'Día rojo' } }))!.tone).toBe('bad');
    const none = planStateSuggestion(mk({ light: null }))!;
    expect(none.lead).toBe('Sesión de hoy.');
    expect(none.tone).toBe('info');
  });

  it('dice cuándo la sesión se pasa del objetivo o deja margen', () => {
    expect(planStateSuggestion(mk({ fit: { kind: 'se-pasa', diff: 8 } }))!.text).toContain('se pasa 8 de tu objetivo (55–75)');
    expect(planStateSuggestion(mk({ fit: { kind: 'se-queda-corta', diff: 6 } }))!.text).toContain('te deja margen sobre tu objetivo');
    expect(planStateSuggestion(mk({ fit: null, target: null }))!.text).toBe('Día verde. Esfuerzo previsto ~65.');
    expect(planStateSuggestion(mk({ planned: null, fit: null }))!.text).toBe('Día verde.');
  });

  it('suma dureza, competición, molestias y el énfasis del perfil (si es corto)', () => {
    const s = planStateSuggestion(
      mk({ hardness: 1, competition: { daysToEvent: 3, phase: 'taper' }, painLabels: ['Rodilla', 'Hombro'], emphasis: 'Más motor largo' }),
    )!;
    expect(s.text).toBe('Día verde. Esfuerzo previsto ~65, dentro de tu objetivo (55–75). Más dura +1. A 3 días de competir (taper). Cuidando rodilla y hombro. Más motor largo.');
    expect(planStateSuggestion(mk({ competition: { daysToEvent: 1, phase: 'activación' } }))!.text).toContain('A 1 día de competir');
    expect(planStateSuggestion(mk({ emphasis: 'x'.repeat(120) }))!.text).not.toContain('xxxx');
  });

  it('tres atajos: el porqué, la dureza y la molestia, con la etiqueta que toca', () => {
    expect(planStateSuggestion(mk())!.actions).toEqual([
      { label: 'Por qué', target: 'plan-detalle' },
      { label: 'Más dura', target: 'plan-dureza' },
      { label: 'Me duele algo', target: 'plan-molestia' },
    ]);
    const adjusted = planStateSuggestion(mk({ hardness: 2, painLabels: ['Codo / muñeca'] }))!.actions.map((a) => a.label);
    expect(adjusted).toEqual(['Por qué', 'Cambiar la dureza', 'Molestias']);
    expect(planStateSuggestion(mk({ canHarder: false }))!.actions.map((a) => a.target)).toEqual(['plan-detalle', 'plan-molestia']);
  });

  it('sin sesión de entreno (descanso, hecha o editando) no hay frase', () => {
    expect(planStateSuggestion(mk({ hasTrainingSession: false }))).toBeNull();
  });
});

describe('Rex en Planificación: la sesión completada', () => {
  const done = { changes: [], prMessage: null, e1rmPending: 0, streak: 1, weekDone: 3, weekPlanned: 5 };

  it('cuenta lo que decidió el coach, con el resumen a un toque', () => {
    const s = planCompletedSuggestion({ ...done, changes: ['Press banca sube a 85 kg el próximo día.'] })!;
    expect(s).toMatchObject({ id: 'plan-completada', lead: 'Sesión completada.', tone: 'good', dismissible: false });
    expect(s.text).toBe('Sesión completada. Press banca sube a 85 kg el próximo día.');
    expect(s.actions).toEqual([
      { label: 'Ver resumen', target: 'plan-resumen' },
      { label: '¿Cambiar algo?', target: 'plan-cambiar' },
    ]);
  });

  it('sin cambios de carga: un PR nuevo, la racha o cómo va la semana', () => {
    expect(planCompletedSuggestion({ ...done, prMessage: 'Nuevo PR en sentadilla: 160 kg.' })!.text).toBe('Sesión completada. Nuevo PR en sentadilla: 160 kg.');
    expect(planCompletedSuggestion({ ...done, streak: 6 })!.text).toBe('Sesión completada. Buen trabajo: 6 días seguidos sin fallar. Esta semana llevas 3 de 5.');
    expect(planCompletedSuggestion(done)!.text).toBe('Sesión completada. Buen trabajo. Esta semana llevas 3 de 5.');
    expect(planCompletedSuggestion({ ...done, weekPlanned: 0 })!.text).toBe('Sesión completada. Buen trabajo.');
  });

  it('dos cambios de carga como máximo, y avisa de las sugerencias de 1RM que están en el resumen', () => {
    const s = planCompletedSuggestion({ ...done, changes: ['A sube.', 'B baja.', 'C sube.'], e1rmPending: 2 })!;
    expect(s.text).toBe('Sesión completada. A sube. B baja. Tengo 2 sugerencias de 1RM por confirmar.');
    expect(planCompletedSuggestion({ ...done, e1rmPending: 1 })!.text).toContain('una sugerencia de 1RM');
  });

  it('la sesión completada va antes que los avisos y sustituye a la frase del estado', () => {
    const list = buildPlanRexSuggestions(mk({ completed: done, hasTrainingSession: false, notices: { count: 1, actionable: false } }));
    expect(list.map((s) => s.id)).toEqual(['plan-completada', 'plan-avisos']);
    expect(planCompletedSuggestion(null)).toBeNull();
  });
});

describe('Rex en Planificación: los avisos del coach', () => {
  it('sin avisos no dice nada; con ellos, una frase con el atajo, y más urgente si hay que decidir', () => {
    expect(planNoticesSuggestion({ count: 0, actionable: false })).toBeNull();
    const one = planNoticesSuggestion({ count: 1, actionable: true })!;
    expect(one).toMatchObject({ id: 'plan-avisos', actions: [{ label: 'Verlo', target: 'plan-avisos' }] });
    expect(one.text).toMatch(/propuesta/);
    expect(planNoticesSuggestion({ count: 3, actionable: false })!.text).toBe('Tengo 3 avisos del coach para ti.');
    expect(planNoticesSuggestion({ count: 2, actionable: true })!.text).toMatch(/2 avisos.*decidas/);
  });

  it('la lista pone el estado primero y los avisos después; vacía si no hay nada', () => {
    expect(buildPlanRexSuggestions(mk({ notices: { count: 1, actionable: false } })).map((s) => s.id)).toEqual(['plan-estado', 'plan-avisos']);
    expect(buildPlanRexSuggestions(mk({ hasTrainingSession: false }))).toEqual([]);
    expect(buildPlanRexSuggestions(mk({ hasTrainingSession: false, notices: { count: 1, actionable: false } })).map((s) => s.id)).toEqual(['plan-avisos']);
  });
});
