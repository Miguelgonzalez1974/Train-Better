import { describe, expect, it } from 'vitest';
import { buildOlyWavePlan, OLY_WAVE_TEMPLATES, pickOlyWaveTemplate } from './olyWaves';

const T = OLY_WAVE_TEMPLATES[2][0]; // 5-3-1 en 2 olas

describe('plan de olas', () => {
  it('reproduce el ejemplo 5×50, 3×55, 1×60 y 5×55, 3×60, 1×65', () => {
    const plan = buildOlyWavePlan(65, T);
    expect(plan.setPlan).toEqual([
      { reps: 5, kg: 50 }, { reps: 3, kg: 55 }, { reps: 1, kg: 60 },
      { reps: 5, kg: 55 }, { reps: 3, kg: 60 }, { reps: 1, kg: 65 },
    ]);
    expect(plan.waveSize).toBe(3);
    expect(plan.stepKg).toBe(5);
  });

  it('la última serie de la última ola es la carga fuerte y la carga sube serie a serie dentro de cada ola', () => {
    for (const week of [1, 2, 3] as const) {
      for (const template of OLY_WAVE_TEMPLATES[week]) {
        const { setPlan, waveSize } = buildOlyWavePlan(80, template);
        expect(setPlan).toHaveLength(waveSize * template.waves);
        expect(setPlan[setPlan.length - 1].kg).toBe(80);
        for (let w = 0; w < template.waves; w++) {
          const wave = setPlan.slice(w * waveSize, (w + 1) * waveSize);
          expect(wave.map((s) => s.reps)).toEqual(template.reps);
          for (let i = 1; i < wave.length; i++) expect(wave[i].kg).toBeGreaterThanOrEqual(wave[i - 1].kg);
        }
      }
    }
  });

  it('cada ola arranca más alta que la anterior', () => {
    const { setPlan } = buildOlyWavePlan(70, OLY_WAVE_TEMPLATES[1][0]); // 3 olas
    const tops = [2, 5, 8].map((i) => setPlan[i].kg);
    expect(tops[1]).toBeGreaterThan(tops[0]);
    expect(tops[2]).toBeGreaterThan(tops[1]);
  });

  it('con una carga pequeña el escalón mínimo es de 2,5 kg', () => {
    expect(buildOlyWavePlan(30, T).stepKg).toBe(2.5);
  });
});

describe('sorteo de las olas', () => {
  const fixed = (...values: number[]) => {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  };

  it('en la descarga nunca hay olas, y el sorteo gasta lo mismo haya o no', () => {
    let calls = 0;
    const draw = () => {
      calls++;
      return 0;
    };
    expect(pickOlyWaveTemplate(4, draw)).toBeNull();
    expect(calls).toBe(2);
    calls = 0;
    pickOlyWaveTemplate(2, draw);
    expect(calls).toBe(2);
  });

  it('toca de vez en cuando: con un valor bajo sale una plantilla de su semana, con uno alto no', () => {
    expect(pickOlyWaveTemplate(1, fixed(0.1, 0))).toBe(OLY_WAVE_TEMPLATES[1][0]);
    expect(pickOlyWaveTemplate(3, fixed(0.1, 0.99))).toBe(OLY_WAVE_TEMPLATES[3][2]);
    expect(pickOlyWaveTemplate(2, fixed(0.9, 0))).toBeNull();
  });
});
