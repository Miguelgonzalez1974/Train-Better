import { describe, expect, it } from 'vitest';
import { planFit, strainFit, type PlannedStrain } from './plannedStrain';

const target = { low: 53, high: 73 };

describe('dónde cae un esfuerzo respecto al objetivo', () => {
  it('dentro, o apenas fuera, cuenta como dentro (márgenes de 3 por arriba y 8 por debajo)', () => {
    expect(strainFit(53, target).fit).toBe('dentro');
    expect(strainFit(73, target).fit).toBe('dentro');
    expect(strainFit(76, target).fit).toBe('dentro');
    expect(strainFit(45, target).fit).toBe('dentro');
  });

  it('te pasas con más de 3 por encima y te quedas corto con más de 8 por debajo, con la diferencia', () => {
    expect(strainFit(77, target)).toEqual({ fit: 'se-pasa', diff: 4 });
    expect(strainFit(44, target)).toEqual({ fit: 'se-queda-corta', diff: 9 });
  });

  it('es la misma regla que la de la sesión de hoy (planFit)', () => {
    for (const strain of [30, 44, 45, 53, 60, 73, 76, 77, 90]) {
      const planned: PlannedStrain = { strain, rpe: 7, minutes: 60, bias: 0 };
      expect(strainFit(strain, target)).toEqual(planFit(planned, target));
    }
  });
});
