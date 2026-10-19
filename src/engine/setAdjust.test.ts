import { describe, it, expect } from 'vitest';
import { adjustRemainingSets } from './setAdjust';

const base = { prescribedKg: 100, canRaise: true, sets: 5 };

describe('autorregulación en la sesión: peso de las series que quedan', () => {
  it('sobró sube 2,5 kg, justo mantiene, duro baja 2,5 kg y muy duro baja un 5 % y sugiere quitar la última', () => {
    expect(adjustRemainingSets({ ...base, feel: 'sobro' })).toMatchObject({ kg: 102.5, deltaKg: 2.5, dropLastSet: false, message: 'Subo 2,5 kg en las series que quedan (tope +5 %).' });
    expect(adjustRemainingSets({ ...base, feel: 'justo' })).toMatchObject({ kg: 100, deltaKg: 0, message: 'Sigues como estaba previsto.' });
    expect(adjustRemainingSets({ ...base, feel: 'duro' })).toMatchObject({ kg: 97.5, deltaKg: -2.5, message: 'Bajo 2,5 kg en las series que quedan.' });
    expect(adjustRemainingSets({ ...base, feel: 'muy-duro' })).toMatchObject({ kg: 95, deltaKg: -5, dropLastSet: true, message: 'Bajo 5 kg (un 5 %) y puedes quitar la última serie: hoy no es el día.' });
  });

  it('nunca se mueve más de un 5 % sobre lo previsto, aunque el peso sea pequeño', () => {
    // 40 kg: el 5 % son 2 kg, menos que el paso de 2,5
    const up = adjustRemainingSets({ prescribedKg: 40, feel: 'sobro', canRaise: true, sets: 4 });
    expect(up.kg).toBe(42);
    expect(up.deltaKg).toBeLessThanOrEqual(2);
    expect(adjustRemainingSets({ prescribedKg: 40, feel: 'muy-duro', canRaise: true, sets: 4 }).kg).toBe(38);
    for (const feel of ['sobro', 'duro', 'muy-duro'] as const) {
      const r = adjustRemainingSets({ prescribedKg: 160, feel, canRaise: true, sets: 5 });
      expect(Math.abs(r.deltaKg)).toBeLessThanOrEqual(160 * 0.05 + 0.25);
    }
  });

  it('si hoy no es día de subir (ámbar o molestia), un "me sobró" no sube nada y lo explica', () => {
    const r = adjustRemainingSets({ ...base, feel: 'sobro', canRaise: false });
    expect(r).toMatchObject({ kg: 100, deltaKg: 0 });
    expect(r.message).toContain('hoy no subo la carga');
    // bajar sí se puede siempre
    expect(adjustRemainingSets({ ...base, feel: 'duro', canRaise: false }).kg).toBe(97.5);
  });

  it('quitar la última serie solo se sugiere con tres o más series', () => {
    expect(adjustRemainingSets({ prescribedKg: 100, feel: 'muy-duro', canRaise: true, sets: 2 }).dropLastSet).toBe(false);
    expect(adjustRemainingSets({ prescribedKg: 100, feel: 'muy-duro', canRaise: true, sets: 3 }).dropLastSet).toBe(true);
    expect(adjustRemainingSets({ prescribedKg: 100, feel: 'duro', canRaise: true, sets: 5 }).dropLastSet).toBe(false);
  });

  it('sin peso previsto no hay nada que ajustar', () => {
    expect(adjustRemainingSets({ prescribedKg: 0, feel: 'sobro', canRaise: true, sets: 3 })).toEqual({ kg: 0, deltaKg: 0, dropLastSet: false, message: '' });
  });

  it('los pesos sugeridos van en saltos de medio kilo', () => {
    for (const kg of [52.5, 67.5, 83, 117.5, 142]) {
      for (const feel of ['sobro', 'duro', 'muy-duro'] as const) {
        const r = adjustRemainingSets({ prescribedKg: kg, feel, canRaise: true, sets: 4 });
        expect((r.kg * 2) % 1, `${kg} ${feel}`).toBe(0);
      }
    }
  });
});
