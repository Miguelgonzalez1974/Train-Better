import { describe, expect, it } from 'vitest';
import type { PainFlag, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';
import { addDays } from '../../engine/formCurve';
import type { AcwrResult } from '../../engine/loadMetrics';
import { makeProfile } from '../../engine/__fixtures';
import { buildFormCard } from './formCardModel';
import { buildFormModel } from './formModel';
import { loadPercent } from './loadWords';
import { shownChip } from './FormScreen';

const TODAY = '2026-11-25';
const session = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });
const history = Array.from({ length: 24 }, (_, i) => session(addDays(TODAY, -(i + 1) * 2)));
const check = (date: string, sleepHours: number) => ({ date, sleep: 'regular', soreness: 'ninguno', stress: 'bajo', motivation: 'alta', sleepHours }) as unknown as ReadinessCheck;
const profile = { ...makeProfile(), readinessLog: [check(TODAY, 6.5)] };
const acwr = (value: number | null, zone: AcwrResult['zone'] = 'optima'): AcwrResult => ({ acute: 100, chronic: 100, acwr: value, zone, coldStart: false });
const model = buildFormModel(profile, history, TODAY);
const card = (over: Partial<Parameters<typeof buildFormCard>[0]> = {}) => buildFormCard({ model, acwr: acwr(1.18), painFlags: [], dayIso: TODAY, ...over });

describe('la carga en porcentaje', () => {
  it('es la relación de carga dicha frente a lo normal, con la palabra del aro', () => {
    expect(loadPercent(acwr(1.18))).toEqual({ value: '+18 %', word: 'Óptima' });
    expect(loadPercent(acwr(0.7, 'baja'))).toEqual({ value: '−30 %', word: 'Baja' });
    expect(loadPercent(acwr(1, 'optima')).value).toBe('0 %');
  });

  it('sin historial suficiente no inventa cifra', () => {
    expect(loadPercent(acwr(null))).toEqual({ value: '—', word: null });
    expect(loadPercent({ ...acwr(1.6, 'alta'), coldStart: true })).toEqual({ value: '—', word: null });
  });
});

describe('la tarjeta Tu forma', () => {
  it('estado de energía, sueño, carga y molestias', () => {
    const c = card();
    expect(c.state?.title).toMatch(/^(A tope|Normal|Cansado)$/);
    expect(c.figures.map((f) => f.label)).toEqual(['sueño medio', 'carga óptima', 'molestias']);
    expect(c.figures[0].value).toMatch(/h/);
    expect(c.figures[1].value).toBe('+18 %');
    expect(c.figures[2]).toEqual({ value: 'Ninguna', label: 'molestias' });
    expect(c.line.warn).toBeUndefined();
  });

  it('una molestia activa pide atención en la cifra y en la última línea', () => {
    const flags: PainFlag[] = [
      { id: '1', area: 'hombro', createdDate: addDays(TODAY, -2), until: null },
      { id: '2', area: 'cadera-lumbar', createdDate: addDays(TODAY, -1), until: null },
    ];
    const c = card({ painFlags: flags });
    expect(c.figures[2]).toMatchObject({ label: 'molestias activas', warn: true });
    expect(c.figures[2].value).toMatch(/\+1$/);
    expect(c.line).toMatchObject({ icon: 'pain', warn: true });
  });

  it('un día pasado se cuenta como estabas', () => {
    expect(card({ dayIso: addDays(TODAY, -3) }).line).toEqual({ icon: 'info', text: 'Así llegabas ese día' });
  });

  it('con poco historial no da estado y dice cuánto llevas', () => {
    const poco = buildFormModel(makeProfile(), history.slice(0, 2), TODAY);
    const c = buildFormCard({ model: poco, acwr: acwr(null), painFlags: undefined, dayIso: TODAY });
    expect(c.state).toBeNull();
    expect(c.figures[0]).toEqual({ value: '—', label: 'sueño sin anotar' });
    expect(c.line.text).toBe('Aún poco historial: 2 sesiones registradas');
  });
});

describe('los chips', () => {
  it('en un día pasado no hay energía y se abre la preparación', () => {
    expect(shownChip('energia', false)).toBe('preparacion');
    expect(shownChip('sueno', false)).toBe('sueno');
    expect(shownChip('energia', true)).toBe('energia');
  });
});
