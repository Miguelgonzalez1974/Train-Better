import { describe, expect, it } from 'vitest';
import { dayAnswer, dinnerAnswer, elsewhereAnswer, helpAnswer, missingAnswer, normalizeAsk, parseAsk, weightAnswer } from './rexAsk';

const FRIDAY = 5;

describe('leer lo que se le pregunta a Rex', () => {
  it('normaliza acentos, signos y espacios', () => {
    expect(normalizeAsk('  ¿Qué  toca MAÑANA? ')).toBe('que toca manana');
  });

  it('apuntar el peso, con coma o punto y con varias formas de decirlo', () => {
    expect(parseAsk('apunta 82,4 kg', FRIDAY)).toEqual({ kind: 'peso', kg: 82.4 });
    expect(parseAsk('He pesado 81.9', FRIDAY)).toEqual({ kind: 'peso', kg: 81.9 });
    expect(parseAsk('mi peso es 83', FRIDAY)).toEqual({ kind: 'peso', kg: 83 });
    expect(parseAsk('hoy pese 80,25 kilos', FRIDAY)).toEqual({ kind: 'peso', kg: 80.25 });
  });

  it('un número suelto o fuera de rango no es un peso', () => {
    expect(parseAsk('apunta 82,4', FRIDAY).kind).not.toBe('peso');
    expect(parseAsk('pesé 400 kg', FRIDAY).kind).not.toBe('peso');
    expect(parseAsk('apunta mi peso', FRIDAY)).toEqual({ kind: 'modulo', target: 'peso' });
  });

  it('una comida pasa entera a Nutrición, aunque lleve cifras', () => {
    expect(parseAsk('He comido dos huevos y 200 g de arroz', FRIDAY)).toEqual({ kind: 'comida', text: 'He comido dos huevos y 200 g de arroz' });
    expect(parseAsk('apunta que he cenado pasta', FRIDAY).kind).toBe('comida');
    expect(parseAsk('desayuné 100 g de avena', FRIDAY).kind).toBe('comida');
    // «comida» como palabra suelta no es apuntar nada
    expect(parseAsk('la comida de hoy', FRIDAY).kind).not.toBe('comida');
  });

  it('qué toca: hoy, mañana, pasado mañana o un día de la semana', () => {
    expect(parseAsk('¿Qué toca mañana?', FRIDAY)).toEqual({ kind: 'dia', offset: 1, label: 'mañana' });
    expect(parseAsk('que entreno pasado mañana', FRIDAY)).toEqual({ kind: 'dia', offset: 2, label: 'pasado mañana' });
    expect(parseAsk('qué toca el lunes', FRIDAY)).toEqual({ kind: 'dia', offset: 3, label: 'el lunes' });
    expect(parseAsk('que toca el viernes', FRIDAY)).toEqual({ kind: 'dia', offset: 0, label: 'hoy' });
    expect(parseAsk('qué toca', FRIDAY)).toEqual({ kind: 'dia', offset: 0, label: 'hoy' });
    expect(parseAsk('y mañana?', FRIDAY)).toEqual({ kind: 'dia', offset: 1, label: 'mañana' });
  });

  it('cómo estoy', () => {
    expect(parseAsk('¿Cómo estoy?', FRIDAY)).toEqual({ kind: 'estado' });
    expect(parseAsk('como voy esta semana', FRIDAY)).toEqual({ kind: 'estado' });
  });

  it('el nombre de un módulo lo abre', () => {
    expect(parseAsk('abre nutrición', FRIDAY)).toEqual({ kind: 'modulo', target: 'nutricion' });
    expect(parseAsk('quiero estirar', FRIDAY)).toEqual({ kind: 'modulo', target: 'movilidad' });
    expect(parseAsk('mis objetivos', FRIDAY)).toEqual({ kind: 'modulo', target: 'objetivos' });
    expect(parseAsk('mi racha', FRIDAY)).toEqual({ kind: 'modulo', target: 'constancia' });
    expect(parseAsk('check-in', FRIDAY)).toEqual({ kind: 'modulo', target: 'checkin' });
  });

  it('lo que no entiende (o vacío) va a la ayuda', () => {
    expect(parseAsk('blablabla', FRIDAY)).toEqual({ kind: 'ayuda' });
    expect(parseAsk('   ', FRIDAY)).toEqual({ kind: 'ayuda' });
  });
});

describe('las respuestas de Rex', () => {
  it('el peso: lo apuntado y el cambio frente al último registro', () => {
    expect(weightAnswer(82.4, null).text).toBe('82,4 kg de hoy. Es tu primer registro.');
    expect(weightAnswer(82.4, { kg: 83, daysAgo: 3 }).text).toBe('82,4 kg de hoy. −0,6 kg frente a 83 kg (hace 3 días).');
    expect(weightAnswer(84, { kg: 83, daysAgo: 1 }).text).toBe('84 kg de hoy. +1 kg frente a 83 kg (ayer).');
    expect(weightAnswer(83, { kg: 83, daysAgo: 7 }).text).toContain('Igual que 83 kg');
    expect(weightAnswer(82, { kg: 83, daysAgo: 0 }).text).toContain('Sustituye al que habías apuntado hoy (83 kg)');
  });

  it('qué toca: una sesión, el descanso, la competición, lo ya hecho y sin plan', () => {
    const s = dayAnswer('mañana', { kind: 'sesion', line: 'Back Squat · "Fran"', strain: 62, minutes: 58 });
    expect(s.lead).toBe('Mañana toca:');
    expect(s.text).toBe('Back Squat · "Fran" (unos 58 min, esfuerzo previsto ~62). Es lo previsto hoy: puede cambiar con tu check-in y cómo llegues.');
    expect(dayAnswer('hoy', { kind: 'sesion', line: 'Strict Press', strain: null, minutes: null }).text).toBe('Strict Press.');
    expect(dayAnswer('el sábado', { kind: 'descanso', chosen: false })).toMatchObject({ lead: 'El sábado: descanso.', actions: [{ target: 'movilidad' }] });
    expect(dayAnswer('mañana', { kind: 'competicion' }).lead).toBe('Mañana compites.');
    expect(dayAnswer('hoy', { kind: 'hecho', strain: 58 }).text).toBe('Cerraste con un esfuerzo de 58.');
    expect(dayAnswer('el lunes', { kind: 'sin-plan' }).text).toContain('el lunes');
  });

  it('la ayuda enseña ejemplos', () => {
    expect(helpAnswer().text).toContain('¿qué toca mañana?');
  });
});

