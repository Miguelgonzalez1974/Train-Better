import { describe, expect, it } from 'vitest';
import { makeProfile } from '../../engine/__fixtures';
import { localAthleteRepository } from './localRepository';
import { mergeProfile } from './mergeProfile';
import { stampPrChanges } from './prSync';
import type { AthleteProfile, PrLogEntry } from './types';

const athlete = (snatch: number, over: Partial<AthleteProfile> = {}): AthleteProfile => {
  const p = makeProfile({ onboardedAt: '2026-01-01' });
  return { ...p, prs: { ...p.prs, snatch }, ...over };
};
const log = (...entries: [string, number][]): PrLogEntry[] => entries.map(([date, kg]) => ({ date, key: 'snatch', kg }));
const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
/** Lo que queda tras sincronizar un dispositivo (local) con lo remoto, en los dos sentidos. */
const both = (a: AthleteProfile, b: AthleteProfile) => [mergeProfile(a, b).prs.snatch, mergeProfile(b, a).prs.snatch];

describe('las marcas al sincronizar', () => {
  it('un récord apuntado en un dispositivo no lo borra otro con la marca antigua, sincronice quien sincronice', () => {
    const phone = athlete(65, { prsAt: { snatch: ms('2026-11-27') }, prLog: log(['2026-08-30', 50], ['2026-11-27', 65]) });
    const desktop = athlete(50, { prLog: log(['2026-08-30', 50]) });
    expect(both(phone, desktop)).toEqual([65, 65]);
  });

  it('recupera un récord que ya se había pisado: sin sellos manda el último cambio apuntado', () => {
    const overwritten = athlete(50, { prLog: log(['2026-08-30', 50], ['2026-11-27', 65]) });
    const merged = mergeProfile(overwritten, overwritten);
    expect(merged.prs.snatch).toBe(65);
    expect(merged.prsAt?.snatch).toBeGreaterThan(0);
    expect(merged.variantPrs).toEqual(overwritten.variantPrs);
  });

  it('una corrección a la baja se queda', () => {
    const corrected = athlete(60, { prsAt: { snatch: ms('2026-11-28') }, prLog: log(['2026-11-27', 65], ['2026-11-28', 60]) });
    const stale = athlete(65, { prsAt: { snatch: ms('2026-11-27') }, prLog: log(['2026-11-27', 65]) });
    expect(both(corrected, stale)).toEqual([60, 60]);
  });

  it('un cambio posterior hecho con la versión antigua (sin sello) también gana', () => {
    const stamped = athlete(65, { prsAt: { snatch: ms('2026-11-27') }, prLog: log(['2026-11-27', 65]) });
    const oldApp = athlete(67.5, { prLog: log(['2026-11-29', 67.5]) });
    expect(both(stamped, oldApp)).toEqual([67.5, 67.5]);
  });

  it('una marca borrada no resucita', () => {
    const base = athlete(50);
    const removed = { ...base, variantPrs: { powerSnatch: 0 }, prsAt: { powerSnatch: ms('2026-11-28') }, prLog: [{ date: '2026-08-30', key: 'powerSnatch', kg: 60 }] };
    const old = { ...base, variantPrs: { powerSnatch: 60 }, prLog: removed.prLog };
    expect(mergeProfile(old, removed).variantPrs?.powerSnatch).toBe(0);
    expect(mergeProfile(removed, old).variantPrs?.powerSnatch).toBe(0);
  });

  it('sin sellos ni registro sigue ganando el dispositivo que sincroniza, y uno recién instalado cede', () => {
    expect(mergeProfile(athlete(60), athlete(55)).prs.snatch).toBe(55);
    const fresh = { ...athlete(20), onboardedAt: undefined };
    expect(mergeProfile(athlete(60), fresh).prs.snatch).toBe(60);
  });

  it('al guardar solo se sella lo que cambia, y no se vuelve a sellar lo que llega de una fusión', () => {
    const before = athlete(50);
    expect(stampPrChanges(before, athlete(50), 1000)).toBeUndefined();
    expect(stampPrChanges(before, athlete(65), 1000)).toEqual({ snatch: 1000 });
    expect(stampPrChanges(before, athlete(65, { prsAt: { snatch: 500 } }), 1000)).toEqual({ snatch: 500 });
    // Una pantalla con datos viejos que guarda otra marca: cuenta como cambio de ahora.
    expect(stampPrChanges(athlete(65, { prsAt: { snatch: 900 } }), athlete(60, { prsAt: { snatch: 500 } }), 1000)).toEqual({ snatch: 1000 });
  });

  it('el repositorio sella al guardar y la sincronización lo respeta', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
    localAthleteRepository.saveProfile(athlete(50));
    localAthleteRepository.saveProfile({ ...localAthleteRepository.getProfile(), prs: { ...athlete(65).prs } });
    const saved = localAthleteRepository.getProfile();
    expect(saved.prsAt?.snatch).toBeGreaterThan(0);
    const stale = athlete(50, { prLog: log(['2026-08-30', 50]) });
    localAthleteRepository.saveProfile(mergeProfile(saved, stale));
    expect(localAthleteRepository.getProfile().prs.snatch).toBe(65);
    expect(localAthleteRepository.getProfile().prsAt?.snatch).toBe(saved.prsAt?.snatch);
  });
});
