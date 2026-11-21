import { describe, expect, it } from 'vitest';
import { EMPTY_WOD_FORM, bumpWodForm } from './wodScoring';

describe('bumpWodForm', () => {
  it('sube y baja sin pasar de cero', () => {
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, rounds: 6 }, 'rounds', 1)).toEqual({ rounds: 7 });
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, rounds: 0 }, 'rounds', -1)).toEqual({ rounds: 0 });
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, extraReps: 4 }, 'extraReps', -10)).toEqual({ extraReps: 0 });
  });

  it('los segundos se quedan entre 0 y 59', () => {
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, seconds: 55 }, 'seconds', 10)).toEqual({ seconds: 59 });
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, seconds: 3 }, 'seconds', -10)).toEqual({ seconds: 0 });
  });

  it('la carga va de cuarto en cuarto', () => {
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, load: 60 }, 'load', 2.5)).toEqual({ load: 62.5 });
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, load: 60.1 }, 'load', 0)).toEqual({ load: 60 });
  });

  it('un campo sin valor cuenta como cero', () => {
    expect(bumpWodForm({ ...EMPTY_WOD_FORM, reps: Number.NaN }, 'reps', 5)).toEqual({ reps: 5 });
  });
});
