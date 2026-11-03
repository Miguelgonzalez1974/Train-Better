import { describe, expect, it } from 'vitest';
import { dayBalance, type DayBalanceInput } from './dayBalance';
import { withPlannedStrain } from './strainTarget';
import type { AthleteProfile, StrainTarget } from '../data/athlete/types';

const base: DayBalanceInput = { planned: 65, real: 40, target: { low: 70, high: 90 }, status: 'por-debajo', isToday: true, prepMorning: 72, prepNow: 68 };

describe('balance del día cerrado', () => {
  it('partías con 65 y has hecho 40: −25, por debajo del objetivo, y la preparación bajó de 72 a 68', () => {
    const b = dayBalance(base)!;
    expect(b).toMatchObject({ planned: 65, real: 40, diff: -25, tone: 'info', prep: { morning: 72, now: 68 } });
    expect(b.lead).toBe('Has cerrado por debajo de tu objetivo.');
  });

  it('sin previsto anotado o sin sesión hecha no hay balance', () => {
    expect(dayBalance({ ...base, planned: null })).toBeNull();
    expect(dayBalance({ ...base, real: null, status: 'sin-entrenar' })).toBeNull();
  });

  it('el veredicto sigue al estado frente al objetivo, en presente hoy y en pasado otro día', () => {
    expect(dayBalance({ ...base, real: 80, status: 'dentro' })!.lead).toBe('Has cerrado dentro de tu objetivo.');
    expect(dayBalance({ ...base, real: 80, status: 'dentro', isToday: false })!.lead).toBe('Cerraste dentro de tu objetivo.');
    const over = dayBalance({ ...base, real: 104, status: 'pasado' })!;
    expect(over).toMatchObject({ lead: 'Te has pasado del objetivo.', tone: 'mid', diff: 39 });
    expect(dayBalance({ ...base, real: 104, status: 'pasado', isToday: false })!.lead).toBe('Te pasaste del objetivo.');
  });

  it('la preparación solo se compara hoy y solo si cambió', () => {
    expect(dayBalance({ ...base, prepNow: 72 })!.prep).toBeNull();
    expect(dayBalance({ ...base, isToday: false })!.prep).toBeNull();
    expect(dayBalance({ ...base, prepMorning: null })!.prep).toBeNull();
    // un decimal de diferencia que redondea igual no cuenta como cambio
    expect(dayBalance({ ...base, prepMorning: 71.6, prepNow: 72.2 })!.prep).toBeNull();
  });
});

describe('anotar el esfuerzo previsto en el objetivo del día', () => {
  const target: StrainTarget = { low: 60, high: 80, readiness: 72, yesterday: null, reasons: [], provisional: false, setOn: '2026-11-02' };
  const profile = { strainTargets: { '2026-11-02': target } } as unknown as AthleteProfile;

  it('anota el previsto y no toca el resto del objetivo', () => {
    const next = withPlannedStrain(profile, '2026-11-02', 65);
    expect(next.strainTargets?.['2026-11-02']).toEqual({ ...target, planned: 65 });
  });

  it('cambia el previsto si la sesión se ajusta antes de entrenar', () => {
    const once = withPlannedStrain(profile, '2026-11-02', 65);
    expect(withPlannedStrain(once, '2026-11-02', 55).strainTargets?.['2026-11-02']?.planned).toBe(55);
  });

  it('el mismo perfil si nada cambia: mismo previsto, sin previsto o sin objetivo de ese día', () => {
    const once = withPlannedStrain(profile, '2026-11-02', 65);
    expect(withPlannedStrain(once, '2026-11-02', 65)).toBe(once);
    expect(withPlannedStrain(profile, '2026-11-02', null)).toBe(profile);
    expect(withPlannedStrain(profile, '2026-11-03', 65)).toBe(profile);
  });
});
