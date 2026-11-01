/**
 * El COSTE REAL de una sesión: lo que desgasta de verdad frente a lo que dice su RPE × duración.
 *
 * Esa cuenta (`dayStrain`) es lo mismo para un WOD de dominadas y barra que para un metcon de bici con el mismo RPE y minutos, pero el
 * primero desgasta más (agarre, hombro, kilos movidos). Aquí se corrige con lo que sabemos de la sesión: la carga mecánica del WOD
 * (`getWodProfile`: barra, impacto, agarre, hombro y dificultad técnica), el patrón de fuerza del día (sentadilla y bisagra pesadas cuestan
 * más) y la halterofilia. Una sesión de la que no sabemos nada (propia, antigua) no se toca. Es una ESTIMACIÓN: de −10 % a +25 %.
 */
import type { SessionHistoryEntry } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';
import { dayStrain } from './strain';
import { getCatalogWod } from './wodCatalog';
import { getWodProfile, type LoadLabel, type WodProfile } from './wodProfile';

/**
 * La carga mecánica (0-100) de un WOD "normal": la mediana del catálogo (34; el 95 % queda por debajo de 54 y los más pesados rozan 75).
 * Por encima desgasta más de lo que dice su RPE, por debajo menos.
 */
const REFERENCE_MECHANICAL = 35;
/** Lo que suma o resta el WOD cuando su carga mecánica se aleja 40 puntos de la de referencia. */
const WOD_SWING = 0.14;
const WOD_SPAN = 40;
/** Lo que suma el patrón de fuerza del día (las piernas pesadas desgastan más que su RPE). */
const PATTERN_COST: Partial<Record<MovementPattern, number>> = { squat: 0.06, hinge: 0.06, lunge: 0.04 };
const OLY_COST = 0.04;
export const COST_MIN = -0.1;
export const COST_MAX = 0.25;

const PATTERN_LABEL: Partial<Record<MovementPattern, string>> = {
  squat: 'Sentadilla',
  hinge: 'Peso muerto',
  horizontalPush: 'Pecho',
  verticalPush: 'Hombro',
  horizontalPull: 'Remo',
  verticalPull: 'Dominadas',
  lunge: 'Zancada',
  carry: 'Acarreo',
};

/** Los ids de catálogo de los WODs de una sesión (`lib:…` / `bm:…`). */
function wodIdsOf(entry: SessionHistoryEntry): string[] {
  const ids = [...(entry.wodCatalogIds ?? []), entry.wodCatalogId ?? '', entry.wodLibraryId ? `lib:${entry.wodLibraryId}` : ''];
  return [...new Set(ids.filter(Boolean))];
}

function profilesOf(entry: SessionHistoryEntry): WodProfile[] {
  return wodIdsOf(entry)
    .map((id) => getWodProfile(id))
    .filter((p): p is WodProfile => p !== undefined);
}

/** Cuánto más (o menos) desgasta la sesión de lo que dice su RPE × duración, como fracción (0,12 = un 12 % más). 0 si no sabemos nada. */
export function sessionCostFactor(entry: SessionHistoryEntry): number {
  let k = 0;
  const profiles = profilesOf(entry);
  if (profiles.length > 0) {
    const mean = profiles.reduce((s, p) => s + p.load.score, 0) / profiles.length;
    k += ((mean - REFERENCE_MECHANICAL) / WOD_SPAN) * WOD_SWING;
  }
  if (entry.strengthPattern) k += PATTERN_COST[entry.strengthPattern] ?? 0;
  if (entry.olyFamily) k += OLY_COST;
  return Math.max(COST_MIN, Math.min(COST_MAX, k));
}

/** El esfuerzo del día (0-100) con el coste real incluido: el que se usa para la carga de la energía. */
export function effectiveLoad(entry: SessionHistoryEntry): number {
  const base = dayStrain(entry) ?? 0;
  return Math.max(0, Math.min(100, Math.round(base * (1 + sessionCostFactor(entry)))));
}

/** Una fila de "lo que cuestan tus sesiones": lo que dice el RPE, lo que cuesta de verdad y su diferencia. */
export interface SessionCostRow {
  date: string;
  title: string;
  detail: string;
  /** Esfuerzo por RPE × duración y con el coste real (0-100). */
  base: number;
  real: number;
  /** Diferencia en %, redondeada (+19 = cuesta un 19 % más de lo que parece). */
  pct: number;
}

const MECHANICAL_WORD: Record<LoadLabel, string> = { ligera: 'baja', media: 'media', alta: 'alta', 'muy-alta': 'muy alta' };

/** Las últimas sesiones registradas hasta `todayIso` con su coste real, de la más reciente a la más antigua. */
export function recentSessionCosts(history: SessionHistoryEntry[], todayIso: string, count = 3): SessionCostRow[] {
  return [...history]
    .filter((e) => e.date <= todayIso)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count)
    .map((e) => {
      const profiles = profilesOf(e);
      const pattern = e.strengthPattern ? PATTERN_LABEL[e.strengthPattern] : undefined;
      const wodName = wodIdsOf(e).map((id) => getCatalogWod(id)?.name).find(Boolean);
      const title = [pattern, wodName ? `WOD ${wodName}` : profiles.length > 0 ? 'WOD' : undefined].filter(Boolean).join(' + ') || 'Sesión';
      const mech = profiles.length > 0 ? ` · mecánica ${MECHANICAL_WORD[profiles.reduce((b, p) => (p.load.score > b.load.score ? p : b), profiles[0]).load.label]}` : '';
      const base = dayStrain(e) ?? 0;
      const real = effectiveLoad(e);
      return { date: e.date, title, detail: `RPE ${e.rpe} · ${e.durationMin} min${mech}`, base, real, pct: base > 0 ? Math.round((real / base - 1) * 100) : 0 };
    });
}
