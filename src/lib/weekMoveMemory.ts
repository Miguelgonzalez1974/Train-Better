/**
 * Qué se hizo con la propuesta del coach de mover un día de la semana (`weekCoach.ts`): se aplicó o se dijo «ahora no». En los dos casos no
 * vuelve a proponer nada esa semana (la clave es el lunes de la semana). Vive en este dispositivo, como el «deshacer» de la semana; sin
 * almacenamiento, la propuesta simplemente vuelve a salir.
 */
export type WeekMoveStatus = 'applied' | 'later';

const KEY = 'tb-week-move-v1';
const KEEP = 8;

export type WeekMoveMemory = Record<string, WeekMoveStatus>;

export function loadWeekMoveMemory(storage: Pick<Storage, 'getItem'> | null): WeekMoveMemory {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: WeekMoveMemory = {};
    for (const [week, status] of Object.entries(parsed)) if (status === 'applied' || status === 'later') out[week] = status;
    return out;
  } catch {
    return {};
  }
}

/** Apunta lo que pasó con la semana (conserva las últimas semanas, no todas). No muta la memoria que recibe. */
export function withWeekMoveStatus(memory: WeekMoveMemory, weekKey: string, status: WeekMoveStatus): WeekMoveMemory {
  const weeks = Object.keys({ ...memory, [weekKey]: status }).sort().slice(-KEEP);
  const out: WeekMoveMemory = {};
  for (const w of weeks) out[w] = w === weekKey ? status : memory[w];
  return out;
}

export function saveWeekMoveMemory(storage: Pick<Storage, 'setItem'> | null, memory: WeekMoveMemory): void {
  try {
    storage?.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* sin almacenamiento: la propuesta puede volver a salir */
  }
}
