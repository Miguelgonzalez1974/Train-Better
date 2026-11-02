import { describe, expect, it } from 'vitest';
import { dayAdvice, type DayAdviceInput } from './dayAdvice';
import type { DailySession } from '../data/athlete/types';

const session = (over: Partial<NonNullable<DayAdviceInput['session']>> = {}): NonNullable<DayAdviceInput['session']> => ({ isRestDay: false, mesocycleWeek: 1, ...over });
const comp = (over: Partial<NonNullable<DailySession['competition']>>): NonNullable<DailySession['competition']> => ({ phase: 'taper', label: 'Taper', guidance: '', daysToEvent: 4, ...over });

const base: DayAdviceInput = {
  session: session(),
  hasCheckIn: true,
  prep: 62,
  level: 'normal',
  loadZone: 'optima',
  hrvLow: false,
  painAreas: [],
  fit: { kind: 'dentro', planned: 5, diff: 0 },
  target: { low: 4, high: 6 },
};
const advise = (over: Partial<DayAdviceInput>) => dayAdvice({ ...base, ...over });

describe('el icono y el color del consejo', () => {
  const green = { color: 'verde' as const, reasons: ['Preparación 78 %'] };
  it('cada estado lleva su icono y su color', () => {
    expect(advise({ session: session({ dayLight: green }), prep: 78 })).toMatchObject({ tone: 'good', icon: 'bolt' });
    expect(advise({ session: session({ dayLight: green, mesocycleWeek: 4 }), prep: 78 })).toMatchObject({ tone: 'good', icon: 'check' });
    expect(advise({ session: session({ dayLight: { color: 'ambar', reasons: ['x'] } }) })).toMatchObject({ tone: 'mid', icon: 'down' });
    expect(advise({ session: session({ dayLight: { color: 'rojo', reasons: ['x'] } }) })).toMatchObject({ tone: 'bad', icon: 'alert' });
    expect(advise({ hasCheckIn: false })).toMatchObject({ tone: 'info', icon: 'sun' });
    expect(advise({ session: session({ competition: comp({ phase: 'taper' }) }) })).toMatchObject({ tone: 'good', icon: 'check' });
  });

  it('todo lo de la competición va en dorado con la copa', () => {
    for (const c of [comp({ phase: 'evento', eventDay: true, daysToEvent: 0 }), comp({ phase: 'vispera', daysToEvent: 1 }), comp({ phase: 'activacion', daysToEvent: 2 }), comp({ phase: 'post', daysToEvent: -1 })]) {
      expect(advise({ session: session({ competition: c }) })).toMatchObject({ tone: 'gold', icon: 'trophy' });
    }
  });
});

