import { describe, expect, it } from 'vitest';
import type { AthleteProfile, SessionHistoryEntry, WodScalingEntry } from '../data/athlete/types';
import { localAthleteRepository } from '../data/athlete/localRepository';
import { mergeProfile } from '../data/athlete/mergeProfile';
import { makeProfile } from './__fixtures';
import { allScaledResults, computeLevel, recentOfCategory, scaledResultsOfEntry, scalingOfPart, wodCategoryNeed } from './levelCategories';
import { computeReferenceLevel, type RefCategory } from './levelReference';
import { partFactor, partScaling } from './scaling';

const TODAY = new Date('2026-11-27T12:00:00');
const thruster = (loadKg?: number, rxKg: number | undefined = 43): WodScalingEntry => ({ movementId: 'thruster', kind: 'peso', ...(loadKg ? { loadKg } : {}), ...(rxKg ? { rxKg } : {}) });
const jumping: WodScalingEntry = { movementId: 'kipping-pull-up', kind: 'movimiento' };
const FRAN = ['thruster', 'kipping-pull-up'];
const fran = (value: string, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date: '2026-11-10',
  mesocycleWeek: 2,
  movementIds: ['benchmark:fran'],
  wodMovementIds: ['benchmark:fran'],
  wodCategories: { 1: 'velocidad' },
  rxOrScaled: 'scaled',
  wodScaling: [thruster(30), jumping],
  rpe: 9,
  durationMin: 20,
  wodResult: { scoreType: 'time', value },
  ...over,
});
const athlete = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({ ...makeProfile(), birthYear: 1974, bodyweightLog: [{ date: '2026-11-27', kg: 83 }], ...over });
const velocidad = (profile: AthleteProfile, history: SessionHistoryEntry[]) => computeLevel({ profile, history, today: TODAY }).categories.find((c) => c.key === 'velocidad')!;
const refFran = (profile: AthleteProfile, history: SessionHistoryEntry[]) => computeReferenceLevel({ profile, history, today: TODAY }).categories.find((c) => c.key === 'velocidad') as RefCategory;

describe('lo que vale un WOD escalado', () => {
  it('peso: kilos usados entre los del Rx; movimiento: 80 %; el WOD, la media', () => {
    expect(partFactor(FRAN, [thruster(30)])).toBe(0.85);
    expect(partFactor(FRAN, [jumping])).toBe(0.9);
    expect(partFactor(FRAN, [thruster(30), jumping])).toBe(0.75);
  });

  it('sin saber qué se cambió, o sin los kilos, no hay cifra', () => {
    expect(partFactor(FRAN, [])).toBeNull();
    expect(partFactor(FRAN, [thruster(undefined)])).toBeNull();
    expect(partFactor(FRAN, [thruster(30, 0)])).toBeNull();
    expect(partFactor(FRAN, [thruster(30), thruster(undefined)])).toBeNull();
  });

  it('nunca llega al Rx ni baja de lo mínimo por movimiento', () => {
    expect(partFactor(['thruster'], [thruster(60)])).toBe(0.99);
    expect(partFactor(['thruster'], [thruster(2.5)])).toBe(0.3);
  });

  it('en un doble WOD la parte sin nada anotado se hizo como estaba', () => {
    const entry = { rxOrScaled: 'scaled' as const, wodScaling: [{ ...jumping, part: 2 as const }] };
    expect(partScaling(entry, 1, ['row'])).toEqual({ kind: 'rx' });
    expect(partScaling(entry, 2, FRAN)).toEqual({ kind: 'scaled', factor: 0.9 });
    expect(partScaling({ rxOrScaled: 'scaled' }, 1, FRAN)).toEqual({ kind: 'sin-detalle' });
  });

  it('los movimientos salen del WOD de aquel día', () => {
    expect(scalingOfPart(fran('4:00'), 1)).toEqual({ kind: 'scaled', factor: 0.75 });
    expect(scaledResultsOfEntry(fran('4:00'), makeProfile().prs)).toMatchObject([{ category: 'velocidad', value: 240, factor: 0.75 }]);
    expect(scaledResultsOfEntry(fran('4:00', { wodScaling: [] }), makeProfile().prs)).toEqual([]);
    expect(scaledResultsOfEntry(fran('4:00', { rxOrScaled: 'rx', wodScaling: [] }), makeProfile().prs)).toEqual([]);
  });
});

