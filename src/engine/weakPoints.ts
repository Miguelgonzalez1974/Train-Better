import { getMovementById } from '../data/movements';
import type { Movement } from '../data/movements/types';
import type { PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';

export type WeakPointStatus = 'a-trabajar' | 'vigilar' | 'en-progreso' | 'sin-datos';

/** Tendencia de carga real entre los dos ultimos tests 1RM registrados para la categoria, si hay al menos dos. */
export type LoadTrend = 'subida' | 'estancado' | null;

export interface PatternStrain {
  key: string;
  label: string;
  sessions: number;
  avgRpe: number | null;
  scaledRate: number | null;
  strainScore: number | null;
  status: WeakPointStatus;
  loadTrend: LoadTrend;
}

interface Category {
  key: string;
  label: string;
  match: (m: Movement) => boolean;
}

const CATEGORIES: Category[] = [
  { key: 'squat', label: 'Sentadilla', match: (m) => m.blocks.includes('strength') && m.pattern === 'squat' },
  { key: 'hinge', label: 'Bisagra de cadera', match: (m) => m.blocks.includes('strength') && m.pattern === 'hinge' },
  {
    key: 'horizontalPush',
    label: 'Empuje horizontal',
    match: (m) => m.blocks.includes('strength') && m.pattern === 'horizontalPush',
  },
  {
    key: 'verticalPush',
    label: 'Empuje vertical',
    match: (m) => m.blocks.includes('strength') && m.pattern === 'verticalPush',
  },
  { key: 'snatch', label: 'Snatch', match: (m) => m.blocks.includes('oly') && m.id.includes('snatch') },
  {
    key: 'clean',
    label: 'Clean & Jerk',
    match: (m) => m.blocks.includes('oly') && (m.id.includes('clean') || m.id.includes('jerk')),
  },
];

/** Minimo de sesiones con la categoria presente para entrar en el ranking de debilidades. */
const MIN_SESSIONS = 2;

/**
 * Deriva puntos debiles de datos ya registrados (rxOrScaled, rpe, movementIds, testLoadKg) — no
 * requiere pedir nada nuevo al atleta. strainScore parte de RPE medio y tasa de escalado de las
 * sesiones donde aparecio esa categoria, pero cuando hay al menos dos tests 1RM reales para la
 * categoria (dias de "Test 1RM" de fuerza u oly), la tendencia de carga real pesa mas que la
 * sensacion subjetiva: un atleta que no sube de peso pese a sentir la sesion "normal" es una
 * debilidad real que el RPE por si solo no detecta; uno que sigue subiendo peso pese a sentirlo
 * duro esta progresando de verdad, no estancado. Las peores 2 se marcan "a trabajar", las 2
 * siguientes "vigilar", el resto "en progreso".
 *
 * Ademas de alimentar `WeakPointsCard` (Dashboard), `generateSession.ts` usa este mismo resultado
 * para dar mas frecuencia a los patrones "a trabajar" — ver `weakestUntrainedStrengthPattern`/
 * `weakestUntrainedOlyFamily` en ese archivo.
 */
export function computeWeakPoints(history: SessionHistoryEntry[]): PatternStrain[] {
  const results: PatternStrain[] = CATEGORIES.map((category) => {
    const matching = history.filter((entry) =>
      entry.movementIds.some((id) => {
        if (id.startsWith('benchmark:')) return false;
        const movement = getMovementById(id);
        return movement ? category.match(movement) : false;
      }),
    );

    if (matching.length < MIN_SESSIONS) {
      return {
        key: category.key,
        label: category.label,
        sessions: matching.length,
        avgRpe: null,
        scaledRate: null,
        strainScore: null,
        status: 'sin-datos',
        loadTrend: null,
      };
    }

    const avgRpe = matching.reduce((sum, e) => sum + e.rpe, 0) / matching.length;
    const scaledRate = matching.filter((e) => e.rxOrScaled === 'scaled').length / matching.length;

    const tests = matching.filter((e) => e.testLoadKg != null).sort((a, b) => a.date.localeCompare(b.date));
    const loadTrend: LoadTrend =
      tests.length >= 2
        ? tests[tests.length - 1].testLoadKg! > tests[tests.length - 2].testLoadKg!
          ? 'subida'
          : 'estancado'
        : null;

    let strainScore = (avgRpe / 10) * 0.5 + scaledRate * 0.5;
    if (loadTrend === 'estancado') strainScore = Math.min(1, strainScore + 0.25);
    if (loadTrend === 'subida') strainScore = Math.max(0, strainScore - 0.15);

    return {
      key: category.key,
      label: category.label,
      sessions: matching.length,
      avgRpe,
      scaledRate,
      strainScore,
      status: 'en-progreso',
      loadTrend,
    };
  });

  const ranked = results.filter((r) => r.strainScore !== null).sort((a, b) => (b.strainScore ?? 0) - (a.strainScore ?? 0));
  ranked.forEach((item, index) => {
    item.status = index < 2 ? 'a-trabajar' : index < 4 ? 'vigilar' : 'en-progreso';
  });

  return results;
}

export type PrTrendDirection = 'subida' | 'bajada' | 'estable';

/**
 * Compara los dos tests (testLoadKg) mas recientes que tocan cada PR raiz — un lift sin al menos 2
 * tests registrados no tiene entrada (no hay "estable" por defecto, solo se afirma tendencia con
 * datos reales). Misma logica de coincidencia por dia que ya usa `computeWeakPoints` arriba (un dia
 * cuenta como test de un PR si alguno de sus movimientos resuelve a ese PR raiz via
 * resolveStrengthPRKey/resolveOlyPRKey, sin distinguir de que bloque exacto vino — mismo nivel de
 * precision ya aceptado en esa funcion, no una nueva regla mas estricta).
 */
export function computePrTrends(history: SessionHistoryEntry[]): Partial<Record<keyof PersonalRecords, PrTrendDirection>> {
  const testsByKey: Partial<Record<keyof PersonalRecords, { date: string; load: number }[]>> = {};

  for (const entry of history) {
    if (entry.testLoadKg == null) continue;
    const keysToday = new Set<keyof PersonalRecords>();
    for (const id of entry.movementIds) {
      if (id.startsWith('benchmark:')) continue;
      const movement = getMovementById(id);
      const key = movement && (resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement));
      if (key) keysToday.add(key);
    }
    for (const key of keysToday) {
      (testsByKey[key] ??= []).push({ date: entry.date, load: entry.testLoadKg });
    }
  }

  const trends: Partial<Record<keyof PersonalRecords, PrTrendDirection>> = {};
  for (const key of Object.keys(testsByKey) as (keyof PersonalRecords)[]) {
    const tests = testsByKey[key]!.sort((a, b) => a.date.localeCompare(b.date));
    if (tests.length < 2) continue;
    const [prev, last] = tests.slice(-2);
    trends[key] = last.load > prev.load ? 'subida' : last.load < prev.load ? 'bajada' : 'estable';
  }
  return trends;
}