describe('el consejo del día', () => {
  it('sin nada especial: entrena como está previsto y dice cómo encaja con el objetivo', () => {
    const a = advise({});
    expect(a.lead).toBe('Entrena como está previsto.');
    expect(a.tone).toBe('good');
    expect(a.reason).toContain('La sesión (~5) encaja con tu objetivo (4–6).');
  });

  it('el semáforo verde aprieta salvo en descarga o cerca de competir', () => {
    const green = { color: 'verde' as const, reasons: ['Preparación 78 %'] };
    expect(advise({ session: session({ dayLight: green }), prep: 78 }).lead).toBe('Buen día para apretar.');
    expect(advise({ session: session({ dayLight: green, mesocycleWeek: 4 }), prep: 78 }).lead).toBe('Llegas bien: a por la sesión.');
    expect(advise({ session: session({ dayLight: green, competition: comp({ phase: 'pico' }) }), prep: 78 }).lead).toBe('Llegas bien: a por la sesión.');
  });

  it('el semáforo ámbar baja el ritmo y cuenta por qué; el rojo manda recuperar', () => {
    const amber = advise({ session: session({ dayLight: { color: 'ambar', reasons: ['Preparación 48 %', 'HRV por debajo de tu rango'] } }) });
    expect(amber.lead).toBe('Baja el ritmo hoy.');
    expect(amber.tone).toBe('mid');
    expect(amber.reason).toContain('Preparación 48 %, HRV por debajo de tu rango.');
    expect(amber.reason).toContain('recortado la sesión');
    const red = advise({ session: session({ dayLight: { color: 'rojo', reasons: ['Preparación 35 %'] } }) });
    expect(red.lead).toBe('Hoy toca recuperar, no entrenar.');
    expect(red.tone).toBe('bad');
  });

  it('una molestia activa manda sobre un día verde pero no sobre el ámbar', () => {
    const green = session({ dayLight: { color: 'verde', reasons: ['Preparación 80 %'] } });
    const pain = advise({ session: green, painAreas: ['hombro'] });
    expect(pain.lead).toBe('Entrena, cuidando el hombro.');
    expect(advise({ session: green, painAreas: ['hombro', 'rodilla'] }).lead).toBe('Entrena, cuidando el hombro y la rodilla.');
    const amber = session({ dayLight: { color: 'ambar', reasons: ['Preparación 50 %'] } });
    expect(advise({ session: amber, painAreas: ['hombro'] }).lead).toBe('Baja el ritmo hoy.');
  });

  it('en el taper manda la fase, con los días que faltan', () => {
    const a = advise({ session: session({ competition: comp({ phase: 'taper', daysToEvent: 4 }) }) });
    expect(a.lead).toBe('Entrena, pero sin pasarte.');
    expect(a.reason).toContain('A 4 días de competir');
    // pero un día rojo sigue mandando recuperar
    const red = advise({ session: session({ competition: comp({ phase: 'taper' }), dayLight: { color: 'rojo', reasons: ['Preparación 40 %'] } }) });
    expect(red.lead).toBe('Hoy toca recuperar, no entrenar.');
  });

  it('el día, la víspera, la activación, el simulacro y el después de competir tienen su guion', () => {
    expect(advise({ session: session({ competition: comp({ phase: 'evento', eventDay: true, daysToEvent: 0 }) }) }).lead).toBe('Hoy compites.');
    expect(advise({ session: session({ competition: comp({ phase: 'vispera', daysToEvent: 1 }) }) }).lead).toContain('Mañana compites');
    const act = advise({ session: session({ competition: comp({ phase: 'activacion', daysToEvent: 2 }) }) });
    expect(act.lead).toBe('Sesión corta y técnica.');
    expect(act.reason).toContain('Faltan 2 días');
    expect(advise({ session: session({ competition: comp({ phase: 'pico', simulacro: true, daysToEvent: 6 }) }) }).lead).toBe('Hoy es el simulacro.');
    expect(advise({ session: session({ competition: comp({ phase: 'post', daysToEvent: -2 }) }) }).lead).toBe('Muévete, no te vacíes.');
  });

  it('sin check-in lo dice y no inventa un semáforo; con la carga muy alta pide cuidado', () => {
    const a = advise({ hasCheckIn: false, prep: null, level: null });
    expect(a.lead).toBe('Entrena como está previsto.');
    expect(a.tone).toBe('info');
    expect(a.reason).toContain('Aún sin check-in');
    const careful = advise({ hasCheckIn: false, loadZone: 'alta', prep: 70, level: 'alta' });
    expect(careful.lead).toBe('Hoy, mejor con cuidado.');
    expect(careful.reason).toContain('carga muy alta');
  });

  it('la sesión que se pasa del objetivo avisa de que se puede ajustar', () => {
    const a = advise({ hasCheckIn: false, fit: { kind: 'se-pasa', planned: 8, diff: 2 } });
    expect(a.reason).toContain('se pasa 2 de tu objetivo (4–6): puedes ajustarla.');
    expect(advise({ hasCheckIn: false, fit: { kind: 'se-queda-corta', planned: 3, diff: 1 } }).reason).toContain('te deja margen');
  });

  it('un día de descanso habla de recuperar según la preparación', () => {
    const rest = session({ isRestDay: true });
    expect(advise({ session: rest, level: 'alta' })).toMatchObject({ lead: 'Hoy toca descansar.', tone: 'info', icon: 'moon' });
    expect(advise({ session: rest, level: 'normal' }).reason).toContain('Vas normal de recuperación');
    expect(advise({ session: rest, level: 'baja' })).toMatchObject({ lead: 'Hoy toca recuperar.', tone: 'bad' });
    // una HRV baja hunde un día normal
    expect(advise({ session: rest, level: 'normal', hrvLow: true }).tone).toBe('bad');
    expect(advise({ session: rest, level: 'alta' }).reason).toContain('Si entrenas, tu objetivo es 4–6.');
  });

  it('sin sesión prevista no promete nada', () => {
    const a = advise({ session: null });
    expect(a.lead).toBe('Hoy no hay sesión prevista.');
    expect(a.reason).toBe('Si entrenas, tu objetivo es 4–6.');
  });
});
