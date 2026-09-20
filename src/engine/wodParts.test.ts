import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateSessionForDate, toHistoryEntry } from './generateSession';
import { setDoubleWodEnabled } from './periodization';
import { getWodParts, getWodScoreType, isMeaningfulWodResult, wodResultsOf } from './wodScoring';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { mergeHistory } from '../data/athlete/mergeProfile';
import { getLibraryWod } from '../data/library/libraryWods';
import type { DailySession, SessionHistoryEntry, WodResult } from '../data/athlete/types';

/** Puntuacion por parte en un dia de doble WOD (fase 3): cada parte pide su resultado, y el historial guarda los dos. */

function doubleSessions(): DailySession[] {
  const out: DailySession[] = [];
  for (const id of ['a', 'b', 'c']) {
    const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    for (const d of consecutiveDates('2026-01-05', 168)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (s.doubleWod) out.push(s);
    }
  }
  return out;
}

const time: WodResult = { scoreType: 'time', value: '9:30' };
const rounds: WodResult = { scoreType: 'rounds+reps', value: '6+4' };

describe('WOD por partes', () => {
  let doubles: DailySession[] = [];
  let normal: DailySession;

  beforeAll(() => {
    setDoubleWodEnabled(true);
    doubles = doubleSessions();
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })] });
    normal = generateSessionForDate(profile, [], consecutiveDates('2026-01-13', 1)[0], profile.goals);
  });
  afterAll(() => setDoubleWodEnabled(false));

  it('un dia normal tiene una sola parte y su tipo de puntuacion no cambia', () => {
    expect(getWodParts(normal)).toEqual([1]);
    expect(getWodScoreType(normal)).toBe(getWodScoreType(normal, 1));
    expect(getWodScoreType(normal, 2)).toBeNull();
    expect(getWodScoreType({ ...normal, blocks: normal.blocks.filter((b) => b.block !== 'wod') })).toBeNull();
    expect(getWodParts({ ...normal, blocks: [] })).toEqual([]);
  });

  it('un dia doble tiene dos partes, y cada una se puntua segun su propio formato (la 2, segun el WOD real)', () => {
    expect(doubles.length, 'no salio ningun doble').toBeGreaterThan(10);
    const bad: string[] = [];
    for (const s of doubles) {
      if (JSON.stringify(getWodParts(s)) !== '[1,2]') bad.push(`${s.date}: partes ${getWodParts(s)}`);
      const t1 = getWodScoreType(s, 1);
      const t2 = getWodScoreType(s, 2);
      if (!t1 || !t2) {
        bad.push(`${s.date}: parte sin tipo de puntuacion`);
        continue;
      }
      const lib = getLibraryWod(s.blocks.find((b) => b.wodPart === 2)?.wodLibraryId ?? '');
      if (lib) {
        // El WOD real se puntua como dice su tipo (For Time -> tiempo, AMRAP -> rondas, EMOM/max -> reps).
        if (t2 !== lib.scoreType) bad.push(`${s.date}: parte 2 ${t2} != ${lib.scoreType}`);
      }
    }
    expect(bad).toEqual([]);
    // Y en algun doble las dos partes se puntuan distinto (rondas por tiempo + AMRAP, etc.).
    expect(doubles.some((s) => getWodScoreType(s, 1) !== getWodScoreType(s, 2))).toBe(true);
  });

  it('resultados: solo cuentan los rellenados, por parte, y "0:00" / "0+0" / "0" son un formulario vacio', () => {
    expect(isMeaningfulWodResult(undefined)).toBe(false);
    for (const v of ['0:00', '0+0', '0']) expect(isMeaningfulWodResult({ scoreType: 'time', value: v }), v).toBe(false);
    for (const v of ['9:30', '6+4', '185 reps', '70 kg']) expect(isMeaningfulWodResult({ scoreType: 'time', value: v }), v).toBe(true);
    const base = { date: '2026-01-16', mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 } as SessionHistoryEntry;
    expect(wodResultsOf(base)).toEqual([]);
    expect(wodResultsOf({ ...base, wodResult: time })).toEqual([{ part: 1, result: time }]);
    expect(wodResultsOf({ ...base, wodResult: time, wodResult2: rounds })).toEqual([
      { part: 1, result: time },
      { part: 2, result: rounds },
    ]);
    expect(wodResultsOf({ ...base, wodResult: { scoreType: 'time', value: '0:00' }, wodResult2: rounds })).toEqual([{ part: 2, result: rounds }]);
  });

  it('el historial guarda los dos resultados y la banda base es la de la parte 1, nunca la del WOD real', () => {
    const withTarget = doubles.find((s) => s.blocks.some((b) => b.wodPart === 1 && b.wodTarget && b.wodTarget.high > 0));
    expect(withTarget, 'ningun doble con objetivo en la parte 1').toBeTruthy();
    const entry = toHistoryEntry(withTarget!, 'rx', 8, 70, time, undefined, rounds);
    expect(entry.wodResult).toEqual(time);
    expect(entry.wodResult2).toEqual(rounds);
    expect(entry.wodTargetBase?.kind).not.toBe('library');
    expect(entry.wodFormatKind).not.toBe('library');
    expect(entry.wodLibraryId, 'la parte 2 es el WOD real').toBeTruthy();
    // Sin resultado de la parte 2 no se crea la clave.
    expect('wodResult2' in toHistoryEntry(withTarget!, 'rx', 8, 70, time)).toBe(false);
    // Un dia normal no cambia.
    expect('wodResult2' in toHistoryEntry(normal, 'rx', 8, 70, time)).toBe(false);
  });

  it('al sincronizar dos dispositivos gana la entrada con mas informacion, contando el resultado de la parte 2', () => {
    const base = { date: '2026-01-16', mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 } as SessionHistoryEntry;
    const partial = { ...base, wodResult: time };
    const full = { ...base, wodResult: time, wodResult2: rounds };
    expect(mergeHistory([full], [partial])[0].wodResult2).toEqual(rounds);
    expect(mergeHistory([partial], [full])[0].wodResult2).toEqual(rounds);
  });
});
