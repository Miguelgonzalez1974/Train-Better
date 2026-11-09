import { afterEach, describe, expect, it } from 'vitest';
import { parseAsk } from './rexAsk';
import { followUpText, forgetTopic, rememberTopic } from './rexContext';

const FRIDAY = 5;
const NOW = 1_000_000;
const say = (t: string) => rememberTopic(parseAsk(t, FRIDAY), NOW);

describe('Rex sigue el hilo de la conversación', () => {
  afterEach(() => forgetTopic());

  it('tras «qué toca mañana», «¿y el viernes?» es «qué toca el viernes»', () => {
    say('que toca mañana');
    expect(followUpText('¿y el viernes?', FRIDAY, NOW + 1000)).toBe('que toca el viernes');
    expect(followUpText('el sabado', FRIDAY, NOW + 1000)).toBe('que toca el sabado');
    expect(followUpText('y pasado mañana', FRIDAY, NOW + 1000)).toBe('que toca pasado manana');
  });

  it('tras «cuál fue mi último snatch», «¿y el clean?» pregunta lo mismo del clean', () => {
    say('cual fue mi ultimo snatch');
    expect(followUpText('¿y el clean?', FRIDAY, NOW + 1000)).toBe('cual fue mi ultimo Clean');
    expect(followUpText('y la sentadilla', FRIDAY, NOW + 1000)).toBe('cual fue mi ultimo Back Squat');
  });

  it('tras «cuánto levanto en banca», «¿y en peso muerto?» también', () => {
    say('cuanto levanto en banca');
    expect(followUpText('y el peso muerto', FRIDAY, NOW + 1000)).toBe('cuanto levanto en Deadlift');
  });

  it('tras «por qué este peso», «¿y el WOD?» es «por qué este WOD»', () => {
    say('por que este peso');
    expect(followUpText('¿y el wod?', FRIDAY, NOW + 1000)).toBe('por que este wod');
    expect(followUpText('y hoy', FRIDAY, NOW + 1000)).toBe('por que hoy asi');
  });

  it('sin tema, con el tema caducado o con otra cosa no hay hilo que seguir', () => {
    expect(followUpText('y el viernes', FRIDAY, NOW)).toBeNull();
    say('que toca mañana');
    expect(followUpText('y el viernes', FRIDAY, NOW + 6 * 60_000)).toBeNull();
    say('apunta 82,4 kg');
    expect(followUpText('y el viernes', FRIDAY, NOW + 1000)).toBeNull();
  });

  it('una frase larga o que ya se entiende sola no se reescribe', () => {
    say('que toca mañana');
    expect(followUpText('quiero que me cuentes bien como va a ser el viernes', FRIDAY, NOW + 1000)).toBeNull();
    expect(followUpText('mis marcas', FRIDAY, NOW + 1000)).toBeNull();
    expect(followUpText('he comido arroz', FRIDAY, NOW + 1000)).toBeNull();
  });
});
