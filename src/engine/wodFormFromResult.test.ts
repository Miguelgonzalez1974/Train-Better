import { describe, expect, it } from 'vitest';
import { buildWodResult, EMPTY_WOD_FORM, formFromWodResult } from './wodScoring';

describe('formFromWodResult: el resultado guardado vuelve al formulario', () => {
  it('es lo contrario de buildWodResult para cada tipo de marca', () => {
    const cases = [
      { type: 'time' as const, form: { ...EMPTY_WOD_FORM, minutes: 9, seconds: 5 } },
      { type: 'rounds+reps' as const, form: { ...EMPTY_WOD_FORM, rounds: 8, extraReps: 12 } },
      { type: 'rounds+reps' as const, form: { ...EMPTY_WOD_FORM, rounds: 6 } },
      { type: 'reps' as const, form: { ...EMPTY_WOD_FORM, reps: 185 } },
      { type: 'load' as const, form: { ...EMPTY_WOD_FORM, load: 70 } },
    ];
    for (const c of cases) expect(formFromWodResult(buildWodResult(c.type, c.form)), `${c.type} ${JSON.stringify(c.form)}`).toEqual(c.form);
  });

  it('un WOD no terminado (CAP) conserva lo que se hizo y el cap', () => {
    const capped = buildWodResult('time', { ...EMPTY_WOD_FORM, capped: true, rounds: 3, extraReps: 7, capSeconds: 720 });
    expect(formFromWodResult(capped)).toMatchObject({ capped: true, rounds: 3, extraReps: 7, capSeconds: 720 });
    expect(formFromWodResult(buildWodResult('time', { ...EMPTY_WOD_FORM, capped: true, rounds: 4 }))).toMatchObject({ capped: true, rounds: 4, extraReps: 0 });
  });

  it('sin resultado o con un valor que no se entiende, formulario vacío', () => {
    expect(formFromWodResult(undefined)).toEqual(EMPTY_WOD_FORM);
    expect(formFromWodResult({ scoreType: 'time', value: 'raro' })).toEqual(EMPTY_WOD_FORM);
  });
});
