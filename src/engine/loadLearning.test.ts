import { describe, expect, it } from 'vitest';
import type { PersonalRecords, SetFeedbackEntry } from '../data/athlete/types';
import { buildLoadRows } from './loadLearning';
import { NEUTRAL_RESPONSE_PROFILE, type ResponseProfile } from './responseProfile';

const prs: PersonalRecords = { backSquat: 170, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 };
const profile = (over: Partial<ResponseProfile>): ResponseProfile => ({ ...NEUTRAL_RESPONSE_PROFILE, ...over });
const entry = (prKey: string, estimated1rm?: number): SetFeedbackEntry => ({
  date: '2026-10-01',
  movementId: 'x',
  block: 'strength',
  prescribedKg: 136,
  prescribedReps: 5,
  prescribedSets: 4,
  feel: 'justo',
  prKey,
  pctOf1rm: 0.8,
  estimated1rm,
});

describe('tus cargas (lo que el coach ha aprendido)', () => {
  it('sin datos: un renglón por levantamiento con PR, sin ajuste, y dice cuántas series faltan', () => {
    const rows = buildLoadRows(prs, profile({}), [entry('backSquat', 175)]);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.source === null && r.adjustPct === 0)).toBe(true);
    const squat = rows.find((r) => r.key === 'backSquat')!;
    expect(squat.have).toBe(1);
    expect(squat.text).toContain('faltan 2 series');
  });

  it('con series reales enseña la referencia, el 1RM estimado y cuánto sube o baja el coach', () => {
    const rows = buildLoadRows(
      prs,
      profile({
        perLiftLoad: [
          { key: 'backSquat', label: 'Back Squat', measuredMax: 178.4, assumedMax: 170, samples: 5, loadFactor: 1.049 },
          { key: 'benchPress', label: 'Bench Press', measuredMax: 104, assumedMax: 110, samples: 4, loadFactor: 0.945 },
          { key: 'deadlift', label: 'Deadlift', measuredMax: 200, assumedMax: 200, samples: 3, loadFactor: 1 },
        ],
      }),
    );
    const squat = rows.find((r) => r.key === 'backSquat')!;
    expect(squat).toMatchObject({ source: 'series', reference: 170, estimated: 178, adjustPct: 5, direction: 'sube', samples: 5 });
    expect(squat.text).toContain('sube las cargas un 5 %');
    const bench = rows.find((r) => r.key === 'benchPress')!;
    expect(bench).toMatchObject({ adjustPct: -6, direction: 'baja' });
    expect(bench.text).toContain('baja las cargas un 6 %');
    expect(rows.find((r) => r.key === 'deadlift')).toMatchObject({ direction: 'igual', adjustPct: 0 });
  });

  it('con solo la valoración de la 1ª serie no hay 1RM estimado y se dice de dónde sale el ajuste', () => {
    const rows = buildLoadRows(prs, profile({ setFeel: [{ key: 'strictPress', label: 'Strict Press', feelBias: 1, observations: 5, loadFactor: 0.97 }] }));
    const press = rows.find((r) => r.key === 'strictPress')!;
    expect(press).toMatchObject({ source: 'sensacion', estimated: null, reference: 65, adjustPct: -3, direction: 'baja', samples: 5 });
    expect(press.text).toContain('cómo valoras tu primera serie');
  });

  it('si un levantamiento tiene las dos señales gana la de las series reales (como en el motor)', () => {
    const rows = buildLoadRows(
      prs,
      profile({
        perLiftLoad: [{ key: 'backSquat', label: 'Back Squat', measuredMax: 180, assumedMax: 170, samples: 4, loadFactor: 1.05 }],
        setFeel: [{ key: 'backSquat', label: 'Back Squat', feelBias: 1, observations: 6, loadFactor: 0.97 }],
      }),
    );
    expect(rows.find((r) => r.key === 'backSquat')).toMatchObject({ source: 'series', direction: 'sube' });
  });

  it('un cambio de menos de un 1 % no cuenta como ajuste; los renglones con ajuste van primero, el mayor cambio arriba', () => {
    const rows = buildLoadRows(
      prs,
      profile({
        perLiftLoad: [
          { key: 'deadlift', label: 'Deadlift', measuredMax: 201, assumedMax: 200, samples: 3, loadFactor: 1.004 },
          { key: 'clean', label: 'Clean', measuredMax: 120, assumedMax: 115, samples: 3, loadFactor: 1.043 },
        ],
      }),
    );
    expect(rows[0].key).toBe('clean');
    expect(rows[1]).toMatchObject({ key: 'deadlift', direction: 'igual', adjustPct: 0 });
    expect(rows.slice(2).every((r) => r.source === null)).toBe(true);
  });

  it('los levantamientos sin PR no salen', () => {
    const rows = buildLoadRows({ ...prs, snatch: 0 }, profile({}));
    expect(rows.map((r) => r.key)).not.toContain('snatch');
  });
});
