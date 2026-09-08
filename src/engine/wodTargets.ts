/**
 * Modelo de objetivo del WOD — dada la estructura (formato + movimientos + esquema de reps + ventana
 * de tiempo), estima un objetivo orientativo de tiempo / rondas / repeticiones y una banda alrededor.
 *
 * No es programación propietaria: los ritmos por movimiento y los objetivos por formato están
 * calibrados a mano contra ~100 "Goal:" de un banco de WODs genérico de estilo CrossFit
 * (`docs/importar-coach-ia.md`) y conocimiento general de la disciplina. La salida es deliberadamente
 * una ESTIMACIÓN con banda ancha: el RPE de la semana sigue mandando, esto solo le da al atleta una
 * cifra concreta contra la que medirse y al coach una referencia para juzgar el resultado.
 */

import type { WodScoreType, WodResult } from '../data/athlete/types';
import type { WodFormatKind, WodTimeDomain } from './wodDomains';

/** Segundos por repetición, a ritmo de metcon (no de serie fresca) para un atleta en forma media. */
const REP_SECONDS: Record<string, number> = {
  'strict-pull-up': 3,
  'kipping-pull-up': 1.6,
  'chest-to-bar-pull-up': 2,
  'butterfly-pull-up': 1.4,
  'toes-to-bar': 2,
  'knees-to-elbow': 1.8,
  'push-up': 1.5,
  'handstand-push-up': 3,
  'kipping-hspu': 2.4,
  'ring-dip': 2.5,
  'bar-muscle-up': 5,
  'ring-muscle-up': 6,
  'wall-walk': 8,
  'rope-climb': 12,
  'pistol-squat': 2.4,
  'box-jump': 2.3,
  'box-jump-over': 2.6,
  burpee: 3.8,
  'burpee-box-jump-over': 4.6,
  'burpee-pull-up': 4.6,
  'bar-facing-burpee': 4,
  'burpee-to-target': 4.2,
  'lateral-burpee': 4,
  'air-squat': 1.2,
  'abmat-situp': 1.5,
  'ring-row': 1.8,
  'wall-ball': 1.9,
  thruster: 3,
  'kettlebell-swing-russian': 1.4,
  'kettlebell-swing-american': 1.7,
  'dumbbell-snatch': 2.2,
  'dumbbell-clean-and-jerk': 3.2,
  'sandbag-clean': 3.5,
  'devils-press': 5,
  'man-maker': 6,
  'shoulder-to-overhead': 2.8,
  'dumbbell-hang-clean': 2.4,
  'dumbbell-push-jerk': 2.6,
  'sumo-deadlift-high-pull': 2,
  'kettlebell-front-squat': 2.4,
  'kettlebell-goblet-squat': 2,
  'back-squat': 3,
  'front-squat': 3,
  deadlift: 2.6,
  snatch: 4,
  'power-snatch': 3.2,
  'hang-snatch': 3.4,
  clean: 4,
  'power-clean': 3.2,
  'hang-clean': 3.4,
  'clean-and-jerk': 4.6,
};

/** Segundos por metro para monoestructurales de distancia y acarreos. */
const PER_METER_SECONDS: Record<string, number> = {
  run: 0.27,
  row: 0.19,
  'ski-erg': 0.2,
  'handstand-walk': 0.9,
  'farmers-carry': 0.5,
  'sandbag-carry': 0.55,
  'yoke-walk': 0.7,
  'sled-push': 0.9,
  'suitcase-carry': 0.5,
  'shuttle-run': 0.4,
};

/** Segundos por caloría para máquinas. */
const PER_CAL_SECONDS: Record<string, number> = { row: 2.4, 'air-bike': 3, 'ski-erg': 2.8 };

/** Segundos por salto de comba (+ un pequeño peaje fijo por los enganches). */
const JUMP_SECONDS: Record<string, number> = { 'double-under': 0.42, 'single-under': 0.28 };

const DEFAULT_REP_SECONDS = 2.5;
const TRANSITION_SECONDS = 3;

export interface WodTargetEntry {
  movementId: string;
  /** Token de reps del bloque: "21-15-9", "12-15", "400m", "15-20 cal", "2x15m", "9"… */
  reps: string;
  loadKg?: number;
}