describe('Progreso con escalados', () => {
  it('sin ningún Rx, la categoría puntúa lo que vale el escalado y queda como provisional', () => {
    expect(velocidad(athlete(), [fran('4:00')])).toMatchObject({ score: 75, scaled: true, confidence: 'provisional', results: 1 });
  });

  it('un Rx pasa por delante: el escalado no baja la nota', () => {
    const rx = fran('6:00', { date: '2026-11-20', rxOrScaled: 'rx', wodScaling: [] });
    const c = velocidad(athlete(), [fran('4:00'), rx]);
    expect(c).toMatchObject({ score: 100, results: 1 });
    expect(c.scaled).toBeUndefined();
  });

  it('sin detalle no cuenta, y se ofrece decir qué se escaló', () => {
    const undetailed = fran('4:00', { wodScaling: undefined });
    expect(velocidad(athlete(), [undetailed]).score).toBeNull();
    const [item] = recentOfCategory({ profile: athlete(), history: [undetailed], key: 'velocidad', today: TODAY });
    expect(item).toMatchObject({ counts: false, note: 'Escalado sin detalle: no cuenta', fix: { date: '2026-11-10', part: 1 } });
  });

  it('en los últimos entrenos dice cuánto vale', () => {
    const [item] = recentOfCategory({ profile: athlete(), history: [fran('4:00')], key: 'velocidad', today: TODAY });
    expect(item).toMatchObject({ counts: true, note: 'Escalado, vale el 75 %', value: '4:00' });
    expect(item.fix).toBeUndefined();
  });

  it('el coach sigue pidiendo un Rx: un escalado no completa la categoría', () => {
    expect(wodCategoryNeed(athlete(), [fran('4:00')], '2026-11-27')).toBeNull();
  });

  it('un día que ya salió del historial sigue contando desde el registro largo', () => {
    const logged = scaledResultsOfEntry(fran('4:00'), makeProfile().prs);
    expect(velocidad(athlete({ levelScaledLog: logged }), []).score).toBe(75);
    // Si el día sigue en el historial, manda el historial.
    expect(allScaledResults(athlete({ levelScaledLog: logged }), [fran('4:00', { wodScaling: [] })])).toEqual([]);
  });
});

describe('Nivel con un Fran escalado', () => {
  it('se cuenta el tiempo ajustado y no pasa de Novato', () => {
    const c = refFran(athlete(), [fran('4:00')]);
    expect(c).toMatchObject({ scaled: true, placement: { zone: 1 } });
    expect(c.marks[0]).toMatchObject({ value: '4:00', next: null });
    expect(c.marks[0].notes).toEqual(['Lo cuento como 5:20 por lo que escalaste (vale el 75 %).', 'Sería Intermedio, pero un escalado no pasa de Novato.', 'Haz uno en Rx para ver tu nivel real.']);
  });

  it('si queda por debajo del tope no se habla de tope', () => {
    const c = refFran(athlete(), [fran('7:00')]);
    expect(c.placement?.zone).toBe(0);
    expect(c.marks[0].notes).toHaveLength(2);
  });

  it('un Rx vigente manda', () => {
    const c = refFran(athlete({ levelTests: [{ date: '2026-11-20', key: 'fran', seconds: 420 }] }), [fran('4:00')]);
    expect(c.scaled).toBeUndefined();
    expect(c.marks[0].value).toBe('7:00');
  });

  it('un escalado guardado nunca se lee como Rx', () => {
    const logged = scaledResultsOfEntry(fran('4:00'), makeProfile().prs);
    const c = refFran(athlete({ levelLog: logged, levelScaledLog: logged }), []);
    expect(c.scaled).toBe(true);
  });
});

describe('decir después qué se escaló', () => {
  it('lo guarda en la entrada y en los registros largos, y se sincroniza', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
    const old = fran('4:00', { wodScaling: undefined });
    localAthleteRepository.saveProfile(athlete());
    localAthleteRepository.appendHistoryEntry(old);
    const scaling = [thruster(30), jumping];
    localAthleteRepository.updateHistoryScaling(old.date, scaling, scaledResultsOfEntry({ ...old, wodScaling: scaling }, makeProfile().prs));
    const [entry] = localAthleteRepository.getHistory();
    const profile = localAthleteRepository.getProfile();
    expect(entry.wodScaling).toEqual(scaling);
    expect(profile.levelScaledLog).toMatchObject([{ date: old.date, factor: 0.75 }]);
    expect(profile.wodLog).toMatchObject([{ date: old.date, scaling }]);
    expect(profile.levelLog ?? []).toEqual([]);
    expect(mergeProfile(athlete(), profile).levelScaledLog).toHaveLength(1);
    localAthleteRepository.deleteHistoryEntry(old.date);
    expect(localAthleteRepository.getProfile().levelScaledLog).toEqual([]);
  });
});
