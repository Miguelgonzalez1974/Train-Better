import { describe, expect, it } from 'vitest';
import { ended, EMPTY_HR_SESSION, hrSummary, parseHeartRate, withCut, withReading } from './heartRate';

const frame = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe('la trama de pulso', () => {
  it('lee la cifra de 8 y de 16 bits', () => {
    expect(parseHeartRate(frame(0x00, 142))).toBe(142);
    expect(parseHeartRate(frame(0x01, 0x2c, 0x01))).toBe(300);
    // Con contacto detectado y datos extra detrás (intervalos RR).
    expect(parseHeartRate(frame(0x16, 88, 0x10, 0x03))).toBe(88);
  });

  it('descarta lo que no vale', () => {
    expect(parseHeartRate(frame(0x00, 0))).toBeNull();
    expect(parseHeartRate(frame(0x04, 70))).toBeNull();
    expect(parseHeartRate(frame(0x00))).toBeNull();
    expect(parseHeartRate(frame(0x01, 90))).toBeNull();
  });
});

describe('cómo aguanta la conexión', () => {
  const at = (s: number) => 1_000_000 + s * 1000;
  const readings = (...times: [number, number][]) => times.reduce((s, [t, bpm]) => withReading(s, bpm, at(t), false), EMPTY_HR_SESSION);

  it('duración, media y máximo; los huecos cortos no cuentan', () => {
    const s = readings([0, 100], [1, 120], [4, 140]);
    expect(hrSummary(s, at(5))).toEqual(['5 s · sin cortes · sin huecos', 'Media 120 · máximo 140']);
    expect(hrSummary(EMPTY_HR_SESSION, at(5))).toEqual([]);
  });

  it('apunta el mayor hueco, si fue con la app oculta, y los cortes', () => {
    let s = readings([0, 100], [8, 110]);
    s = withReading(withCut(s), 120, at(53), true);
    s = withReading(s, 125, at(60), false);
    expect(hrSummary(s, at(61))[0]).toBe('1 min 1 s · 1 corte · mayor hueco 45 s (app oculta)');
  });

  it('el hueco que está pasando ahora cuenta, y al parar se queda fijo', () => {
    const s = readings([0, 100], [2, 100]);
    expect(hrSummary(s, at(32))[0]).toBe('32 s · sin cortes · mayor hueco 30 s');
    const stopped = ended(s, at(32), false);
    expect(hrSummary(stopped, at(500))[0]).toBe('32 s · sin cortes · mayor hueco 30 s');
    expect(ended(stopped, at(900), true)).toBe(stopped);
  });
});
