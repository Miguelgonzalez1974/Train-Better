import type { PersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * Motor de "escaleras" reutilizable: un día = lista de levantamientos, cada uno con una escalera
 * ascendente de pasos `{percent, sets, reps}` de aproximación hasta la serie de trabajo, y un flag
 * `isMaxAttempt` para el último número cuando es un 1RM real. Extraído de `halteroProgram.ts` (que lo
 * consume sin cambios) para que cualquier día de fuerza/oly de la app —un ciclo transcrito, un día
 * de meso oly con estructura de complejos, un día suelto— pueda escribirse como datos en vez de una
 * fórmula de un solo lift.
 */

export interface LadderStep {
  /** Fracción de 1 (0.6 = 60%), no porcentaje entero. */
  percent: number;
  sets: number;
  reps: number;
}

export interface LadderLift {
  /** Nombre a mostrar. */
  label: string;
  movementId: string;
  /** A qué PR del atleta se refieren los %. Los tirones se calculan sobre el lift del que tiran y los jerks sobre el clean & jerk (no tienen PR propio). */
  prKey: keyof PersonalRecords;
  block: 'oly' | 'strength';
  steps: LadderStep[];
  /** true si la última serie de la escalera es un intento de 1RM real: ese lift NO se descuenta por autorregulación (un número rebajado no es un máximo). */
  isMaxAttempt?: boolean;
  /** Notación de tempo (ej. "32X1"): se propaga al bloque para la tarjeta de fuerza y a la nota. */
  tempo?: string;
  /** Pausa en la recepción/fondo, en segundos — se añade a la nota. */
  pauseSeconds?: number;
  /** Movimientos de un complejo hecho sin soltar la barra (ej. power + hang + full snatch), en orden. */
  complexMovementIds?: string[];
  /** Nota libre extra específica de este lift, además de la escalera. */
  note?: string;
}

/**
 * "60/3 70/3 75/2×3" -> [{60%,1x3},{70%,1x3},{75%,2x3}] ("60/2×3" = 60% 2 series de 3; "60/3" = 60%
 * 1 serie de 3). Cualquier token que no encaje en el patrón número/número(×número) se ignora — el
 * documento fuente trae alguna anotación decorativa suelta ("RM", "× 1" con espacio) que no es parte
 * de la escalera.
 */
export function parseLadder(spec: string): LadderStep[] {
  const steps: LadderStep[] = [];
  const re = /(\d+)\/(\d+)(?:[x×](\d+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(spec))) {
    const percent = Number(match[1]) / 100;
    if (match[3]) {
      steps.push({ percent, sets: Number(match[2]), reps: Number(match[3]) });
    } else {
      steps.push({ percent, sets: 1, reps: Number(match[2]) });
    }
  }
  return steps;
}

type LadderLiftOptions = Pick<LadderLift, 'isMaxAttempt' | 'tempo' | 'pauseSeconds' | 'complexMovementIds' | 'note'>;

/** Construye un `LadderLift` parseando la escalera desde su notación compacta. */
export function makeLadderLift(
  label: string,
  movementId: string,
  prKey: keyof PersonalRecords,
  block: 'oly' | 'strength',
  spec: string,
  opts: LadderLiftOptions = {},
): LadderLift {
  return { label, movementId, prKey, block, steps: parseLadder(spec), ...opts };
}

export interface ResolvedLadderLift {
  movementId: string;
  prKey: keyof PersonalRecords;
  block: 'oly' | 'strength';
  /** Series y reps de la ÚLTIMA serie de la escalera (la de trabajo). */
  sets: number;
  reps: string;
  /** Carga de esa última serie, ya con autorregulación (salvo `isMaxAttempt`) y redondeo a disco. */
  loadKg: number;
  /** Etiqueta del lift, sin prefijo de programa — el caller compone el `format` final. */
  liftLabel: string;
  tempo?: string;
  complexMovementIds?: string[];
  /** "Escalera: 60% 3 @ 100 kg, …" + notas de complejo/tempo/pausa/max/nota libre. Sin la nota de semana (la añade el caller). */
  notes: string;
  isMaxAttempt: boolean;
}

/**
 * Resuelve una lista de `LadderLift` (un día) a levantamientos listos: aplica `autoregFactor` a cada
 * carga salvo en los marcados `isMaxAttempt`, redondea a disco y compone la nota de escalera. Los
 * lifts cuyo `movementId` no exista en el catálogo o cuya escalera esté vacía se descartan.
 */
export function resolveLadderDay(
  lifts: LadderLift[],
  prs: PersonalRecords,
  autoregFactor: number,
): ResolvedLadderLift[] {
  return lifts
    .map((lift): ResolvedLadderLift | null => {
      const movement = getMovementById(lift.movementId);
      if (!movement || lift.steps.length === 0) return null;
      // Un intento de máximo real no se descuenta por autorregulación.
      const factor = lift.isMaxAttempt ? 1 : autoregFactor;
      const baseLoad = prs[lift.prKey];
      const stepLines = lift.steps.map((step) => {
        const load = roundToNearestPlate(baseLoad * step.percent * factor);
        const setsLabel = step.sets > 1 ? `${step.sets}x${step.reps}` : `${step.reps}`;
        return { load, setsLabel, percentLabel: `${Math.round(step.percent * 100)}%` };
      });
      const lastStep = lift.steps[lift.steps.length - 1];
      const lastLine = stepLines[stepLines.length - 1];
      const ladderText = `Escalera: ${stepLines.map((l) => `${l.percentLabel} ${l.setsLabel} @ ${l.load} kg`).join(', ')}.`;
      const complexNote =
        lift.complexMovementIds && lift.complexMovementIds.length > 0
          ? ` Complejo sin soltar la barra: ${lift.complexMovementIds.map((id) => getMovementById(id)?.name ?? id).join(' + ')}.`
          : '';
      const tempoNote = lift.tempo ? ` Tempo ${lift.tempo}.` : '';
      const pauseNote = lift.pauseSeconds ? ` Pausa de ${lift.pauseSeconds} s en la recepción/fondo.` : '';
      const maxNote = lift.isMaxAttempt
        ? ` Último número de la escalera: intento de 1RM real de ${lift.label.toLowerCase()} — el resto de la sesión sí lleva ajuste por tu estado de hoy, esto no.`
        : '';
      const freeNote = lift.note ? ` ${lift.note}` : '';

      return {
        movementId: lift.movementId,
        prKey: lift.prKey,
        block: lift.block,
        sets: lastStep.sets,
        reps: String(lastStep.reps),
        loadKg: lastLine.load,
        liftLabel: lift.label,
        tempo: lift.tempo,
        complexMovementIds: lift.complexMovementIds,
        notes: `${ladderText}${complexNote}${tempoNote}${pauseNote}${maxNote}${freeNote}`,
        isMaxAttempt: Boolean(lift.isMaxAttempt),
      };
    })
    .filter((l): l is ResolvedLadderLift => l !== null);
}
