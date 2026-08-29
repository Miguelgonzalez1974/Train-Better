import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getWodDomain, PHASE_DOMINANT_ENERGY, resolveEnergySystemPlan, type EnergySystem, type WodDomain } from './wodDomains';
import { MESOCYCLE_PHASE } from './oneRepMaxTables';
import {
  getActiveMacrocycle,
  getDayPlan,
  getWeekdayIndex,
  resolveMacrocyclePhase,
  resolvePhaseAtWeek,
  toLocalIsoDate,
  weeksSinceStart,
} from './periodization';
import { planEnergySystems } from './weekPlan';

/**
 * Lectura de "cómo llevamos el acondicionamiento" para el Dashboard — puramente derivada, no toca el
 * motor. Dos señales:
 *
 *  1. Reparto por sistema energético en el bloque: para cada día de WOD rotativo de la ventana
 *     reciente, qué sistema le tocaba (replay determinista de `planEnergySystems`, que tiene PRNG
 *     propio y no depende del estado del atleta ese día) y de cuántos de esos días hay sesión
 *     registrada. Así se ve si un dominio concreto (p.ej. los días de umbral) es el que más se salta.
 *  2. Trifecta realizada: reparto gimnasia / carga externa / monoestructural de los movimientos de
 *     WOD efectivamente hechos (de `wodMovementIds` del historial), para detectar sesgos.
 *
 * Los días de benchmark (día 0, o testeo extra de pico/objetivo) quedan fuera del reparto por
 * sistema: ahí el estímulo lo manda el benchmark, no la rotación de fase.
 *
 * El replay usa la fase de CALENDARIO (`resolvePhaseAtWeek`). En una semana con descarga forzada
 * (ACWR en rojo o taper) el motor real pudo rotar sobre otra fase — el "planificado" de esa semana
 * queda algo desalineado, pero el "hecho" no: las sesiones registradas llevan su `energySystem`
 * real (`entry.energySystem ?? sys`), así que solo se desvían los días planificados y no entrenados.
 */

const WINDOW_WEEKS = 6;
/** Días hacia delante que se incluyen en el reparto planificado — asegura que un macro recién arrancado ya tenga días de WOD que mostrar. */
const LOOKAHEAD_DAYS = 10;
/** Orden canónico para pintar las barras (progresión clásica de resistencia). */
const ENERGY_ORDER: EnergySystem[] = ['base-aerobica', 'umbral', 'potencia', 'recuperacion'];

const TRIFECTA_LABEL: Record<WodDomain, string> = {
  gymnastics: 'Gimnasia',
  weighted: 'Carga externa',
  monostructural: 'Monoestructural',
};

export interface EnergySystemTally {
  system: EnergySystem;
  label: string;
  /** Días de WOD rotativo de la ventana a los que les tocaba este sistema. */
  planned: number;
  /** De esos, cuántos tienen una sesión registrada. */
  done: number;
}

export interface TrifectaSlice {
  domain: WodDomain;
  label: string;
  count: number;
  /** Cuota redondeada sobre el total de movimientos de WOD clasificados. */
  pct: number;
}

export interface ConditioningBalance {
  windowWeeks: number;
  phaseIndex: 1 | 2 | 3 | 4;
  phaseLabel: string;
  dominantSystem: EnergySystem;
  dominantLabel: string;
  /** Sistemas con al menos un día planificado en la ventana, de más a menos frecuente. */
  energy: EnergySystemTally[];
  totalPlanned: number;
  totalDone: number;
  /** Reparto de la trifecta; vacío si aún no hay sesiones con WOD registrado en la ventana. */
  trifecta: TrifectaSlice[];
  trifectaSessions: number;
  insight: string;
}

/** Fecha ISO -> entrada de historial de ese día (para cruzar días planificados con sesiones hechas). */
function indexHistory(history: SessionHistoryEntry[]): Map<string, SessionHistoryEntry> {
  const byDate = new Map<string, SessionHistoryEntry>();
  for (const entry of history) byDate.set(entry.date, entry);
  return byDate;
}

