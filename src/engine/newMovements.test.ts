import { describe, it, expect } from 'vitest';
import { generateSessionForDate, WARMUP_TAG_BY_PATTERN } from './generateSession';
import { WOD_PAIR_AFFINITY } from './wodDomains';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getMovementById, getMovementsByBlock } from '../data/movements';

/**
 * Movimientos de calentamiento, vuelta a la calma y core incorporados tras analizar 200 dias de
 * programacion real de PushJerk (dic 2025 - sep 2026), y las parejas de WOD que se repiten alli.
 */

const NEW_WARMUP = [
  'pvc-overhead-squat', 'pvc-good-morning', 'pvc-around-the-world', 'goblet-squat-hold', 'alternating-arm-swings',
  'side-lunge-stretch', 'standing-toe-touch-box', 'inchworm-push-up', 'bulgarian-stretch', 'thoracic-spine-bb-stretch',
  'samson-stretch', 'backward-sprint',
];
const NEW_COOLDOWN = [
  'foam-roll-lower-back', 'foam-roll-glutes', 'foam-roll-hamstrings', 'foam-roll-calves', 'foam-roll-quads',
  'downward-facing-dog', 'upward-facing-dog', 'butterfly-stretch', 'sit-up-to-pike', 'sit-up-to-straddle', 'easy-cardio-cooldown',
];
const NEW_CORE = ['lying-leg-raise'];
const ALL_NEW = [...NEW_WARMUP, ...NEW_COOLDOWN, ...NEW_CORE];

const NEW_PAIRS: [string, string][] = [
  ['run', 'strict-pull-up'], ['sled-row', 'strict-pull-up'], ['abmat-situp', 'deadlift'], ['deadlift', 'wall-ball'],
  ['kettlebell-swing-russian', 'wall-ball'], ['front-squat', 'sled-row'], ['box-jump', 'wall-ball'], ['push-up', 'sled-row'],
  ['bar-muscle-up', 'front-squat'], ['run', 'wall-ball'], ['strict-pull-up', 'wall-ball'], ['deadlift', 'sled-row'],
  ['deadlift', 'push-up'], ['bar-muscle-up', 'sled-row'],
];

describe('catalogo ampliado (PushJerk 2025-26)', () => {
  it('todos los movimientos nuevos existen, con estandar y escalados que apuntan a ids reales', () => {
    const bad: string[] = [];
    for (const id of ALL_NEW) {
      const m = getMovementById(id);
      if (!m) {
        bad.push(`${id}: no existe`);
        continue;
      }
      if (m.standard.length < 40) bad.push(`${id}: estandar demasiado corto`);
      if (m.blocks.length === 0) bad.push(`${id}: sin bloque`);
      for (const s of [...m.scaling.easier, ...m.scaling.harder]) if (!getMovementById(s)) bad.push(`${id}: escalado ${s} no existe`);
    }
    expect(bad).toEqual([]);
  });

  it('calentamiento: cada patron de fuerza tiene al menos 3 movimientos especificos donde elegir (empuje antes tenia 0)', () => {
    const warmups = getMovementsByBlock('warmup');
    for (const tag of ['especifico-squat', 'especifico-hinge', 'especifico-push', 'especifico-oly']) {
      expect(warmups.filter((m) => m.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(3);
    }
  });

  it('cada patron de fuerza se traduce a una etiqueta de calentamiento que existe en el catalogo (el motor buscaba "especifico-horizontalPush", que no existe)', () => {
    const warmups = getMovementsByBlock('warmup');
    const patterns = ['squat', 'lunge', 'hinge', 'horizontalPush', 'verticalPush', 'olyLift'] as const;
    for (const p of patterns) {
      const tag = WARMUP_TAG_BY_PATTERN[p];
      expect(tag, `sin etiqueta para ${p}`).toBeTruthy();
      expect(warmups.filter((m) => m.tags.includes(tag as string)).length, `${p} -> ${tag}`).toBeGreaterThanOrEqual(3);
    }
    // Y la etiqueta "a secas" que usaba el motor antes no encontraba nada para empuje/olimpico.
    expect(warmups.filter((m) => m.tags.includes('especifico-horizontalPush')).length).toBe(0);
  });

  it('los movimientos nuevos se usan de verdad: aparecen casi todos en sesiones generadas', () => {
    const seen = new Set<string>();
    const scan = (profile: ReturnType<typeof makeProfile>, start: string, days: number) => {
      for (const d of consecutiveDates(start, days)) {
        for (const b of generateSessionForDate(profile, [], d, profile.goals).blocks) if (ALL_NEW.includes(b.movementId)) seen.add(b.movementId);
      }
    };
    for (const n of [5, 6] as const) {
      for (const id of ['a', 'b']) scan(makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id })] }), '2026-01-05', 140);
      scan(makeProfile({ trainingDaysPerWeek: n, macrocycles: [] }), '2026-03-02', 200);
    }
    const unused = ALL_NEW.filter((id) => !seen.has(id));
    expect(unused.length, `sin usar: ${unused.join(', ')}`).toBeLessThanOrEqual(3);
  });
});

describe('afinidades de WOD (PushJerk 2025-26)', () => {
  it('las 14 parejas nuevas estan en los dos sentidos y todos los ids existen', () => {
    const bad: string[] = [];
    for (const [a, b] of NEW_PAIRS) {
      if (!getMovementById(a) || !getMovementById(b)) bad.push(`id inexistente: ${a} / ${b}`);
      if (!(WOD_PAIR_AFFINITY[a] ?? []).includes(b)) bad.push(`${a} -> ${b} falta`);
      if (!(WOD_PAIR_AFFINITY[b] ?? []).includes(a)) bad.push(`${b} -> ${a} falta`);
    }
    expect(bad).toEqual([]);
  });

  it('las parejas nuevas solo usan movimientos que pueden salir en un WOD', () => {
    const wodIds = new Set(getMovementsByBlock('wod').map((m) => m.id));
    for (const [a, b] of NEW_PAIRS) {
      expect(wodIds.has(a), `${a} no es de WOD`).toBe(true);
      expect(wodIds.has(b), `${b} no es de WOD`).toBe(true);
    }
  });
});
