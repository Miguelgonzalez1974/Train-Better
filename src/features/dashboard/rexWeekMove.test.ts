import { describe, expect, it } from 'vitest';
import type { WeekMoveProposal } from '../../lib/weekCoach';
import { buildRexSuggestions, type RexContext } from './rexDashboard';
import { energyWord, weekMoveApplyLabel, weekMoveLead, weekMoveSentence, weekMoveSuggestion, weekMoveTitle } from './rexWeekMove';

const TODAY = '2026-03-09'; // lunes
const day = (iso: string, before: string, after: string, changed = false) => ({ iso, loadBefore: 60, loadAfter: 60, energyBefore: 40, energyAfter: 40, labelBefore: before, labelAfter: after, changed });
const proposal = (over: Partial<WeekMoveProposal> = {}): WeekMoveProposal =>
  ({
    weekKey: '2026-03-09',
    from: '2026-03-10',
    to: '2026-03-11',
    swap: true,
    sessionLabel: 'Deadlift',
    energyFrom: 38,
    energyTo: 66,
    gain: 28,
    typical: 55,
    days: [day('2026-03-10', 'Deadlift', 'Floor Press', true), day('2026-03-11', 'Floor Press', 'Deadlift', true)],
    reasons: ['a', 'b', 'c'],
    ...over,
  }) as WeekMoveProposal;

const ctx = (over: Partial<RexContext> = {}): RexContext => ({
  hour: 9,
  isToday: true,
  hasCheckIn: true,
  trainedToday: false,
  hasSessionToday: true,
  restMarked: false,
  weeklyReviewRange: null,
  emphasisReviewPending: false,
  nutritionPercent: null,
  streak: 0,
  goalsBehind: 0,
  painLabels: [],
  daysSinceWeight: 1,
  ...over,
});

describe('la propuesta de mover un día, en palabras de Rex', () => {
  it('la frase dice la sesión, los dos días y la energía de cada uno', () => {
    expect(weekMoveLead(proposal(), TODAY)).toBe('Mejor el miércoles.');
    const text = weekMoveSentence(proposal(), TODAY);
    // Hoy es lunes: el martes es «mañana», y un día más allá se dice «el miércoles» / «del jueves».
    expect(text).toContain('Deadlift de mañana');
    expect(weekMoveSentence(proposal({ from: '2026-03-12', to: '2026-03-13' }), TODAY)).toContain('Deadlift del jueves');
    expect(text).toContain('38');
    expect(text).toContain('66');
    expect(text).toContain('Misma sesión, mejor día');
  });

  it('el titular y el botón cambian si se intercambian dos sesiones o se pasa una a un descanso', () => {
    expect(weekMoveTitle(proposal())).toBe('Deadlift y Floor Press cambian de día');
    expect(weekMoveApplyLabel(proposal(), TODAY)).toBe('Cambiarlas de día');
    const rest = proposal({ swap: false, to: '2026-03-14', days: [day('2026-03-10', 'Deadlift', 'descanso', true)] });
    expect(weekMoveTitle(rest)).toBe('Deadlift a otro día');
    expect(weekMoveApplyLabel(rest, TODAY)).toBe('Pasarla al sábado');
  });

  it('la sugerencia lleva a la ficha y se puede dejar para luego', () => {
    const s = weekMoveSuggestion(proposal(), TODAY);
    expect(s.id).toBe('semana-mover');
    expect(s.actions[0].target).toBe('semana-mover');
    expect(s.dismissible).not.toBe(false);
    expect(s.text.startsWith(s.lead!)).toBe(true);
  });

  it('sale en la lista de Rex solo mirando hoy, delante del consejo del día y de la revisión de la semana', () => {
    const s = weekMoveSuggestion(proposal(), TODAY);
    expect(buildRexSuggestions(ctx({ weekMove: s })).map((x) => x.id)).toContain('semana-mover');
    expect(buildRexSuggestions(ctx({ weekMove: s, isToday: false, viewDay: { iso: '2026-03-08', label: 'Ayer', trained: false, rested: false, strain: null, low: null, high: null } })).map((x) => x.id)).not.toContain('semana-mover');
    const ids = buildRexSuggestions(ctx({ weekMove: s, weeklyReviewRange: '2 mar al 8 mar', emphasisReviewPending: true })).map((x) => x.id);
    expect(ids.indexOf('semana-mover')).toBeLessThan(ids.indexOf('semana'));
    expect(ids.indexOf('semana')).toBeLessThan(ids.indexOf('enfasis'));
    // El check-in de la mañana sigue yendo primero.
    expect(buildRexSuggestions(ctx({ weekMove: s, hasCheckIn: false })).map((x) => x.id)[0]).toBe('checkin');
    // Y delante del consejo de hoy.
    const advice = { lead: 'Entrena.', reason: 'Vas bien.', tone: 'good' as const, overTarget: false };
    const withAdvice = buildRexSuggestions(ctx({ weekMove: s, advice })).map((x) => x.id);
    expect(withAdvice.indexOf('semana-mover')).toBeLessThan(withAdvice.indexOf('consejo'));
  });

  it('la energía se cuenta como a tope, normal o cansado', () => {
    expect(energyWord(80)).toBe('a tope');
    expect(energyWord(50)).toBe('normal');
    expect(energyWord(15)).toBe('cansado');
  });
});
