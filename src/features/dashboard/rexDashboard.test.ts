import { describe, expect, it } from 'vitest';
import {
  EMPTY_REX_MEMORY,
  GREETING,
  QUIET_SUGGESTION,
  REX_MODULES,
  buildRexSuggestions,
  dismissSuggestion,
  loadRexMemory,
  pickRexSuggestion,
  saveRexMemory,
  wasTyped,
  withTyped,
  type RexContext,
  type RexViewDay,
} from './rexDashboard';

const calm: RexContext = {
  hour: 10,
  isToday: true,
  hasCheckIn: true,
  trainedToday: false,
  hasSessionToday: true,
  restMarked: false,
  weeklyReviewRange: null,
  emphasisReviewPending: false,
  nutritionPercent: 80,
  streak: 0,
  goalsBehind: 0,
  painLabels: [],
  daysSinceWeight: 2,
};
const ids = (c: Partial<RexContext>) => buildRexSuggestions({ ...calm, ...c }).map((s) => s.id);

describe('Rex en el Dashboard: qué sugiere', () => {
  it('con todo en orden no hay sugerencias y sale la tranquila', () => {
    expect(buildRexSuggestions(calm)).toEqual([]);
    expect(pickRexSuggestion([], EMPTY_REX_MEMORY, '2026-11-05').current).toBe(QUIET_SUGGESTION);
  });

  it('el check-in pendiente va primero y saluda según la hora', () => {
    const list = buildRexSuggestions({ ...calm, hasCheckIn: false, weeklyReviewRange: '2 nov al 8 nov', hour: 9 });
    expect(list.map((s) => s.id)).toEqual(['checkin', 'semana']);
    expect(list[0].text).toMatch(/^Buenos días\./);
    expect(list[0].actions).toEqual([{ label: 'Hacer el check-in', target: 'checkin' }]);
    expect(GREETING(17)).toBe('Buenas tardes');
    expect(GREETING(23)).toBe('Buenas noches');
  });

  it('el check-in no se pide de noche ni mirando un día pasado', () => {
    expect(ids({ hasCheckIn: false, hour: 22 })).not.toContain('checkin');
    expect(ids({ hasCheckIn: false, isToday: false })).not.toContain('checkin');
  });

  it('la revisión semanal y la de las 4 semanas llevan a su sitio', () => {
    const list = buildRexSuggestions({ ...calm, weeklyReviewRange: '2 nov al 8 nov', emphasisReviewPending: true });
    expect(list.map((s) => s.actions[0].target)).toEqual(['semana', 'revision-enfasis']);
    expect(list[0].text).toContain('2 nov al 8 nov');
  });

  it('tras la sesión: «Sesión hecha» con el esfuerzo frente al objetivo, y el detalle solo si hay balance', () => {
    const closing = { real: 52, low: 55, high: 75, planned: 65, status: 'por-debajo' as const, notDone: null, hasDetail: true };
    const s = buildRexSuggestions({ ...calm, trainedToday: true, closing })[0];
    expect(s.id).toBe('cierre');
    expect(s.lead).toBe('Sesión hecha.');
    expect(s.text).toBe('Sesión hecha. Esfuerzo 52 con ~65 previstos, por debajo de tu objetivo (55–75): había margen.');
    expect(s.dismissible).toBe(false);
    expect(s.actions.map((a) => a.target)).toEqual(['detalle-dia', 'volumen', 'forma']);
    const noDetail = buildRexSuggestions({ ...calm, trainedToday: true, closing: { ...closing, hasDetail: false, planned: null, status: 'pasado', real: 80, notDone: 'Sin el WOD, por la molestia.' } })[0];
    expect(noDetail.actions.map((a) => a.target)).toEqual(['volumen', 'forma']);
    expect(noDetail.text).toBe('Sesión hecha. Esfuerzo 80: 5 por encima de tu objetivo (55–75). Mañana, con cuidado. Sin el WOD, por la molestia.');
    expect(noDetail.tone).toBe('mid');
    expect(buildRexSuggestions({ ...calm, trainedToday: true })[0].text).toBe('Sesión hecha. Buen trabajo.');
  });

  it('el consejo del día es la frase principal: verbo en color, motivo y atajos de la sesión y el descanso', () => {
    const advice = { lead: 'Buen día para apretar.', reason: 'Preparación 82 % y carga óptima.', tone: 'good' as const, overTarget: false };
    const list = buildRexSuggestions({ ...calm, advice, canRest: true });
    expect(list[0]).toMatchObject({ id: 'consejo', lead: 'Buen día para apretar.', tone: 'good', dismissible: false });
    expect(list[0].text).toBe('Buen día para apretar. Preparación 82 % y carga óptima.');
    expect(list[0].actions).toEqual([
      { label: 'Ver la sesión', target: 'planificacion' },
      { label: 'Hoy descanso', target: 'descanso' },
    ]);
    // Si la sesión se pasa del objetivo, el atajo principal es ajustarla.
    expect(buildRexSuggestions({ ...calm, advice: { ...advice, overTarget: true }, canRest: true })[0].actions[0].label).toBe('Ajustar sesión');
    // Sin sesión prevista no ofrece verla; con el descanso marcado ofrece deshacerlo.
    expect(buildRexSuggestions({ ...calm, advice, hasSessionToday: false, canRest: false })[0].actions).toEqual([]);
    expect(buildRexSuggestions({ ...calm, advice, restMarked: true, canRest: true })[0].actions).toEqual([{ label: 'Deshacer: voy a entrenar', target: 'descanso' }]);
  });

  it('el check-in va antes que el consejo, y el consejo antes que lo demás', () => {
    const advice = { lead: 'Entrena como está previsto.', reason: '', tone: 'info' as const, overTarget: false };
    expect(ids({ advice, hasCheckIn: false, weeklyReviewRange: 'x', goalsBehind: 1 })).toEqual(['checkin', 'consejo', 'semana', 'objetivos-atrasados']);
    expect(buildRexSuggestions({ ...calm, advice })[0].text).toBe('Entrena como está previsto.');
  });

  it('mirando otro día no hay consejo ni cierre de hoy', () => {
    const advice = { lead: 'x', reason: 'y', tone: 'good' as const, overTarget: false };
    expect(ids({ advice, isToday: false })).not.toContain('consejo');
  });


  it('la nutrición solo se menciona por la tarde y si va baja', () => {
    expect(ids({ nutritionPercent: 30, hour: 11 })).not.toContain('nutricion');
    expect(ids({ nutritionPercent: 30, hour: 16 })).toContain('nutricion');
    expect(ids({ nutritionPercent: 75, hour: 16 })).not.toContain('nutricion');
    expect(ids({ nutritionPercent: null, hour: 16 })).not.toContain('nutricion');
    expect(ids({ nutritionPercent: 30, hour: 16, isToday: false })).not.toContain('nutricion');
  });

  it('molestias, objetivos atrasados, racha y peso, con singular y plural', () => {
    const list = buildRexSuggestions({ ...calm, painLabels: ['Rodilla'], goalsBehind: 1, streak: 6, daysSinceWeight: 20 });
    expect(list.map((s) => s.id)).toEqual(['molestia', 'objetivos-atrasados', 'racha', 'peso']);
    expect(list[0].text).toContain('rodilla');
    expect(list[1].text).toMatch(/^1 objetivo va por detrás o le falta un test/);
    expect(buildRexSuggestions({ ...calm, goalsBehind: 2 })[0].text).toMatch(/^2 objetivos van por detrás o les faltan un test/);
    expect(list[2].text).toContain('6 días');
    expect(list[3].text).toContain('20 días');
  });

  it('la racha pide un mínimo y el peso nunca apuntado se dice distinto', () => {
    expect(ids({ streak: 3 })).not.toContain('racha');
    const never = buildRexSuggestions({ ...calm, daysSinceWeight: null })[0];
    expect(never.id).toBe('peso');
    expect(never.text).toMatch(/Aún no tengo tu peso/);
    expect(ids({ daysSinceWeight: 13 })).not.toContain('peso');
  });

  it('siempre ordenadas de más a menos importante', () => {
    const list = buildRexSuggestions({
      ...calm,
      hasCheckIn: false,
      weeklyReviewRange: 'x',
      emphasisReviewPending: true,
      trainedToday: true,
      nutritionPercent: 10,
      hour: 18,
      painLabels: ['Hombro'],
      goalsBehind: 1,
      streak: 9,
      daysSinceWeight: null,
    });
    const p = list.map((s) => s.priority);
    expect(p).toEqual([...p].sort((a, b) => b - a));
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
  });
});

