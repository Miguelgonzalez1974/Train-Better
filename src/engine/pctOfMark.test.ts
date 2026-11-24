import { describe, expect, it } from 'vitest';
import { getMovementById } from '../data/movements';
import { makeProfile } from './__fixtures';
import { pctOfMark } from './movementProgress';

describe('el % de tu 1RM junto a los kilos', () => {
  const prs = { ...makeProfile().prs, backSquat: 125 };

  it('kilos entre tu marca del levantamiento, redondeado', () => {
    const squat = getMovementById('back-squat');
    expect(pctOfMark(squat, 100, prs, undefined)).toBe(80);
    expect(pctOfMark(squat, 102.5, prs, undefined)).toBe(82);
  });

  it('sin marca, sin peso o sin movimiento no hay porcentaje', () => {
    expect(pctOfMark(getMovementById('back-squat'), 100, { ...prs, backSquat: 0 }, undefined)).toBeNull();
    expect(pctOfMark(getMovementById('back-squat'), 0, prs, undefined)).toBeNull();
    expect(pctOfMark(undefined, 100, prs, undefined)).toBeNull();
    expect(pctOfMark(getMovementById('plank'), 20, prs, undefined)).toBeNull();
  });
});
