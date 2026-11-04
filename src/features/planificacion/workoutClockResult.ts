import type { WodScoreType } from '../../data/athlete/types';
import type { WodResultForm } from '../../engine/wodScoring';

/**
 * Puente entre el reloj de entreno (modo "Entreno") y el resultado del WOD del cierre de sesión.
 * Cada vez que paras el cronómetro, el tiempo y las rondas se guardan aquí (solo el día de hoy); al cerrar la
 * sesión, el campo del resultado sale ya relleno con ello — editable, nunca se guarda solo. Sin reloj, todo
 * queda como siempre: el campo vacío.
 */

export interface ClockStop {
  /** Segundos del cronómetro al parar. */
  seconds: number;
  /** Rondas contadas a mano en ese momento. */
  rounds: number;
  /** El reloj se paró solo en el time cap de un WOD por tiempo: no se terminó. seconds es el cap. */
  capped?: boolean;
}

interface Stored {
  date: string;
  /** Una entrada por "tanda" del cronómetro (de arrancar desde cero hasta reiniciar). */
  runs: ClockStop[];
}

const KEY = 'train-better:clock-runs';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed && typeof parsed.date === 'string' && Array.isArray(parsed.runs) ? parsed : null;
  } catch {
    return null;
  }
}

/** Tandas del cronómetro guardadas para el día dado (vacío si no hay o son de otro día). */
export function readClockRuns(dateIso: string = todayIso()): ClockStop[] {
  const stored = read();
  return stored && stored.date === dateIso ? stored.runs : [];
}

/** Guarda (o actualiza) la parada de la tanda `runIndex` de hoy. */
export function recordClockStop(runIndex: number, stop: ClockStop): void {
  const date = todayIso();
  const stored = read();
  const runs = stored && stored.date === date ? [...stored.runs] : [];
  runs[runIndex] = stop;
  try {
    localStorage.setItem(KEY, JSON.stringify({ date, runs: runs.map((r) => r ?? { seconds: 0, rounds: 0 }) } satisfies Stored));
  } catch {
    /* sin persistencia, el reloj sigue funcionando — solo no habrá prellenado */
  }
}

/**
 * Qué tanda del reloj corresponde a cada parte del WOD. Un WOD normal usa la ÚLTIMA parada; en un día de doble WOD
 * la parte 1 es la primera tanda y la parte 2 la última (si hubo al menos dos).
 */
export function pickClockStop(runs: ClockStop[], part: 1 | 2, partCount: number): ClockStop | undefined {
  if (runs.length === 0) return undefined;
  if (partCount <= 1) return runs[runs.length - 1];
  if (part === 1) return runs[0];
  return runs.length >= 2 ? runs[runs.length - 1] : undefined;
}

/** Campos del formulario de resultado que el reloj puede rellenar según cómo se puntúa el WOD, o null si no aplica. */
export function clockFormFor(stop: ClockStop, scoreType: WodScoreType): Partial<WodResultForm> | null {
  if (scoreType === 'time' && stop.capped) {
    // Paró en el cap: no es un tiempo sino un WOD sin terminar, con las rondas contadas.
    return { capped: true, capSeconds: Math.round(stop.seconds), rounds: stop.rounds };
  }
  if (scoreType === 'time') {
    const total = Math.round(stop.seconds);
    return total >= 1 ? { minutes: Math.floor(total / 60), seconds: total % 60 } : null;
  }
  if (scoreType === 'rounds+reps') return stop.rounds >= 1 ? { rounds: stop.rounds } : null;
  return null; // reps totales y carga no se pueden deducir del reloj
}

export function isFormUntouched(form: WodResultForm): boolean {
  return form.minutes === 0 && form.seconds === 0 && form.rounds === 0 && form.extraReps === 0 && form.reps === 0 && form.load === 0 && !form.capped;
}

// ---------- Time cap del reloj ----------

/** Segundos antes del límite en los que el reloj avisa (pitido y vibración). */
export const CAP_WARN_SECONDS = 60;
/** Con un límite más corto que esto no se avisa del último minuto: no daría margen para oírlo. */
export const CAP_WARN_MIN_CAP = 90;

export type CapStep = { kind: 'run' } | { kind: 'warn' } | { kind: 'hit'; seconds: number };

/**
 * Qué hace el reloj en cada tic con un límite de tiempo: seguir, avisar del último minuto (una sola vez) o llegar al límite
 * (una sola vez: parar y dejar guardado lo que había). Sin límite, siempre sigue.
 */
export function capStep(elapsed: number, cap: { seconds: number } | null, state: { hit: boolean; warned: boolean }): CapStep {
  if (!cap || state.hit) return { kind: 'run' };
  if (elapsed >= cap.seconds) return { kind: 'hit', seconds: cap.seconds };
  if (!state.warned && cap.seconds > CAP_WARN_MIN_CAP && cap.seconds - elapsed <= CAP_WARN_SECONDS) return { kind: 'warn' };
  return { kind: 'run' };
}

export interface CapSnapshot {
  seconds: number;
  rounds: number;
  /** El límite era un cap de un WOD por tiempo (no el final de un AMRAP). */
  capped: boolean;
}

/**
 * La parada que se guarda para el resultado del WOD cuando el reloj está parado. Sin límite alcanzado, lo que marca el
 * cronómetro. Con el límite alcanzado, el límite: si el atleta siguió cronometrando después, también las rondas de ese
 * momento (lo que pasó tras el cap no cambia el resultado); si no, las rondas actuales, por si corrige un toque de más.
 */
export function clockStopToRecord(args: { elapsed: number; rounds: number; snapshot: CapSnapshot | null; continuedPastCap: boolean }): ClockStop {
  const { elapsed, rounds, snapshot, continuedPastCap } = args;
  if (!snapshot) return { seconds: Math.round(elapsed), rounds };
  return { seconds: snapshot.seconds, rounds: continuedPastCap ? snapshot.rounds : rounds, ...(snapshot.capped ? { capped: true } : {}) };
}

export interface CapView {
  /** Segundos que quedan hasta el límite (negativo si se pasó). */
  left: number;
  /** 0-1 */
  progress: number;
  lastMinute: boolean;
  /** Segundos cronometrados por encima del límite, tras seguir después de llegar. */
  over: number;
}

/** Lo que enseña el reloj respecto al límite: lo que queda, el avance, si es el último minuto y cuánto se pasó. */
export function capView(elapsed: number, cap: { seconds: number } | null, hit: boolean): CapView | null {
  if (!cap) return null;
  const left = cap.seconds - elapsed;
  return {
    left,
    progress: Math.min(1, Math.max(0, elapsed / cap.seconds)),
    lastMinute: !hit && left > 0 && left <= CAP_WARN_SECONDS && cap.seconds > CAP_WARN_MIN_CAP,
    over: hit ? Math.max(0, elapsed - cap.seconds) : 0,
  };
}
