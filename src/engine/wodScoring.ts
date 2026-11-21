import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { describeWodResultVsTarget } from './wodTargets';
import type { DailySession, SessionBlockResult, SessionHistoryEntry, WodResult, WodScoreType } from '../data/athlete/types';

function inferScoreTypeFromFormat(format: string): WodScoreType {
  if (format.startsWith('For Time')) return 'time';
  if (format.startsWith('AMRAP')) return 'rounds+reps';
  // La recuperación activa («RPE 2 · 45 min total»): bici y un corte, una y otra vez durante 45 minutos. Se cuenta en vueltas (rondas) hechas en ese tiempo.
  if (/\bmin total\b/i.test(format)) return 'rounds+reps';
  if (format.startsWith('EMOM')) return 'reps';
  // "Al máximo · N x 3:00 …" -> se puntúa por repeticiones totales.
  if (format.startsWith('Al máximo')) return 'reps';
  // Test de complex (varios movimientos a la misma carga, ver "temporada" en strengthPrograms.ts)
  // — se puntua por el peso mas pesado completado, no por reps ni tiempo. Se comprueba antes que la
  // regla generica de "Test —" de abajo, que es para el test de maximo de reps.
  if (format.startsWith('Test — Complex')) return 'load';
  // Test de maximo de reps a carga submaxima — se puntua en repeticiones conseguidas, igual que un
  // EMOM, no en tiempo.
  if (format.startsWith('Test —')) return 'reps';
  // Die Set (peso auto-seleccionado por el atleta, ver "dieSet" en strengthPrograms.ts) — tambien se puntua en reps.
  if (format.startsWith('Die Set')) return 'reps';
  return 'time';
}

/** Campos del formulario de resultado de un WOD (los que apliquen segun el tipo de puntuacion). */
export interface WodResultForm {
  minutes: number;
  seconds: number;
  rounds: number;
  extraReps: number;
  reps: number;
  load: number;
  /** Solo en WODs por tiempo: no se terminó, se paró en el time cap. Entonces `rounds` / `extraReps` dicen lo que se hizo. */
  capped?: boolean;
  /** Segundos del time cap en el que se paró, si se conocen. */
  capSeconds?: number;
}

export const EMPTY_WOD_FORM: WodResultForm = { minutes: 0, seconds: 0, rounds: 0, extraReps: 0, reps: 0, load: 0 };

export type WodNumberField = 'minutes' | 'seconds' | 'rounds' | 'extraReps' | 'reps' | 'load';

/**
 * Sube o baja un campo del resultado con los botones + y − (sin escribir): nunca baja de 0, los segundos se quedan entre 0 y 59 y la carga va de
 * cuarto en cuarto de kilo. Devuelve lo que hay que cambiar en el formulario.
 */
export function bumpWodForm(form: WodResultForm, field: WodNumberField, delta: number): Partial<WodResultForm> {
  const max = field === 'seconds' ? 59 : Infinity;
  const raw = (form[field] || 0) + delta;
  const next = field === 'load' ? Math.round(raw * 4) / 4 : Math.round(raw);
  return { [field]: Math.max(0, Math.min(max, next)) };
}

/** Convierte el formulario en el `WodResult` que se guarda ("9:05", "6+4", "185 reps", "70 kg"). */
export function buildWodResult(scoreType: WodScoreType, form: WodResultForm): WodResult {
  // Un WOD por tiempo que no se terminó: se guarda como CAP con lo que se hizo, no como un tiempo.
  if (scoreType === 'time' && form.capped) {
    const done = form.rounds > 0 ? (form.extraReps > 0 ? `${form.rounds}+${form.extraReps}` : `${form.rounds}`) : form.extraReps > 0 ? `${form.extraReps} reps` : '';
    return { scoreType, value: done ? `CAP · ${done}` : 'CAP', capped: true, ...(form.capSeconds && form.capSeconds > 0 ? { capSeconds: Math.round(form.capSeconds) } : {}) };
  }
  if (scoreType === 'time') return { scoreType, value: `${form.minutes}:${String(form.seconds).padStart(2, '0')}` };
  if (scoreType === 'rounds+reps') return { scoreType, value: form.extraReps > 0 ? `${form.rounds}+${form.extraReps}` : `${form.rounds}` };
  if (scoreType === 'reps') return { scoreType, value: `${form.reps} reps` };
  return { scoreType: 'load', value: `${form.load} kg` };
}

/**
 * Lo contrario de `buildWodResult`: el formulario de un resultado ya guardado («9:05», «6+4», «185 reps», «70 kg», «CAP · 3+7»), para volver a
 * enseñarlo relleno al corregir una sesión. Si el valor no se entiende, el formulario sale vacío.
 */
export function formFromWodResult(result: WodResult | undefined): WodResultForm {
  if (!result) return EMPTY_WOD_FORM;
  const v = result.value.trim();
  const num = (s: string | undefined) => (s ? Number(s) : 0);
  if (result.capped || /^CAP/i.test(v)) {
    const m = v.match(/(\d+)\+(\d+)/);
    const reps = v.match(/(\d+)\s*reps/i);
    const rounds = !m ? v.match(/CAP\s*·\s*(\d+)\s*$/i) : null;
    return { ...EMPTY_WOD_FORM, capped: true, rounds: m ? num(m[1]) : rounds ? num(rounds[1]) : 0, extraReps: m ? num(m[2]) : reps ? num(reps[1]) : 0, ...(result.capSeconds ? { capSeconds: result.capSeconds } : {}) };
  }
  if (result.scoreType === 'time') {
    const m = v.match(/^(\d+):(\d{1,2})$/);
    return m ? { ...EMPTY_WOD_FORM, minutes: num(m[1]), seconds: num(m[2]) } : EMPTY_WOD_FORM;
  }
  if (result.scoreType === 'rounds+reps') {
    const m = v.match(/^(\d+)(?:\+(\d+))?$/);
    return m ? { ...EMPTY_WOD_FORM, rounds: num(m[1]), extraReps: num(m[2]) } : EMPTY_WOD_FORM;
  }
  if (result.scoreType === 'reps') {
    const m = v.match(/^(\d+)/);
    return m ? { ...EMPTY_WOD_FORM, reps: num(m[1]) } : EMPTY_WOD_FORM;
  }
  const m = v.match(/^(\d+(?:[.,]\d+)?)/);
  return m ? { ...EMPTY_WOD_FORM, load: Number(m[1].replace(',', '.')) } : EMPTY_WOD_FORM;
}

