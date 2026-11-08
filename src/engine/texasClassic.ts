import type { PersonalRecords, ProgramCompanion } from '../data/athlete/types';
import { roundToNearestPlate } from './oneRepMaxTables';
import { PROGRAM_LIFT_MOVEMENT_ID } from './strengthPrograms';

/**
 * Texas Method clásico, como programa que convive con el macro. Una semana son tres sesiones:
 *  - volumen (lunes): sentadilla 5×5 al 90 % de tu 5RM y, en el segundo puesto, press banca o press militar 5×5 al 90 %;
 *  - recuperación (miércoles): sentadilla 2×5 al 80 % del lunes y el otro press 3×5 al 90 %;
 *  - intensidad (viernes): un 5RM nuevo, 1×5, en sentadilla y en el press de la semana.
 * Banca y press militar se alternan por semana (A: banca de volumen y de marca; B: press militar). El 5RM de trabajo de cada levantamiento
 * sube cuando logras la marca del viernes: la progresión sale de tus resultados, no de un calendario. Puro y sin estado propio: lo que
 * cambia (los 5RM) vive en `ProgramCompanion.fiveRm`.
 */

export type TexasLiftKey = 'backSquat' | 'benchPress' | 'strictPress';
export type TexasRole = 'volumen' | 'recuperacion' | 'intensidad';

/** El 5RM se estima de tu PR (1RM) con este factor hasta que haya una marca real de 5 repeticiones. */
export const TEXAS_FIVE_RM_FROM_PR = 0.86;
/** Lo que sube el 5RM cada vez que se logra la marca del viernes. */
export const TEXAS_INCREMENT_KG = 2.5;
/** Sesiones por ciclo: volumen, recuperación e intensidad. */
export const TEXAS_CYCLE = 3;

const ROLES: TexasRole[] = ['volumen', 'recuperacion', 'intensidad'];
export const TEXAS_ROLE_LABEL: Record<TexasRole, string> = {
  volumen: 'Texas Method · día de volumen',
  recuperacion: 'Texas Method · día de recuperación',
  intensidad: 'Texas Method · día de intensidad',
};

const NOTE: Record<TexasRole, string> = {
  volumen: 'El día de más trabajo de la semana: 5×5 al 90 % de tu 5RM. Series limpias, sin llegar al fallo.',
  recuperacion: 'Día ligero para llegar fresco al viernes: la sentadilla baja al 80 % del lunes. El press va a trabajo normal.',
  intensidad: 'Hoy buscas un 5RM nuevo: una sola serie de 5 con la marca a batir. Calienta bien y para si la técnica se rompe; si no sale, vuelves a intentarlo con el mismo peso el próximo viernes.',
};

export interface TexasLift {
  liftKey: TexasLiftKey;
  movementId: string;
  sets: number;
  reps: number;
  loadKg: number;
  /** Es la marca a batir del viernes: se anota si salieron las 5 repeticiones. */
  attempt: boolean;
}

export interface TexasSession {
  /** Semana del ciclo (0 = la primera). */
  week: number;
  role: TexasRole;
  roleLabel: string;
  lifts: TexasLift[];
  note: string;
}

export function texasRole(index: number): TexasRole {
  return ROLES[((index % TEXAS_CYCLE) + TEXAS_CYCLE) % TEXAS_CYCLE];
}

/** Semana A (la primera y las pares): banca de volumen y de marca; semana B: press militar. */
function isWeekA(week: number): boolean {
  return week % 2 === 0;
}

/** Los levantamientos con marca a batir el viernes de la sesión `index` (que es de intensidad). */
function fridayLifts(index: number): TexasLiftKey[] {
  return isWeekA(Math.floor(index / TEXAS_CYCLE)) ? ['backSquat', 'benchPress'] : ['backSquat', 'strictPress'];
}

/** El 5RM de trabajo de hoy: la última marca lograda, o una estimación de tu PR si aún no hay. */
export function currentFiveRm(companion: Pick<ProgramCompanion, 'fiveRm'>, prs: PersonalRecords, lift: TexasLiftKey): number {
  return companion.fiveRm?.[lift] ?? roundToNearestPlate(prs[lift] * TEXAS_FIVE_RM_FROM_PR);
}

/** El 5RM que habrá al llegar a la sesión `index` si se logran todas las marcas de los viernes que hay entre `from` e `index`. */
function projectedFiveRm(companion: Pick<ProgramCompanion, 'fiveRm'>, prs: PersonalRecords, lift: TexasLiftKey, from: number, index: number): number {
  let wins = 0;
  for (let j = Math.max(0, from); j < index; j++) {
    if (texasRole(j) === 'intensidad' && fridayLifts(j).includes(lift)) wins += 1;
  }
  return currentFiveRm(companion, prs, lift) + wins * TEXAS_INCREMENT_KG;
}

function lift(liftKey: TexasLiftKey, sets: number, reps: number, loadKg: number, attempt = false): TexasLift {
  return { liftKey, movementId: PROGRAM_LIFT_MOVEMENT_ID[liftKey], sets, reps, loadKg: Math.max(0, roundToNearestPlate(loadKg)), attempt };
}

/**
 * La sesión número `index` del Texas Method. `from` = por dónde va el programa (el puntero): las marcas de los viernes entre `from` e
 * `index` se dan por logradas para proyectar (así se puede enseñar el programa entero); para la sesión de hoy, `from === index` y no se
 * proyecta nada. `autoreg` baja o sube las cargas de volumen y recuperación; la marca del viernes no se toca.
 */
export function texasSessionAt(
  index: number,
  companion: Pick<ProgramCompanion, 'fiveRm'>,
  prs: PersonalRecords,
  opts: { from?: number; autoreg?: number } = {},
): TexasSession {
  const from = opts.from ?? index;
  const autoreg = opts.autoreg ?? 1;
  const week = Math.floor(index / TEXAS_CYCLE);
  const role = texasRole(index);
  const weekA = isWeekA(week);
  const five = (k: TexasLiftKey) => projectedFiveRm(companion, prs, k, from, index);

  const monSecondary: TexasLiftKey = weekA ? 'benchPress' : 'strictPress';
  const wedSecondary: TexasLiftKey = weekA ? 'strictPress' : 'benchPress';
  const mondaySquat = roundToNearestPlate(0.9 * five('backSquat') * autoreg);

  let lifts: TexasLift[];
  if (role === 'volumen') {
    lifts = [lift('backSquat', 5, 5, mondaySquat), lift(monSecondary, 5, 5, 0.9 * five(monSecondary) * autoreg)];
  } else if (role === 'recuperacion') {
    lifts = [lift('backSquat', 2, 5, 0.8 * mondaySquat), lift(wedSecondary, 3, 5, 0.9 * five(wedSecondary) * autoreg)];
  } else {
    lifts = fridayLifts(index).map((k) => lift(k, 1, 5, five(k) + TEXAS_INCREMENT_KG, true));
  }
  return { week, role, roleLabel: TEXAS_ROLE_LABEL[role], lifts, note: NOTE[role] };
}

/** Anota los viernes logrados: el 5RM de trabajo pasa a ser el peso con el que salieron las 5 repeticiones. */
export function recordFiveRm(companion: ProgramCompanion, achieved: Partial<Record<TexasLiftKey, number>>): ProgramCompanion {
  const fiveRm = { ...(companion.fiveRm ?? {}) };
  for (const [key, kg] of Object.entries(achieved) as [TexasLiftKey, number][]) {
    if (kg > 0) fiveRm[key] = kg;
  }
  return { ...companion, fiveRm };
}
