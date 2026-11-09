import { describe, expect, it } from 'vitest';
import { fixTypos, normalizeAsk, parseAsk, splitAsk } from './rexAsk';
import { mergeAnswers } from './rexAskRouter';

const FRIDAY = 5;
const fix = (t: string) => fixTypos(normalizeAsk(t));

describe('Rex perdona las faltas de escritura', () => {
  it('corrige palabras con una falta (o dos en las largas)', () => {
    expect(fix('cuanto levnto en sentadila')).toBe('cuanto levanto en sentadilla');
    expect(fix('que toca mañna')).toBe('que toca manana');
    expect(fix('cual fue mi utlimo snatch')).toBe('cual fue mi ultimo snatch');
    expect(fix('apunta mi marcsa de bnaca 92')).toBe('apunta mi marca de banca 92');
    expect(fix('quiero hacer estiramentos')).toBe('quiero hacer estiramientos');
  });

  it('no toca lo que ya es una palabra, los números ni las palabras cortas', () => {
    expect(fix('revision semanal')).toBe('revision semanal');
    expect(fix('he comido arroz con pollo')).toBe('he comido arroz con pollo');
    expect(fix('la comida de hoy')).toBe('la comida de hoy');
    expect(fix('me ha salido fatal')).toBe('me ha salido fatal');
    expect(fix('apunta 82,4 kg')).toBe('apunta 82,4 kg');
    expect(fix('tu estas bien')).toBe('tu estas bien');
  });

  it('una letra final repetida es una falta; una palabra más larga, no', () => {
    expect(fix('mi rachaa')).toBe('mi racha');
    expect(fix('mis objetivoss')).toBe('mis objetivos');
    expect(fix('estoy en semanal')).toBe('estoy en semanal');
  });

  it('las frases con falta se entienden como las buenas', () => {
    expect(parseAsk('cuanto levnto en sentadila', FRIDAY)).toMatchObject({ kind: 'marca-ver', open: false });
    expect(parseAsk('que toca mañna', FRIDAY)).toMatchObject({ kind: 'dia', label: 'mañana' });
    expect(parseAsk('mi rachaa', FRIDAY)).toEqual({ kind: 'dato', question: { what: 'racha' } });
    expect(parseAsk('mis marcsa', FRIDAY)).toEqual({ kind: 'marca-ver', lift: null, open: true });
  });
});

describe('varias peticiones en una frase', () => {
  it('apuntar el peso y preguntar qué toca', () => {
    expect(splitAsk('Apunta 82,4 kg y dime qué toca mañana', FRIDAY)).toEqual(['apunta 82,4 kg', 'dime que toca manana']);
  });

  it('separadas por coma o punto', () => {
    expect(splitAsk('¿Cuánto dura la sesión de hoy?, ¿por qué este peso?', FRIDAY)).toEqual(['cuanto dura la sesion de hoy', 'por que este peso']);
    expect(splitAsk('cuál es mi racha. cuántas sesiones llevo este mes', FRIDAY)?.length).toBe(2);
  });

  it('una comida con «y» no son dos cosas, ni una frase que nadie entiende', () => {
    expect(splitAsk('he comido arroz y pollo', FRIDAY)).toBeNull();
    expect(splitAsk('apunta 82 kg y dime algo raro', FRIDAY)).toBeNull();
    expect(splitAsk('qué toca mañana', FRIDAY)).toBeNull();
  });

  it('lo que pide confirmar o abre otra pantalla no se junta con otra cosa', () => {
    expect(splitAsk('tengo 30 minutos y dime que toca manana', FRIDAY)).toBeNull();
    expect(splitAsk('mis marcas y dime que toca manana', FRIDAY)).toBeNull();
  });

  it('juntar las respuestas: el arranque de la primera, el resto detrás y los botones sin repetir', () => {
    const a = { lead: 'Apuntado.', tone: 'good' as const, text: '82,4 kg de hoy.', actions: [{ label: 'Ver el peso', target: 'peso' as const }] };
    const b = { lead: 'Mañana toca:', tone: 'info' as const, text: 'Back Squat.', actions: [{ label: 'Ver Planificación', target: 'planificacion' as const }, { label: 'Ver el peso', target: 'peso' as const }] };
    const m = mergeAnswers([a, b]);
    expect(m.lead).toBe('Apuntado.');
    expect(m.text).toBe('82,4 kg de hoy. · Mañana toca: Back Squat.');
    expect(m.actions.map((x) => x.label)).toEqual(['Ver el peso', 'Ver Planificación']);
  });
});
