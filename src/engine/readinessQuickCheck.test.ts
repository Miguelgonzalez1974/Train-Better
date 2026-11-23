import { describe, it, expect } from 'vitest';
import { checkFromQuickAnswer, getReadinessFactor, scoreCheck } from './readiness';

const D = '2026-10-13';

describe('check-in rápido', () => {
  it('Bien sube la carga un poco', () => {
    const c = checkFromQuickAnswer(D, 'bien', []);
    expect(scoreCheck(c)).toBe(4);
    expect(getReadinessFactor(c).factor).toBeGreaterThan(1);
  });

  it('Normal sin marcar nada es neutro', () => {
    const c = checkFromQuickAnswer(D, 'normal', []);
    expect(scoreCheck(c)).toBe(0);
    expect(getReadinessFactor(c).factor).toBe(1);
  });

  it('Normal con un solo eje marcado no baja la carga', () => {
    const c = checkFromQuickAnswer(D, 'normal', ['sleep']);
    expect(c.sleep).toBe('mal');
    expect(scoreCheck(c)).toBe(-1);
    expect(getReadinessFactor(c).factor).toBe(1);
  });

  it('Normal con dos ejes marcados ya cuenta como poca energía', () => {
    const c = checkFromQuickAnswer(D, 'normal', ['sleep', 'stress']);
    expect(getReadinessFactor(c).isLow).toBe(true);
  });

  it('Mal siempre baja la carga, aunque no marques nada o marques uno', () => {
    expect(getReadinessFactor(checkFromQuickAnswer(D, 'mal', [])).isLow).toBe(true);
    const one = checkFromQuickAnswer(D, 'mal', ['soreness']);
    expect(one.soreness).toBe('alto');
    expect(getReadinessFactor(one).isLow).toBe(true);
  });

  it('las horas de sueño solo se guardan si marcaste Sueño', () => {
    expect(checkFromQuickAnswer(D, 'normal', ['sleep'], 5.5).sleepHours).toBe(5.5);
    expect(checkFromQuickAnswer(D, 'normal', ['stress'], 5.5).sleepHours).toBeUndefined();
    expect(checkFromQuickAnswer(D, 'bien', [], 8).sleepHours).toBeUndefined();
  });
});