describe('Rex en el Dashboard: mirando un día pasado', () => {
  const day: RexViewDay = { iso: '2026-11-03', label: 'Ayer', trained: true, rested: false, strain: 62, low: 55, high: 75 };
  const only = (v: Partial<RexViewDay>, c: Partial<RexContext> = {}) => buildRexSuggestions({ ...calm, isToday: false, hasCheckIn: false, weeklyReviewRange: 'x', painLabels: ['Rodilla'], daysSinceWeight: null, ...c, viewDay: { ...day, ...v } });

  it('solo habla de ese día: nada de hoy (revisión, molestia, peso, check-in)', () => {
    const list = only({});
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('dia-2026-11-03');
  });

  it('compara el esfuerzo con el objetivo de ese día', () => {
    expect(only({})[0].text).toBe('Ayer entrenaste con un esfuerzo de 62, dentro de tu objetivo (55–75). Justo lo que tocaba.');
    expect(only({ strain: 85 })[0].text).toMatch(/por encima de tu objetivo \(55–75\)/);
    expect(only({ strain: 40 })[0].text).toMatch(/por debajo de tu objetivo \(55–75\)/);
    expect(only({ low: null, high: null })[0].text).toBe('Ayer entrenaste, con un esfuerzo de 62.');
    expect(only({ label: 'El mié 14' })[0].text).toMatch(/^El mié 14 entrenaste/);
  });

  it('un día sin sesión: descanso elegido o nada registrado, y solo ofrece volver a hoy', () => {
    const rest = only({ trained: false, rested: true, strain: null })[0];
    expect(rest.text).toMatch(/^Ayer fue de descanso/);
    expect(rest.actions.map((a) => a.target)).toEqual(['hoy']);
    expect(only({ trained: false, strain: null })[0].text).toBe('Ayer no hay ninguna sesión registrada.');
  });

  it('con sesión ofrece el volumen y volver a hoy, y no se puede apartar', () => {
    const s = only({})[0];
    expect(s.actions.map((a) => a.target)).toEqual(['volumen', 'hoy']);
    expect(s.dismissible).toBe(false);
  });

  it('sin día pasado todo sigue como antes', () => {
    expect(buildRexSuggestions({ ...calm, viewDay: null })).toEqual([]);
  });
});

