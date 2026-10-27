import { describe, expect, it } from 'vitest';
import { learnHardness, personalHardnessNote, suggestHardness, toleranceFor } from './hardnessLearning';
import { hardnessAdvice } from './hardness';
import { makeProfile } from './__fixtures';
import type { HardnessLogEntry, SessionHistoryEntry, StrainTarget } from '../data/athlete/types';
import { strainFromSrpe } from './strain';

const TODAY = '2026-04-30';
const day = (offset: number) => {
  const d = new Date(`2026-03-01T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const target = (readiness: number | null, low = 45, high = 65): StrainTarget => ({ low, high, readiness, yesterday: null, reasons: [], provisional: false, setOn: '' });
const entryFor = (date: string, srpe: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: Math.round(srpe / 7) });
/** Una sesión con un esfuerzo real aproximado (`strain` 0-100) deshaciendo la curva. */
const withStrain = (date: string, strain: number): SessionHistoryEntry => {
  for (let srpe = 50; srpe < 2000; srpe += 7) if (strainFromSrpe(srpe) >= strain) return { ...entryFor(date, srpe), durationMin: Math.round(srpe / 7) };
  return entryFor(date, 400);
};
const log = (date: string, over: Partial<HardnessLogEntry> = {}): HardnessLogEntry => ({ date, level: 1, mode: 'volume', situation: 'normal', predicted: 58, targetLow: 45, targetHigh: 65, readiness: 78, ...over });

/** Un perfil con 12 días normales (preparación del día siguiente = `normalNext`) y varios días con la dureza subida. */
function scenario(hard: { offset: number; real: number; nextReadiness: number; over?: Partial<HardnessLogEntry> }[], normalNext = 80) {
  const history: SessionHistoryEntry[] = [];
  const strainTargets: Record<string, StrainTarget> = {};
  for (let i = 0; i < 12; i++) {
    history.push(withStrain(day(i * 2), 55));
    strainTargets[day(i * 2 + 1)] = target(normalNext);
  }
  const hardness: Record<string, 0 | 1 | 2> = {};
  const hardnessLog: HardnessLogEntry[] = [];
  for (const h of hard) {
    const date = day(h.offset);
    history.push(withStrain(date, h.real));
    strainTargets[day(h.offset + 1)] = target(h.nextReadiness);
    hardness[date] = (h.over?.level ?? 1) as 1 | 2;
    hardnessLog.push(log(date, h.over));
  }
  return { profile: makeProfile({ hardness, hardnessLog, strainTargets }), history };
}

describe('lo que aprende el coach de la dureza', () => {
  it('con pocos días subidos no dice nada', () => {
    const { profile, history } = scenario([{ offset: 40, real: 60, nextReadiness: 79 }, { offset: 42, real: 62, nextReadiness: 80 }]);
    const l = learnHardness(profile, history, TODAY);
    expect(toleranceFor(l, 'normal', 1).tier).toBe('sin-datos');
    expect(personalHardnessNote(l, 'normal', 1)).toBeNull();
    expect(l.bias).toBe(0);
  });

  it('si lo aguantas (esfuerzo dentro y mismo estado al día siguiente) sale «aguanta» y se sugiere subir con margen', () => {
    const { profile, history } = scenario([40, 42, 44, 46].map((offset) => ({ offset, real: 60, nextReadiness: 79 })));
    const l = learnHardness(profile, history, TODAY);
    const t = toleranceFor(l, 'normal', 1);
    expect(t).toMatchObject({ n: 4, bien: 4, tier: 'aguanta' });
    expect(personalHardnessNote(l, 'normal', 1)?.line).toMatch(/4 veces.*salió bien \(4 de 4\)/);
    const s = suggestHardness({ learning: l, situation: 'normal', light: 'verde', offered: true, planned: 52, target: { low: 45, high: 65 }, todayIso: TODAY });
    expect(s?.level).toBe(1);
    // Sin margen, con ámbar o con la dureza ya subida no se sugiere.
    expect(suggestHardness({ learning: l, situation: 'normal', light: 'verde', offered: true, planned: 62, target: { low: 45, high: 65 }, todayIso: TODAY })).toBeNull();
    expect(suggestHardness({ learning: l, situation: 'normal', light: 'ambar', offered: true, planned: 50, target: { low: 45, high: 65 }, todayIso: TODAY })).toBeNull();
    expect(suggestHardness({ learning: l, situation: 'normal', light: 'verde', offered: false, planned: 50, target: { low: 45, high: 65 }, todayIso: TODAY })).toBeNull();
    // Otra situación sin datos propios tampoco.
    expect(suggestHardness({ learning: l, situation: 'taper', light: 'verde', offered: true, planned: 40, target: { low: 30, high: 45 }, todayIso: TODAY })).toBeNull();
  });

  it('si al día siguiente llegas por debajo de lo normal, lo paga: sale «paga» con lo que bajó y el aviso sube de tono', () => {
    const { profile, history } = scenario([40, 42, 44].map((offset) => ({ offset, real: 62, nextReadiness: 60 })));
    const l = learnHardness(profile, history, TODAY);
    const t = toleranceFor(l, 'normal', 1);
    expect(t.tier).toBe('paga');
    expect(t.caro).toBe(3);
    expect(t.avgDrop).toBe(20);
    const note = personalHardnessNote(l, 'normal', 1)!;
    expect(note.tier).toBe('paga');
    expect(note.line).toMatch(/3 de las últimas 3 veces.*lo pagaste.*20 puntos/);
    const advice = hardnessAdvice(1, { light: 'verde', phase: null, daysToEvent: null, deload: false }, 'dentro', note);
    expect(advice).toMatchObject({ tone: 'strong', confirm: true });
    expect(advice.personal).toBe(note.line);
    expect(hardnessAdvice(2, { light: 'verde', phase: null, daysToEvent: null, deload: false }, 'dentro', { tier: 'paga', line: 'x' }).title).toBe('Mejor no');
    // Y no se sugiere nada.
    expect(suggestHardness({ learning: l, situation: 'normal', light: 'verde', offered: true, planned: 50, target: { low: 45, high: 65 }, todayIso: TODAY })).toBeNull();
  });

  it('pasarte mucho del objetivo cuenta como caro aunque no sepamos cómo llegaste al día siguiente', () => {
    const { profile, history } = scenario([40, 42, 44].map((offset) => ({ offset, real: 80, nextReadiness: 80 })));
    const l = learnHardness(profile, history, TODAY);
    expect(l.outcomes.every((o) => o.verdict === 'caro')).toBe(true);
  });

  it('cada situación y nivel se cuenta aparte, y si en una no hay muestra se mira el nivel en general', () => {
    const rows = [40, 42, 44].map((offset) => ({ offset, real: 60, nextReadiness: 79 }));
    const { profile, history } = scenario([...rows, { offset: 46, real: 60, nextReadiness: 79, over: { situation: 'taper' } }]);
    const l = learnHardness(profile, history, TODAY);
    expect(toleranceFor(l, 'normal', 1).n).toBe(3);
    expect(toleranceFor(l, 'taper', 1).n).toBe(1);
    expect(personalHardnessNote(l, 'taper', 1)?.line).toMatch(/en general/);
  });

  it('un día subido que luego volvió a normal no cuenta, ni los pendientes', () => {
    const { profile, history } = scenario([40, 42, 44].map((offset) => ({ offset, real: 60, nextReadiness: 79 })));
    const reset = { ...profile, hardness: { ...profile.hardness, [day(44)]: 0 as const } };
    expect(learnHardness(reset, history, TODAY).outcomes).toHaveLength(2);
    const future = { ...profile, hardnessLog: [...(profile.hardnessLog ?? []), log('2026-05-10')], hardness: { ...profile.hardness, '2026-05-10': 1 as const } };
    expect(learnHardness(future, history, TODAY).outcomes.find((o) => o.date === '2026-05-10')?.verdict).toBe('pendiente');
    expect(learnHardness(future, history, TODAY).evaluated).toBe(3);
  });

  it('la previsión se corrige con lo que sale de más o de menos en tus días subidos, con tope', () => {
    const { profile, history } = scenario([40, 42, 44, 46].map((offset) => ({ offset, real: 66, nextReadiness: 79 })));
    // Previsto 58, real ~66: sale 8 por encima.
    const l = learnHardness(profile, history, TODAY);
    expect(l.biasSample).toBe(4);
    expect(l.bias).toBeGreaterThan(5);
    expect(l.bias).toBeLessThanOrEqual(8);
  });
});
