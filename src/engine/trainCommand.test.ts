import { describe, expect, it } from 'vitest';
import { numberWordsToDigits } from '../lib/speech';
import { parseTrainCommand } from './trainCommand';

const say = (t: string) => parseTrainCommand(numberWordsToDigits(t));

describe('órdenes habladas en el entreno', () => {
  it('serie hecha, con otro peso y con cómo salió', () => {
    expect(say('serie hecha')).toEqual({ kind: 'done' });
    expect(say('hecha')).toEqual({ kind: 'done' });
    expect(say('listo')).toEqual({ kind: 'done' });
    expect(say('hecha con 102,5 kilos')).toEqual({ kind: 'done', kg: 102.5 });
    expect(say('hecha con cien kilos')).toEqual({ kind: 'done', kg: 100 });
    expect(say('serie hecha ochenta y cinco kilos')).toEqual({ kind: 'done', kg: 85 });
    expect(say('hecha pero justa')).toEqual({ kind: 'done', quality: 'justa' });
    expect(say('hecha, no salió')).toEqual({ kind: 'done', quality: 'fallada' });
    expect(say('hecha con 90 kg, justa')).toEqual({ kind: 'done', kg: 90, quality: 'justa' });
  });

  it('solo el peso, o solo cómo salió la última', () => {
    expect(say('pon 105')).toEqual({ kind: 'kg', kg: 105 });
    expect(say('110 kilos')).toEqual({ kind: 'kg', kg: 110 });
    expect(say('justa')).toEqual({ kind: 'quality', quality: 'justa' });
    expect(say('no salió')).toEqual({ kind: 'quality', quality: 'fallada' });
    expect(say('la última fue bien')).toEqual({ kind: 'quality', quality: 'bien' });
  });

  it('un peso absurdo o unos segundos no son kilos', () => {
    expect(say('pon 5')).toEqual({ kind: 'unknown' });
    expect(say('más 30 segundos')).toEqual({ kind: 'rest-add', seconds: 30 });
    expect(say('pon 30 segundos más')).toEqual({ kind: 'rest-add', seconds: 30 });
  });

  it('el descanso: saltarlo o alargarlo', () => {
    expect(say('salta el descanso')).toEqual({ kind: 'rest-skip' });
    expect(say('ya estoy listo')).toEqual({ kind: 'rest-skip' });
    expect(say('sin descanso')).toEqual({ kind: 'rest-skip' });
    expect(say('medio minuto más')).toEqual({ kind: 'rest-add', seconds: 30 });
    expect(say('otro minuto')).toEqual({ kind: 'rest-add', seconds: 60 });
  });

  it('moverse entre tarjetas, deshacer, todas como estaban y cerrar', () => {
    expect(say('siguiente')).toEqual({ kind: 'next' });
    expect(say('pasa al siguiente')).toEqual({ kind: 'next' });
    expect(say('anterior')).toEqual({ kind: 'prev' });
    expect(say('deshaz la serie')).toEqual({ kind: 'undo' });
    expect(say('me equivoqué')).toEqual({ kind: 'undo' });
    expect(say('todas como estaban previstas')).toEqual({ kind: 'all-planned' });
    expect(say('cierra la sesión')).toEqual({ kind: 'close' });
    expect(say('he terminado')).toEqual({ kind: 'close' });
  });

  it('una molestia manda sobre todo lo demás', () => {
    expect(say('hecha, me duele el hombro')).toEqual({ kind: 'pain' });
    expect(say('me duele la rodilla')).toEqual({ kind: 'pain' });
  });

  it('lo que no es una orden', () => {
    expect(say('')).toEqual({ kind: 'unknown' });
    expect(say('qué tiempo hace')).toEqual({ kind: 'unknown' });
  });
});