export interface WodTarget {
  scoreType: WodScoreType;
  unit: 'seconds' | 'rounds' | 'reps';
  /** Banda numérica. `low === 0 && high === 0` -> objetivo cualitativo, solo `note`. */
  low: number;
  high: number;
  /** Etiqueta corta: "~10-13 min", "~5-6 rondas", "~220 reps". */
  display: string;
  /** Frase para la nota del WOD. */
  note: string;
}

interface ParsedToken {
  count: number;
  unit: 'rep' | 'm' | 'cal' | 'sec';
}

function parseToken(raw: string): ParsedToken {
  const t = (raw ?? '').trim().toLowerCase();
  // "2x15m" / "4-6 x 10m" -> producto en metros
  const xm = t.match(/(\d+)[^\dx]*x[^\d]*(\d+)\s*m/);
  if (xm) return { count: Number(xm[1]) * Number(xm[2]), unit: 'm' };
  const range = t.match(/(\d+)\s*-\s*(\d+)/);
  const single = t.match(/(\d+)/);
  const n = range ? (Number(range[1]) + Number(range[2])) / 2 : single ? Number(single[1]) : 10;
  if (/cal/.test(t)) return { count: n, unit: 'cal' };
  if (/seg|sec/.test(t)) return { count: n, unit: 'sec' };
  if (/\d\s*m(?!in)/.test(t)) return { count: n, unit: 'm' };
  return { count: n, unit: 'rep' };
}

/** Segundos de trabajo puro de un movimiento a una cantidad concreta (una ronda / un peldaño). */
function movementSeconds(movementId: string, tok: ParsedToken): number {
  if (tok.unit === 'sec') return tok.count;
  if (tok.unit === 'm') return (PER_METER_SECONDS[movementId] ?? 0.3) * tok.count;
  if (tok.unit === 'cal') return (PER_CAL_SECONDS[movementId] ?? 2.8) * tok.count;
  if (JUMP_SECONDS[movementId]) return JUMP_SECONDS[movementId] * tok.count + 4;
  return (REP_SECONDS[movementId] ?? DEFAULT_REP_SECONDS) * tok.count;
}