describe('RexLab de cada pantalla: lo nuevo que lee la caja', () => {
  it('lo que falta y qué ceno', () => {
    expect(parseAsk('¿Qué me falta?', FRIDAY)).toEqual({ kind: 'falta' });
    expect(parseAsk('cuánta proteína me falta', FRIDAY)).toEqual({ kind: 'falta' });
    expect(parseAsk('¿Qué ceno?', FRIDAY)).toEqual({ kind: 'cena' });
    expect(parseAsk('dame una idea de cena', FRIDAY)).toEqual({ kind: 'cena' });
  });

  it('imprevistos: me duele algo (con su zona), hoy no estoy para el plan, voy a faltar, otro WOD', () => {
    expect(parseAsk('me duele la rodilla', FRIDAY)).toEqual({ kind: 'dolor', zone: 'rodilla' });
    expect(parseAsk('tengo molestia en la espalda', FRIDAY)).toEqual({ kind: 'dolor', zone: 'cadera-lumbar' });
    expect(parseAsk('me duele algo', FRIDAY)).toEqual({ kind: 'dolor', zone: null });
    expect(parseAsk('hoy no estoy para el plan', FRIDAY)).toEqual({ kind: 'no-plan' });
    expect(parseAsk('hoy no entreno', FRIDAY)).toEqual({ kind: 'no-plan' });
    expect(parseAsk('voy a faltar 3 días', FRIDAY)).toEqual({ kind: 'faltar', days: 3 });
    expect(parseAsk('me voy de viaje una semana', FRIDAY)).toEqual({ kind: 'faltar', days: 7 });
    expect(parseAsk('cámbiame el wod', FRIDAY)).toEqual({ kind: 'otro-wod' });
    expect(parseAsk('otro WOD', FRIDAY)).toEqual({ kind: 'otro-wod' });
  });

  it('el programa de fuerza: aplazar, saltar, pausar o hacerlo hoy, y solo si lo nombras', () => {
    expect(parseAsk('aplaza el programa', FRIDAY)).toEqual({ kind: 'programa', action: 'aplazar', days: null });
    expect(parseAsk('salta esta sesión del programa', FRIDAY)).toEqual({ kind: 'programa', action: 'saltar', days: null });
    expect(parseAsk('pausa el programa una semana', FRIDAY)).toEqual({ kind: 'programa', action: 'pausar', days: 7 });
    expect(parseAsk('pausa el programa 10 días', FRIDAY)).toEqual({ kind: 'programa', action: 'pausar', days: 10 });
    expect(parseAsk('hazla hoy, la del texas', FRIDAY)).toEqual({ kind: 'programa', action: 'hacer', days: null });
    // sin decir «programa» no se aplaza nada
    expect(parseAsk('aplaza', FRIDAY).kind).not.toBe('programa');
  });

  it('crear con Rex y lo que ya entendía sigue igual', () => {
    expect(parseAsk('crea un macro', FRIDAY)).toEqual({ kind: 'crear', what: 'macro' });
    expect(parseAsk('quiero un programa nuevo', FRIDAY)).toEqual({ kind: 'crear', what: 'programa' });
    expect(parseAsk('nueva temporada', FRIDAY)).toEqual({ kind: 'crear', what: 'temporada' });
    expect(parseAsk('quiero subir mi sentadilla', FRIDAY)).toEqual({ kind: 'crear', what: 'objetivo' });
    expect(parseAsk('mis objetivos', FRIDAY)).toEqual({ kind: 'modulo', target: 'objetivos' });
    expect(parseAsk('¿qué toca mañana?', FRIDAY)).toEqual({ kind: 'dia', offset: 1, label: 'mañana' });
    expect(parseAsk('¿cómo estoy?', FRIDAY)).toEqual({ kind: 'estado' });
  });

  it('las respuestas de lo que falta y de qué ceno', () => {
    expect(missingAnswer({ protein: 48.4, carbs: 90 })).toMatchObject({ lead: 'Te falta:', text: '48 g de proteína y 90 g de hidratos.', actions: [{ ask: '¿Qué ceno?' }] });
    expect(missingAnswer({ protein: 0, carbs: 0 }).lead).toBe('Día cubierto.');
    expect(dinnerAnswer(['150 g de pollo y 110 g de arroz', '2 huevos']).text).toBe('1) 150 g de pollo y 110 g de arroz. 2) 2 huevos.');
    expect(dinnerAnswer([]).lead).toBe('No te falta casi nada.');
    expect(elsewhereAnswer('Eso está en el Dashboard.', 'ir-dashboard').actions).toEqual([{ label: 'Ir al Dashboard', target: 'ir-dashboard' }]);
  });
});
