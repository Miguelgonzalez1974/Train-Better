import { describe, expect, it, vi } from 'vitest';
import { parseAsk } from '../features/dashboard/rexAsk';
import { createRecognizer, getSpeechCtor, numberWordsToDigits, speechProblem, type RecognitionCtor, type RecognitionEvent, type RecognitionLike } from './speech';

describe('números dichos a cifras', () => {
  it('decenas con unidades, centenas y números sueltos', () => {
    expect(numberWordsToDigits('tengo cuarenta y cinco minutos')).toBe('tengo 45 minutos');
    expect(numberWordsToDigits('mi back squat es ciento cuarenta')).toBe('mi back squat es 140');
    expect(numberWordsToDigits('mi banca es cien kilos')).toBe('mi banca es 100 kilos');
    expect(numberWordsToDigits('tengo treinta minutos')).toBe('tengo 30 minutos');
    expect(numberWordsToDigits('quince y veinticinco')).toBe('15 y 25');
    expect(numberWordsToDigits('doscientos treinta y dos')).toBe('232');
    expect(numberWordsToDigits('veintidós')).toBe('22');
  });

  it('decimales con «coma» y el peso corporal', () => {
    expect(numberWordsToDigits('apunta ochenta y dos coma cuatro kilos')).toBe('apunta 82,4 kilos');
  });

  it('«un», «una» y «uno» solo son cifra delante de una medida: «una hora» sí, «una manzana» no', () => {
    expect(numberWordsToDigits('tengo una hora')).toBe('tengo 1 hora');
    expect(numberWordsToDigits('he comido una manzana y dos huevos')).toBe('he comido una manzana y 2 huevos');
    expect(numberWordsToDigits('un kilo más')).toBe('1 kilo más');
  });

  it('lo que ya trae cifras o no son números pasa igual', () => {
    expect(numberWordsToDigits('tengo 45 minutos')).toBe('tengo 45 minutos');
    expect(numberWordsToDigits('me duele el hombro')).toBe('me duele el hombro');
    expect(numberWordsToDigits('')).toBe('');
  });

  it('lo que sale entiende la caja de Rex: los minutos dichos con palabras se leen como minutos', () => {
    const spoken = numberWordsToDigits('tengo cuarenta y cinco minutos');
    const intent = parseAsk(spoken, 3);
    expect(intent.kind).toBe('adaptar');
    expect(parseAsk(numberWordsToDigits('tengo media hora'), 3).kind).toBe('adaptar');
  });
});

describe('fallos de la voz', () => {
  it('cada código tiene su mensaje y si se puede reintentar', () => {
    expect(speechProblem('no-speech')).toMatchObject({ title: 'No te he oído', canRetry: true });
    expect(speechProblem('not-allowed')).toMatchObject({ canRetry: false });
    expect(speechProblem('audio-capture').canRetry).toBe(true);
    expect(speechProblem('network').title).toContain('conexión');
    expect(speechProblem('unsupported').canRetry).toBe(false);
    expect(speechProblem('algo-raro').title).toBe('No he podido escucharte');
  });
});

/** Un reconocimiento de voz de mentira para probar el envoltorio. */
function fakeCtor() {
  const instances: FakeRec[] = [];
  class FakeRec implements RecognitionLike {
    lang = '';
    interimResults = false;
    continuous = true;
    maxAlternatives = 0;
    onstart: (() => void) | null = null;
    onresult: ((e: RecognitionEvent) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    aborted = false;
    start() {
      this.started = true;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.aborted = true;
      this.onerror?.({ error: 'aborted' });
      this.onend?.();
    }
    constructor() {
      instances.push(this);
    }
  }
  return { Ctor: FakeRec as unknown as RecognitionCtor, instances };
}
const result = (results: { text: string; final: boolean }[], resultIndex = 0) => ({
  resultIndex,
  results: Object.assign(
    results.map((r) => Object.assign([{ transcript: r.text }], { isFinal: r.final })),
    {},
  ),
});

describe('el envoltorio del reconocimiento de voz', () => {
  it('detecta el constructor del navegador, con o sin prefijo, y devuelve null si no hay', () => {
    const { Ctor } = fakeCtor();
    expect(getSpeechCtor({ SpeechRecognition: Ctor })).toBe(Ctor);
    expect(getSpeechCtor({ webkitSpeechRecognition: Ctor })).toBe(Ctor);
    expect(getSpeechCtor({})).toBeNull();
    expect(getSpeechCtor(undefined)).toBeNull();
  });

  it('se configura en español, una frase cada vez y con lo que va entendiendo', () => {
    const { Ctor, instances } = fakeCtor();
    createRecognizer(Ctor, { onFinal: () => {} });
    expect(instances[0]).toMatchObject({ lang: 'es-ES', interimResults: true, continuous: false, maxAlternatives: 1 });
  });

  it('avisa de lo parcial, de la frase final y del final de la escucha', () => {
    const { Ctor, instances } = fakeCtor();
    const h = { onStart: vi.fn(), onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
    const rec = createRecognizer(Ctor, h);
    rec.start();
    expect(h.onStart).toHaveBeenCalled();
    instances[0].onresult?.(result([{ text: 'tengo cuarenta ', final: false }]) as never);
    expect(h.onInterim).toHaveBeenCalledWith('tengo cuarenta');
    instances[0].onresult?.(result([{ text: 'tengo cuarenta y cinco minutos', final: true }]) as never);
    expect(h.onFinal).toHaveBeenCalledWith('tengo cuarenta y cinco minutos');
    rec.stop();
    expect(h.onEnd).toHaveBeenCalled();
  });

  it('un fallo se comunica con su código y cancelar a mano llega como «aborted»', () => {
    const { Ctor, instances } = fakeCtor();
    const h = { onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
    const rec = createRecognizer(Ctor, h);
    instances[0].onerror?.({ error: 'no-speech' });
    expect(h.onError).toHaveBeenCalledWith('no-speech');
    rec.abort();
    expect(h.onError).toHaveBeenLastCalledWith('aborted');
    expect(h.onFinal).not.toHaveBeenCalled();
  });
});