describe('Rex en el Dashboard: dejar para luego y recordar', () => {
  const list = buildRexSuggestions({ ...calm, hasCheckIn: false, weeklyReviewRange: 'x' });

  it('"Ahora no" pasa a la siguiente solo por hoy', () => {
    const mem = dismissSuggestion(EMPTY_REX_MEMORY, 'checkin', '2026-11-05');
    expect(pickRexSuggestion(list, mem, '2026-11-05')).toMatchObject({ current: { id: 'semana' }, waiting: 0 });
    // Al día siguiente vuelve.
    expect(pickRexSuggestion(list, mem, '2026-11-06').current.id).toBe('checkin');
  });

  it('con todas dejadas para luego, queda la tranquila, y esa no se puede dejar', () => {
    let mem = dismissSuggestion(EMPTY_REX_MEMORY, 'checkin', '2026-11-05');
    mem = dismissSuggestion(mem, 'semana', '2026-11-05');
    expect(pickRexSuggestion(list, mem, '2026-11-05').current).toBe(QUIET_SUGGESTION);
    expect(dismissSuggestion(mem, 'quiet', '2026-11-05')).toBe(mem);
  });

  it('«Tengo otra cosa…» pasa a la siguiente sin apartar nada y da la vuelta', () => {
    expect(pickRexSuggestion(list, EMPTY_REX_MEMORY, '2026-11-05', 1).current.id).toBe('semana');
    expect(pickRexSuggestion(list, EMPTY_REX_MEMORY, '2026-11-05', 2).current.id).toBe('checkin');
    expect(pickRexSuggestion([], EMPTY_REX_MEMORY, '2026-11-05', 3).current).toBe(QUIET_SUGGESTION);
  });

  it('cuenta cuántas esperan detrás', () => {
    expect(pickRexSuggestion(list, EMPTY_REX_MEMORY, '2026-11-05').waiting).toBe(1);
  });

  it('dejar algo hoy limpia lo de otros días y no muta', () => {
    const old = { dismissed: { peso: '2026-10-30' }, typed: [] as string[] };
    const next = dismissSuggestion(old, 'checkin', '2026-11-05');
    expect(next.dismissed).toEqual({ checkin: '2026-11-05' });
    expect(old.dismissed).toEqual({ peso: '2026-10-30' });
  });

  it('las frases ya escritas no se repiten el mismo día, y la lista tiene tope', () => {
    let mem = withTyped(EMPTY_REX_MEMORY, 'checkin', '2026-11-05');
    expect(wasTyped(mem, 'checkin', '2026-11-05')).toBe(true);
    expect(wasTyped(mem, 'checkin', '2026-11-06')).toBe(false);
    expect(withTyped(mem, 'checkin', '2026-11-05')).toBe(mem);
    for (let i = 0; i < 60; i++) mem = withTyped(mem, `s${i}`, '2026-11-05');
    expect(mem.typed.length).toBeLessThanOrEqual(30);
  });

  it('el almacenamiento se lee y guarda, y un fallo nunca rompe', () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const mem = withTyped(dismissSuggestion(EMPTY_REX_MEMORY, 'peso', '2026-11-05'), 'peso', '2026-11-05');
    saveRexMemory(fake, mem);
    expect(loadRexMemory(fake)).toEqual(mem);
    expect(loadRexMemory(null)).toBe(EMPTY_REX_MEMORY);
    expect(loadRexMemory({ getItem: () => '{roto' })).toBe(EMPTY_REX_MEMORY);
    expect(loadRexMemory({ getItem: () => { throw new Error('bloqueado'); } })).toBe(EMPTY_REX_MEMORY);
    expect(() => saveRexMemory({ setItem: () => { throw new Error('lleno'); } }, mem)).not.toThrow();
    expect(loadRexMemory({ getItem: () => JSON.stringify({ dismissed: { a: 3, b: 'x' }, typed: ['t', 4] }) })).toEqual({ dismissed: { b: 'x' }, typed: ['t'] });
  });
});

describe('Rex en el Dashboard: los módulos de «Más»', () => {
  it('cubre los botones que salen de la cabecera, sin repetir', () => {
    const targets = REX_MODULES.map((m) => m.target);
    expect(new Set(targets).size).toBe(targets.length);
    for (const t of ['nutricion', 'constancia', 'volumen', 'analisis', 'perfil', 'objetivos', 'peso']) expect(targets).toContain(t);
  });
});