/** Partes de WOD que tiene la sesion: [1] un WOD normal, [1, 2] un dia de doble WOD, [] sin WOD. */
export function getWodParts(session: DailySession): (1 | 2)[] {
  const wod = session.blocks.filter((b) => b.block === 'wod');
  if (wod.length === 0) return [];
  return wod.some((b) => b.wodPart === 2) ? [1, 2] : [1];
}

/** Un resultado de WOD "0:00" / "0+0" / "0" es un formulario sin rellenar, no una marca. */
export function isMeaningfulWodResult(result: WodResult | undefined): result is WodResult {
  return Boolean(result) && !/^0([:+]0+)?$/.test(result!.value.trim());
}

/** Resultados de WOD anotados en una entrada del historial, por parte y solo los rellenados (0, 1 o 2). */
export function wodResultsOf(entry: SessionHistoryEntry): { part: 1 | 2; result: WodResult }[] {
  const out: { part: 1 | 2; result: WodResult }[] = [];
  if (isMeaningfulWodResult(entry.wodResult)) out.push({ part: 1, result: entry.wodResult });
  if (isMeaningfulWodResult(entry.wodResult2)) out.push({ part: 2, result: entry.wodResult2 });
  return out;
}

/**
 * Determina como debe puntuarse el WOD de la sesion (benchmark o custom) para pedir el input correcto.
 * En un dia de doble WOD cada parte se puntua aparte (`part`); en un dia normal solo existe la parte 1.
 */
export function getWodScoreType(session: DailySession, part: 1 | 2 = 1): WodScoreType | null {
  const all = session.blocks.filter((b) => b.block === 'wod');
  const wodEntries = all.some((b) => b.wodPart !== undefined) ? all.filter((b) => (b.wodPart ?? 1) === part) : part === 1 ? all : [];
  if (wodEntries.length === 0) return null;

  const benchmarkEntry = wodEntries.find((b) => b.movementId.startsWith('benchmark:'));
  if (benchmarkEntry) {
    const benchmarkId = benchmarkEntry.movementId.replace('benchmark:', '');
    const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
    if (wod) return wod.scoreType;
  }

  const format = wodEntries[0]?.format;
  return format ? inferScoreTypeFromFormat(format) : null;
}

/**
 * Lineas del resumen post-sesion para el/los WOD del dia: nombre (benchmark, o los movimientos reales),
 * el resultado anotado y, si el WOD traia un objetivo numerico, como fue frente a el. Un dia de doble WOD
 * genera un bloque de lineas por parte ("WOD · parte 1", "WOD · parte 2"); un dia normal, las de siempre.
 */
export function buildWodRecapLines(session: DailySession, entry: SessionHistoryEntry): { label: string; detail: string }[] {
  const wodBlocks = session.blocks.filter((b) => b.block === 'wod');
  if (wodBlocks.length === 0) return [];
  const parts = getWodParts(session);
  const multi = parts.length > 1;
  const lines: { label: string; detail: string }[] = [];
  for (const part of parts) {
    const blocks = multi ? wodBlocks.filter((b) => (b.wodPart ?? 1) === part) : wodBlocks;
    if (blocks.length === 0) continue;
    let name: string | null;
    if (blocks[0].movementId.startsWith('benchmark:')) {
      const id = blocks[0].movementId.replace('benchmark:', '');
      name = benchmarkWorkouts.find((w) => w.id === id)?.name ?? id;
    } else {
      const rawIds = multi ? [...new Set(blocks.map((b) => b.movementId))] : entry.wodMovementIds?.length ? entry.wodMovementIds : blocks.map((b) => b.movementId);
      const names = rawIds.map((id) => getMovementById(id)?.name).filter((n): n is string => Boolean(n));
      name = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ') || null;
    }
    if (!name) continue;
    const result = part === 1 ? entry.wodResult : entry.wodResult2;
    const done = isMeaningfulWodResult(result);
    lines.push({ label: multi ? `WOD · parte ${part}` : 'WOD', detail: done ? `${name} — ${result.value}` : name });
    // Objetivo orientativo (del motor, o el publicado de un WOD real) vs. lo que hiciste, solo con banda numerica.
    const targeted = blocks.find((b) => b.wodTarget && (b.wodTarget.low > 0 || b.wodTarget.high > 0));
    if (done && targeted?.wodTarget) {
      const verdict = describeWodResultVsTarget(result, { ...targeted.wodTarget, note: '' });
      if (verdict) lines.push({ label: multi ? `Objetivo · parte ${part}` : 'Objetivo', detail: `${targeted.wodTarget.display} · ${verdict}` });
    }
  }
  return lines;
}

/** Encuentra el bloque de test 1RM del dia (fuerza u oly, si lo hay), para pedir el peso real levantado. */
export function getTestDayBlock(session: DailySession): SessionBlockResult | null {
  return session.blocks.find((b) => (b.block === 'strength' || b.block === 'oly') && b.format === 'Test 1RM') ?? null;
}