/** Segundos de una ronda: trabajo de cada movimiento (a `countOverride` reps si se pasa) + transiciones. */
function roundSeconds(entries: WodTargetEntry[], countOverride?: number): number {
  let work = 0;
  for (const e of entries) {
    const parsed = parseToken(e.reps);
    const tok = countOverride != null && parsed.unit === 'rep' ? { count: countOverride, unit: 'rep' as const } : parsed;
    work += movementSeconds(e.movementId, tok);
  }
  return work + entries.length * TRANSITION_SECONDS;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Sobrecoste por fatiga/agarre/respiración: crece con el trabajo total y el nº de movimientos. */
function overhead(totalWorkSeconds: number, movementCount: number): number {
  return clamp(1.12 + Math.min(0.35, totalWorkSeconds / 1500) + 0.03 * (movementCount - 2), 1.1, 1.6);
}

function fmtDuration(sec: number): string {
  const m = sec / 60;
  if (m < 1) return `${Math.round(sec / 5) * 5} s`;
  if (m < 4) return `${(Math.round(m * 2) / 2).toString().replace('.0', '')} min`;
  return `${Math.round(m)} min`;
}

function timeBandDisplay(low: number, high: number): string {
  const a = fmtDuration(low);
  const b = fmtDuration(high);
  if (a === b) return `~${a}`;
  // "5 min" + "7 min" -> "~5–7 min"; distinta unidad -> se deja completo.
  const am = a.match(/^(\S+) min$/);
  const bm = b.match(/^(\S+) min$/);
  if (am && bm) return `~${am[1]}–${bm[1]} min`;
  return `~${a}–${b}`;
}

const MODEST_TAIL =
  ' Es una estimación del motor — manda el RPE de hoy; si te pasas bastante por encima, baja el ritmo o escala.';

function timeTarget(totalSeconds: number, spread = 0.13): WodTarget {
  const low = totalSeconds * (1 - spread);
  const high = totalSeconds * (1 + spread);
  const display = timeBandDisplay(low, high);
  return {
    scoreType: 'time',
    unit: 'seconds',
    low: Math.round(low),
    high: Math.round(high),
    display,
    note: `Objetivo orientativo: ${display}.${MODEST_TAIL}`,
  };
}

function roundsTarget(rounds: number): WodTarget {
  const low = Math.max(1, Math.floor(rounds));
  const high = Math.max(low, Math.ceil(rounds + 0.34));
  const display = low === high ? `~${low} rondas` : `~${low}-${high} rondas`;
  return {
    scoreType: 'rounds+reps',
    unit: 'rounds',
    low,
    high,
    display,
    note: `Objetivo orientativo: ${display}.${MODEST_TAIL}`,
  };
}

function qualitative(scoreType: WodScoreType, note: string): WodTarget {
  return { scoreType, unit: scoreType === 'time' ? 'seconds' : 'reps', low: 0, high: 0, display: '', note };
}

export function estimateWodTarget(input: {
  kind: WodFormatKind;
  entries: WodTargetEntry[];
  timeDomain: WodTimeDomain;
  /** Esquema de escalera compartido ("21-15-9") cuando el formato lo usa. */
  ladderScheme?: string | null;
  /** Peldaños del formato "escalera + peaje" (el principal escala, el peaje es fijo). */
  fillerSteps?: number[] | null;
}): WodTarget | null {
  const { kind, entries, timeDomain } = input;
  if (entries.length === 0) return null;
  const n = entries.length;

  // --- Escalera compartida: 21-15-9 y similares -> tiempo total = suma de peldaños ---
  const scheme = input.ladderScheme?.match(/\d+/g)?.map(Number);
  if (scheme && scheme.length >= 2) {
    let total = 0;
    for (const rung of scheme) total += roundSeconds(entries, rung);
    const oh = overhead(total, n);
    return timeTarget(total * oh, 0.14);
  }

  // --- Escalera + peaje: el principal escala por `fillerSteps`, el resto fijo ---
  if (input.fillerSteps && input.fillerSteps.length > 0) {
    const [main, ...rest] = entries;
    let total = 0;
    for (const step of input.fillerSteps) {
      total += movementSeconds(main.movementId, { count: step, unit: 'rep' });
      total += roundSeconds(rest);
    }
    const oh = overhead(total, n);
    if (kind === 'ascendingLadderFiller') {
      // AMRAP-style: sube hasta que se acaba el reloj -> objetivo en "escalón alcanzado".
      const perStep = (total / input.fillerSteps.length) * oh;
      const reached = (timeDomain.amrapMin * 60) / perStep;
      return qualitative(
        'reps',
        `Objetivo orientativo: aguanta hasta ~el escalón ${Math.max(1, Math.round(reached))} antes de que se acabe el reloj.${MODEST_TAIL}`,
      );
    }
    return timeTarget(total * oh, 0.15);
  }

  const oneRound = roundSeconds(entries);

  switch (kind) {
    case 'forTime':
    case 'descendingLadder':
    case 'ascendingLadder':
    case 'barbellComplex': {
      const total = oneRound * timeDomain.rounds;
      return timeTarget(total * overhead(total, n));
    }
    case 'ladder': {
      // Escalera ascendente +3 reps/ronda sobre la prescripción base.
      let total = 0;
      for (let r = 0; r < timeDomain.rounds; r++) {
        const extra = 3 * r;
        total += roundSeconds(entries) + entries.length * extra * DEFAULT_REP_SECONDS * 0.9;
      }
      return timeTarget(total * overhead(total, n), 0.15);
    }
    case 'chipper': {
      // Una sola ronda de trozos grandes: ~2.6x la prescripción por movimiento.
      const total = oneRound * 2.6;
      return timeTarget(total * overhead(total, n), 0.18);
    }
    case 'amrap': {
      const window = timeDomain.amrapMin * 60;
      const rounds = window / (oneRound * overhead(oneRound * 3, n));
      return roundsTarget(rounds);
    }
    case 'interval': {
      const work = oneRound * overhead(oneRound, n);
      const rest = 180 - work;
      if (rest < 15) {
        return qualitative(
          'time',
          `Objetivo orientativo: vas a ir al límite del intervalo (~${Math.max(0, Math.round(rest))} s de descanso) — escala o baja las reps si no llegas.${MODEST_TAIL}`,
        );
      }
      return qualitative(
        'time',
        `Objetivo orientativo: termina cada intervalo con ~${Math.round(rest / 5) * 5} s de descanso; si acabas al límite, baja el ritmo en el siguiente.${MODEST_TAIL}`,
      );
    }
    case 'emom':
      return qualitative(
        'reps',
        `Objetivo orientativo: completa los ${timeDomain.emomMin} min sin quedarte corto en ningún minuto; si un minuto te pilla justo, baja las reps.${MODEST_TAIL}`,
      );
    case 'risingLoadInterval':
      // El fallo aquí lo marca la CARGA, no el reloj — un número de rondas engañaría.
      return qualitative(
        'reps',
        `Objetivo orientativo: mantén la técnica intacta mientras sube el peso; para en el primer escalón en el que se te vaya la posición, no antes.${MODEST_TAIL}`,
      );
    case 'risingInterval': {
      const budget = timeDomain.amrapMin * 60;
      // Cada ronda cuesta ~8% más que la anterior; ¿cuántas caben en el presupuesto?
      let acc = 0;
      let rounds = 0;
      let cost = oneRound * overhead(oneRound, n);
      while (acc + cost <= budget && rounds < 20) {
        acc += cost;
        rounds += 1;
        cost *= 1.08;
      }
      return qualitative(
        'reps',
        `Objetivo orientativo: llega al menos a la ronda ${Math.max(3, rounds)} antes de no completar una dentro del tiempo.${MODEST_TAIL}`,
      );
    }
    default:
      return null;
  }
}

/** Pasa el `value` de un `WodResult` a un número comparable: segundos, rondas (decimal) o reps. */
export function parseWodResultValue(result: WodResult): number | null {
  const v = result.value.trim();
  if (result.scoreType === 'time') {
    const m = v.match(/(\d+):(\d{1,2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const only = v.match(/(\d+(?:\.\d+)?)/);
    return only ? Number(only[1]) * 60 : null;
  }
  if (result.scoreType === 'rounds+reps') {
    const m = v.match(/(\d+)\s*\+\s*(\d+)/);
    if (m) return Number(m[1]) + Number(m[2]) / 20; // fracción aproximada de ronda
    const only = v.match(/(\d+)/);
    return only ? Number(only[1]) : null;
  }
  const only = v.match(/(\d+(?:\.\d+)?)/);
  return only ? Number(only[1]) : null;
}

/**
 * Frase de coach comparando el resultado real con el objetivo. `null` si el objetivo era cualitativo
 * o el resultado no se puede leer. Para tiempo, menos es mejor; para rondas/reps, más es mejor.
 */
export function describeWodResultVsTarget(result: WodResult, target: WodTarget): string | null {
  if (target.low === 0 && target.high === 0) return null;
  const actual = parseWodResultValue(result);
  if (actual == null) return null;
  const mid = (target.low + target.high) / 2;

  if (target.unit === 'seconds') {
    if (actual <= target.high) return 'Dentro del objetivo de tiempo — buen ritmo.';
    const overPct = Math.round(((actual - mid) / mid) * 100);
    if (overPct <= 12) return 'Justo por encima del objetivo — casi; ajusta ritmo o transiciones la próxima.';
    return `Bastante por encima del objetivo (~${overPct}% más) — la próxima escala el volumen o la carga para quedarte en el rango.`;
  }
  // rondas o reps: más es mejor
  if (actual >= target.low) return 'Dentro del objetivo — buen trabajo.';
  const underPct = Math.round(((mid - actual) / mid) * 100);
  if (underPct <= 12) return 'Un pelín por debajo del objetivo — cerca; mantén el ritmo un punto más alto la próxima.';
  return `Por debajo del objetivo (~${underPct}% menos) — prueba a escalar para poder sostener el ritmo previsto.`;
}
