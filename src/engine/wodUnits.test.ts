import { describe, it, expect } from 'vitest';
import { localizeWodText } from './wodUnits';
import { benchmarkWorkouts } from '../data/movements';
import { libraryWods } from '../data/library/libraryWods';

describe('unidades de los WODs de programaciones', () => {
  it('pasa las cargas Rx de libras a kilos con las equivalencias habituales', () => {
    expect(localizeWodText('21 thrusters (95/65 lb)')).toBe('21 thrusters (43/29 kg)');
    expect(localizeWodText('(135/95 lb)')).toBe('(61/43 kg)');
    expect(localizeWodText('(185/135 lb)')).toBe('(84/61 kg)');
    expect(localizeWodText('(45/35 lb)')).toBe('(20/16 kg)');
    expect(localizeWodText('(20/14 lb)')).toBe('(9/6,5 kg)');
    expect(localizeWodText('(115 lb)')).toBe('(52 kg)');
  });

  it('convierte rangos y pares con rango, y respeta lo que viene detrás', () => {
    expect(localizeWodText('Ground to overhead (175-245/105-155 lb, sube cada set)')).toBe('Ground to overhead (79-111/48-70 kg, sube cada set)');
    expect(localizeWodText('155/105 lb, sin soltar la barra')).toBe('70/48 kg, sin soltar la barra');
  });

  it('pasa pulgadas, pood, pies, yardas y millas', () => {
    expect(localizeWodText('box jumps (24/20 in)')).toBe('box jumps (60/50 cm)');
    expect(localizeWodText('30 in step-up')).toBe('75 cm step-up');
    expect(localizeWodText('swings (2/1.5 pood)')).toBe('swings (32/24 kg)');
    expect(localizeWodText('rope climbs (15 ft)')).toBe('rope climbs (4,6 m)');
    expect(localizeWodText('wall balls (10/9 ft)')).toBe('wall balls (3/2,7 m)');
    expect(localizeWodText('200 pies lunge')).toBe('60 m lunge');
    expect(localizeWodText('150 yard sprint')).toBe('135 m sprint');
    expect(localizeWodText('1 mile run')).toBe('1,6 km run');
    expect(localizeWodText('1 milla carrera')).toBe('1,6 km carrera');
  });

  it('no toca lo que ya está en unidades métricas ni números que no son medidas', () => {
    const text = 'AMRAP 15 min: 20 cal row, 400 m run, 30 pull-ups, 32/24 kg, 10 min de descanso, 2:00 on / 1:00 off, 3 in a row';
    expect(localizeWodText(text)).toBe(text);
    expect(localizeWodText('10 min de descanso y 21-15-9')).toBe('10 min de descanso y 21-15-9');
  });

  it('es idempotente', () => {
    const once = localizeWodText('thrusters (95/65 lb), box (24/20 in), 1 mile');
    expect(localizeWodText(once)).toBe(once);
  });

  it('en todo el catálogo no queda ninguna libra, pulgada, pood, pie ni milla sin convertir', () => {
    const left = /\b\d[\d.,/\- ]*\s*(?:lbs?|libras?|pood|inch(?:es)?|ft|feet|pies|yards?|miles?|millas?)\b/i;
    const texts = [...benchmarkWorkouts.map((w) => w.format), ...libraryWods.map((w) => w.original)];
    const bad = texts.map((t) => localizeWodText(t)).filter((t) => left.test(t));
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it('no inventa cifras: tras convertir, cada kilo está dentro de un 8 % de la carga original en libras', () => {
    const lb = /(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*lb\b/;
    let checked = 0;
    for (const w of benchmarkWorkouts) {
      const m = w.format.match(lb);
      if (!m) continue;
      const out = localizeWodText(m[0]).match(/^(\d+(?:,\d+)?)\/(\d+(?:,\d+)?) kg$/);
      expect(out, `${w.id}: ${m[0]}`).not.toBeNull();
      const kg = (s: string) => Number(s.replace(',', '.'));
      for (const [kgText, lbText] of [[out![1], m[1]], [out![2], m[2]]]) {
        expect(Math.abs(kg(kgText) - Number(lbText) * 0.4536) / (Number(lbText) * 0.4536), `${w.id}: ${m[0]}`).toBeLessThan(0.08);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});