export function computeConditioningBalance(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  today: Date,
): ConditioningBalance | null {
  const todayIso = toLocalIsoDate(today);
  const macro = getActiveMacrocycle(profile.macrocycles, todayIso);
  if (!macro) return null;

  const n = profile.trainingDaysPerWeek;
  const byDate = indexHistory(history);

  // Ventana retrospectiva de `WINDOW_WEEKS`, recortada al inicio del macro...
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (WINDOW_WEEKS * 7 - 1));
  const macroStart = new Date(`${macro.startDate}T00:00:00`);
  if (windowStart < macroStart) windowStart.setTime(macroStart.getTime());
  // ...más una mirada hacia delante de `LOOKAHEAD_DAYS`: sin esto, un macro recién arrancado (o que
  // empieza en fin de semana o a media semana) no tendría ningún día de entreno en la ventana y la
  // tarjeta no se mostraría. El "hecho" solo cuenta hasta hoy; lo de después es solo "planificado".
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + LOOKAHEAD_DAYS);
  const macroEnd = new Date(`${macro.endDate}T00:00:00`);
  if (windowEnd > macroEnd) windowEnd.setTime(macroEnd.getTime());

  const planned = new Map<EnergySystem, number>();
  const done = new Map<EnergySystem, number>();
  const trifecta: Record<WodDomain, number> = { gymnastics: 0, weighted: 0, monostructural: 0 };
  let trifectaClassified = 0;
  let trifectaSessions = 0;

  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const isPastOrToday = cursor <= today;
    const dp = getDayPlan(getWeekdayIndex(cursor), n);
    // Solo días de WOD rotativo: se salta el no-entreno, la recuperación activa de n=6 (WOD suave
    // fijo) y el día 0 (benchmark de referencia — estímulo propio, no de la rotación de fase).
    if (dp.isTrainingDay && !dp.isRecoveryDay && dp.trainingDayIndex > 0) {
      const weeksSince = weeksSinceStart(macro.startDate, cursor);
      const phase = resolvePhaseAtWeek(macro, weeksSince).phaseIndex;
      const sys = planEnergySystems(macro.id, weeksSince + 1, phase, n)[dp.trainingDayIndex];
      planned.set(sys, (planned.get(sys) ?? 0) + 1);

      const entry = isPastOrToday ? byDate.get(toLocalIsoDate(cursor)) : undefined;
      if (entry) {
        const effective = entry.energySystem ?? sys;
        done.set(effective, (done.get(effective) ?? 0) + 1);
      }
    }

    const entry = isPastOrToday ? byDate.get(toLocalIsoDate(cursor)) : undefined;
    if (entry?.wodMovementIds && entry.wodMovementIds.length > 0) {
      let any = false;
      for (const id of entry.wodMovementIds) {
        if (id.startsWith('benchmark:')) continue;
        trifecta[getWodDomain(id)] += 1;
        trifectaClassified += 1;
        any = true;
      }
      if (any) trifectaSessions += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const totalPlanned = [...planned.values()].reduce((s, c) => s + c, 0);
  if (totalPlanned === 0) return null;
  const totalDone = [...done.values()].reduce((s, c) => s + c, 0);

  const energy: EnergySystemTally[] = ENERGY_ORDER.filter((s) => (planned.get(s) ?? 0) > 0)
    .map((system) => ({
      system,
      label: resolveEnergySystemPlan(system).label,
      planned: planned.get(system) ?? 0,
      done: done.get(system) ?? 0,
    }))
    .sort((a, b) => b.planned - a.planned);

  const trifectaSlices: TrifectaSlice[] =
    trifectaClassified > 0
      ? (['gymnastics', 'weighted', 'monostructural'] as WodDomain[]).map((domain) => ({
          domain,
          label: TRIFECTA_LABEL[domain],
          count: trifecta[domain],
          pct: Math.round((trifecta[domain] / trifectaClassified) * 100),
        }))
      : [];

  const phaseIndex = resolveMacrocyclePhase(macro, today).phaseIndex;
  const dominantSystem = PHASE_DOMINANT_ENERGY[phaseIndex];
  const dominantLabel = resolveEnergySystemPlan(dominantSystem).label;
  const phaseLabel = MESOCYCLE_PHASE[phaseIndex];

  return {
    windowWeeks: WINDOW_WEEKS,
    phaseIndex,
    phaseLabel,
    dominantSystem,
    dominantLabel,
    energy,
    totalPlanned,
    totalDone,
    trifecta: trifectaSlices,
    trifectaSessions,
    insight: buildInsight({ energy, totalPlanned, totalDone, trifectaSlices, trifectaSessions, phaseLabel, dominantLabel }),
  };
}

function buildInsight(input: {
  energy: EnergySystemTally[];
  totalPlanned: number;
  totalDone: number;
  trifectaSlices: TrifectaSlice[];
  trifectaSessions: number;
  phaseLabel: string;
  dominantLabel: string;
}): string {
  const { energy, totalPlanned, totalDone, trifectaSlices, trifectaSessions, phaseLabel, dominantLabel } = input;

  if (totalDone === 0) {
    return `Bloque recién arrancado — fase ${phaseLabel}, domina ${dominantLabel.toLowerCase()}. Aquí verás cómo repartes el acondicionamiento según entrenes.`;
  }

  if (totalPlanned >= 4 && totalDone / totalPlanned < 0.6) {
    return `Llevas ${totalDone} de ${totalPlanned} sesiones de acondicionamiento del bloque — se te están escapando días.`;
  }

  const worst = [...energy]
    .filter((e) => e.planned >= 2)
    .sort((a, b) => a.done / a.planned - b.done / b.planned)[0];
  if (worst && worst.done / worst.planned <= 0.5) {
    return `Los días de ${worst.label.toLowerCase()} son los que más se te escapan (${worst.done} de ${worst.planned}).`;
  }

  if (trifectaSessions >= 3 && trifectaSlices.length > 0) {
    const low = [...trifectaSlices].sort((a, b) => a.pct - b.pct)[0];
    const high = [...trifectaSlices].sort((a, b) => b.pct - a.pct)[0];
    if (low.pct < 22) return `${low.label} va corta en tus WOD (${low.pct}%) — el coach la irá compensando.`;
    if (high.pct > 45) return `Tus WOD están cargando mucho ${high.label.toLowerCase()} (${high.pct}%).`;
  }

  return `Reparto equilibrado. Fase ${phaseLabel}: domina ${dominantLabel.toLowerCase()}.`;
}
