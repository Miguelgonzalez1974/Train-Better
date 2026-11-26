import type { AthleteProfile, CompanionLogEntry, DailySession, SessionBlockResult, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById, resolveMovementDisplayName } from '../../data/movements';
import { complexLogId } from '../../data/complexes';
import { pctOfMark } from '../../engine/movementProgress';
import { describeSkipped } from '../../engine/sessionParts';
import { companionStatus, isCompanionProgram } from '../../engine/strengthCompanion';
import { wodResultsOf } from '../../engine/wodScoring';
import { competitionHeadline } from '../shell/competitionMeta';
import { buildPreviewLine } from './previewLine';
import { wodHow, wodWhat } from './sessionCardWod';
import type { StrainView } from './StrainRing';

/**
 * La tarjeta de sesión del Resumen: arriba el título y el esfuerzo; en medio dos columnas (el peso principal y el WOD) y abajo una sola línea más.
 * Es lo que se ve antes de entrenar («La última vez: 97,5 kg»); una vez hecha, la sesión pasa a ser una fila (ver `DayRows`) y este modelo solo
 * queda como respaldo.
 * Puro: lo pinta `SessionCard`.
 */

export interface CardFigure {
  value: string;
  label: string;
  /** La columna del WOD: letra algo menor, hasta dos líneas y más ancha. */
  kind?: 'wod';
  /** Cifra en gris: algo que no se hizo. */
  tone?: 'muted';
}

/** El esfuerzo junto al título: lo previsto antes de entrenar o lo hecho después, con el máximo de tu objetivo para dibujar su anillo. */
export interface CardEffort {
  value: number;
  planned: boolean;
  label: string;
  /** Se pasa del objetivo. */
  over: boolean;
  /** El máximo del objetivo de hoy (0–100). */
  high: number;
}

export interface CardLine {
  icon: 'history' | 'up' | 'down' | 'same' | 'alert' | 'plus' | 'check';
  text: string;
  /** Un aviso (en ámbar). */
  warn?: boolean;
  /** Los pesos de las últimas veces del levantamiento principal (el más reciente al final), para el mini gráfico. */
  spark?: number[];
}

export interface SessionCardModel {
  kind: 'pending' | 'done' | 'rest' | 'compete' | 'program' | 'empty' | 'missing';
  title: string;
  /** Minutos (o minutos y RPE): al final de la última línea; sin cifras, bajo el título. */
  meta?: string;
  effort?: CardEffort;
  figures: CardFigure[];
  line?: CardLine;
  /** Qué abre al tocarla: la sesión en Planificación, la pantalla del entreno hecho, o nada. */
  action: 'plan' | 'done' | 'none';
}

export interface SessionCardInput {
  isToday: boolean;
  /** La sesión prevista de hoy (null si ya entrenaste, no hay plan o es otro día). */
  session: DailySession | null;
  /** Lo registrado el día elegido. */
  entry: SessionHistoryEntry | undefined;
  strain: StrainView;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  workLog: WorkSetEntry[];
  /** El día que se está mirando. */
  dayIso: string;
  /** Sesiones del programa de fuerza del día elegido. */
  companionDone: CompanionLogEntry[];
}

const SPARK_POINTS = 5;
/** A partir de aquí el título no cabe junto al esfuerzo y se quita «Hoy:» (ya estás en el día de hoy). */
const TITLE_ROOM = 24;
/** Con coma decimal, como el resto de textos: «102,5». */
const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const kg = (v: number) => `${num(v)} kg`;
const blockName = (b: SessionBlockResult) => b.complex?.name ?? resolveMovementDisplayName(b.movementId);
const logIdOf = (b: SessionBlockResult) => (b.complex ? complexLogId(b.complex.id) : b.movementId);

const dayDiff = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);

export function agoText(fromIso: string, toIso: string): string {
  const days = dayDiff(fromIso, toIso);
  if (days <= 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return `hace ${Math.round(days / 7)} sem`;
}

/** El peso más alto que salió cada día en un movimiento, antes de `beforeIso`, del más antiguo al más reciente. */
export function topsBefore(workLog: WorkSetEntry[], movementId: string, beforeIso: string): { date: string; kg: number }[] {
  const byDay = new Map<string, number>();
  for (const s of workLog) {
    if (s.movementId !== movementId || s.date >= beforeIso || s.kg <= 0 || s.quality === 'fallada') continue;
    byDay.set(s.date, Math.max(byDay.get(s.date) ?? 0, s.kg));
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, top]) => ({ date, kg: top }));
}

/** El levantamiento que da nombre a la sesión (fuerza con peso; si no, el último de halterofilia) y el siguiente, para los días sin WOD. */
function mainLifts(session: DailySession): SessionBlockResult[] {
  const lifts = session.blocks.filter((b) => (b.block === 'strength' || b.block === 'oly') && !b.subgroup);
  const loaded = lifts.filter((b) => (b.loadKg ?? 0) > 0);
  const strength = loaded.filter((b) => b.block === 'strength');
  const oly = loaded.filter((b) => b.block === 'oly').reverse();
  const ordered = [...strength.slice(0, 1), ...oly.slice(0, 1), ...strength.slice(1), ...oly.slice(1)];
  return ordered.length > 0 ? ordered : lifts;
}

/** La cifra de un levantamiento: su peso y, debajo, series y % de tu 1RM. Con `named` va también el nombre (cuando el titular no lo dice). */
function liftFigure(b: SessionBlockResult, profile: AthleteProfile, named = false): CardFigure {
  const reps = b.reps ?? '';
  const scheme = b.sets && !reps.includes('-') ? `${b.sets}×${reps}` : reps;
  const pct = b.complex || !b.loadKg ? null : pctOfMark(getMovementById(b.movementId), b.loadKg, profile.prs, profile.variantPrs);
  return {
    value: b.loadKg ? kg(b.loadKg) : scheme || '—',
    label: [named ? blockName(b) : null, b.loadKg && scheme ? scheme : null, pct !== null ? `${pct} %` : null].filter(Boolean).join(' · ') || blockName(b),
  };
}

/** El resultado que ya tienes en un benchmark que se repite («tu marca 4:58»), el más reciente. */
export function previousBenchmarkMark(history: SessionHistoryEntry[], benchmarkId: string, beforeIso: string): string | null {
  const past = history.filter((h) => h.date < beforeIso && h.movementIds?.includes(benchmarkId) && h.wodResult?.value && !h.wodResult.capped).sort((a, b) => a.date.localeCompare(b.date));
  return past.length > 0 ? past[past.length - 1].wodResult!.value : null;
}

function wodFigure(session: DailySession, history: SessionHistoryEntry[]): CardFigure | null {
  const blocks = session.blocks.filter((b) => b.block === 'wod');
  if (blocks.length === 0) return null;
  const how = wodHow(session);
  const bench = blocks[0].movementId.startsWith('benchmark:') ? blocks[0].movementId : null;
  const mark = bench && !session.doubleWod ? previousBenchmarkMark(history, bench, session.date) : null;
  return { kind: 'wod', value: wodWhat(blocks) || blocks[0].title || 'WOD', label: ['WOD', how, mark ? `tu marca ${mark}` : null].filter(Boolean).join(' · ') };
}

/** «Hoy: Push Press + WOD», sin «Hoy:» cuando no cabe. */
function pendingTitle(name: string): string {
  const full = `Hoy: ${name}`;
  return full.length > TITLE_ROOM ? name : full;
}

function pendingModel(input: SessionCardInput, session: DailySession): SessionCardModel {
  const { profile, history, workLog, strain, dayIso } = input;
  const lifts = mainLifts(session);
  const main = lifts[0];
  const wod = wodFigure(session, history);
  const second = !wod && lifts[1] ? liftFigure(lifts[1], profile, true) : null;
  const figures: CardFigure[] = [...(main ? [liftFigure(main, profile)] : []), ...(wod ? [wod] : second ? [second] : [])];
  const planned = strain.planned ? Math.round(strain.planned.strain) : null;
  const over = planned !== null && planned > strain.target.high;
  const effort: CardEffort | undefined = planned === null ? undefined : { value: planned, planned: true, label: over ? 'se pasa' : 'previsto', over, high: strain.target.high };

  const name = session.source === 'custom' ? session.customTitle || 'Sesión propia' : session.doubleWod ? 'Doble WOD' : main ? `${blockName(main)}${wod ? ' + WOD' : ''}` : buildPreviewLine(session);

  // Una sola línea más, por este orden: el coach ha cambiado la sesión, toca el programa de fuerza, o de dónde partes.
  let line: CardLine | undefined;
  const light = session.dayLight?.color;
  const program = (profile.strengthPrograms ?? []).filter(isCompanionProgram).find((p) => dayIso >= p.startDate && dayIso <= p.endDate);
  const programKind = program ? companionStatus(program, dayIso).kind : null;
  if (light === 'ambar' || light === 'rojo') line = { icon: 'alert', warn: true, text: `Sesión ajustada: día ${light === 'ambar' ? 'ámbar' : 'rojo'}` };
  else if (programKind === 'oferta' || programKind === 'aceptada') line = { icon: 'plus', text: 'Hoy también toca el programa de fuerza' };
  else if (main) {
    const tops = topsBefore(workLog, logIdOf(main), dayIso);
    const last = tops[tops.length - 1];
    if (last) line = { icon: 'history', text: `Última vez: ${kg(last.kg)} · ${agoText(last.date, dayIso)}`, spark: tops.slice(-SPARK_POINTS).map((t) => t.kg) };
  }

  return { kind: 'pending', title: pendingTitle(name), ...(effort ? { effort } : {}), figures, ...(line ? { line } : {}), action: 'plan' };
}

/** La columna del WOD ya hecho: el resultado en grande y debajo lo que era. */
function doneWodFigure(entry: SessionHistoryEntry): CardFigure | null {
  const blocks = entry.wodBlocks ?? [];
  const what = blocks.length > 0 ? wodWhat(blocks) : '';
  const results = wodResultsOf(entry);
  if (results.length > 0) {
    const value = `${results.map((r) => r.result.value).join(' · ')} ${entry.rxOrScaled === 'rx' ? 'Rx' : 'escalado'}`;
    return { kind: 'wod', value, label: what ? `WOD · ${what}` : 'WOD' };
  }
  if ((entry.skipped ?? []).some((p) => p.block === 'wod')) return { kind: 'wod', value: '—', label: 'WOD sin hacer', tone: 'muted' };
  return what ? { kind: 'wod', value: what, label: 'WOD · sin resultado' } : null;
}

function doneModel(input: SessionCardInput, entry: SessionHistoryEntry): SessionCardModel {
  const { profile, workLog, strain, dayIso, companionDone } = input;
  // Sin nombre de ejercicio (un registro antiguo incompleto) la serie no puede enseñarse: se ignora.
  const sets = workLog.filter((s) => s.date === dayIso && s.kg > 0 && s.quality !== 'fallada' && Boolean(s.movementId));
  const topOf = (list: WorkSetEntry[]) => list.reduce<WorkSetEntry | null>((best, s) => (!best || s.kg > best.kg ? s : best), null);
  const main = topOf(sets.filter((s) => s.block === 'strength')) ?? topOf(sets.filter((s) => s.block === 'oly'));
  const other = main ? topOf(sets.filter((s) => s.movementId !== main.movementId)) : null;

  const lift = (s: WorkSetEntry): { figure: CardFigure; previous: { date: string; kg: number }[] } => {
    const previous = topsBefore(workLog, s.movementId, dayIso);
    const best = previous.reduce((m, t) => Math.max(m, t.kg), 0);
    const record = previous.length > 0 && s.kg > best;
    const pct = pctOfMark(getMovementById(s.movementId), s.kg, profile.prs, profile.variantPrs);
    return { previous, figure: { value: kg(s.kg), label: [resolveMovementDisplayName(s.movementId), record ? 'récord' : null, pct !== null ? `${pct} %` : null].filter(Boolean).join(' · ') } };
  };
  const mainLift = main ? lift(main) : null;

  const wod = doneWodFigure(entry);
  const second = !wod && other ? lift(other).figure : null;

  const real = strain.real === null ? null : Math.round(strain.real);
  const diff = real === null ? 0 : real > strain.target.high ? real - strain.target.high : real < strain.target.low ? real - strain.target.low : 0;
  const effort: CardEffort | undefined =
    real === null ? undefined : { value: real, planned: false, label: diff > 0 ? `te pasas +${Math.round(diff)}` : diff < 0 ? 'por debajo' : 'en objetivo', over: diff > 0, high: strain.target.high };

  const programHecho = companionDone.some((c) => c.outcome === 'hecha');
  const skipped = describeSkipped(entry.skipped);
  let line: CardLine | undefined;
  const last = mainLift?.previous[mainLift.previous.length - 1];
  if (main && last) {
    const delta = Math.round((main.kg - last.kg) * 100) / 100;
    line = delta === 0 ? { icon: 'same', text: 'Igual que la última vez' } : { icon: delta > 0 ? 'up' : 'down', text: `${delta > 0 ? '+' : '−'}${num(Math.abs(delta))} kg frente a la última vez` };
  } else if (skipped) line = { icon: 'alert', text: skipped };
  else if (programHecho) line = { icon: 'check', text: 'Programa de fuerza hecho' };

  return {
    kind: 'done',
    title: 'Sesión hecha',
    // Un registro antiguo puede no tener duración o RPE: se dice solo lo que hay.
    meta: [entry.durationMin ? `${entry.durationMin} min` : null, entry.rpe ? `RPE ${entry.rpe}` : null].filter(Boolean).join(' · ') || undefined,
    ...(effort ? { effort } : {}),
    figures: [...(mainLift ? [mainLift.figure] : []), ...(wod ? [wod] : second ? [second] : [])],
    ...(line ? { line } : {}),
    action: 'done',
  };
}

const plain = (kind: SessionCardModel['kind'], title: string, meta: string, action: SessionCardModel['action']): SessionCardModel => ({ kind, title, meta, figures: [], action });

/**
 * La tarjeta del día. Si algo de los datos guardados la rompe, sale una tarjeta mínima que lleva a la sesión (o a lo hecho): un fallo aquí nunca debe dejar
 * el Resumen —ni la app— sin pintar.
 */
export function buildSessionCard(input: SessionCardInput): SessionCardModel {
  try {
    return modelFor(input);
  } catch (error) {
    console.error('La tarjeta de sesión no se pudo calcular:', error);
    return input.entry ? plain('done', 'Sesión completada', 'toca para ver lo que hiciste', 'done') : plain('empty', 'Tu sesión de hoy', 'toca para verla', input.isToday ? 'plan' : 'none');
  }
}

function modelFor(input: SessionCardInput): SessionCardModel {
  const { entry, session, isToday, companionDone } = input;
  if (entry) return doneModel(input, entry);
  const program = companionDone.find((c) => c.outcome === 'hecha');
  if (program && (!isToday || !session)) return plain('program', 'Programa de fuerza hecho', program.label ?? 'Sesión del programa', 'done');
  if (!isToday) return plain('missing', 'Sin sesión registrada', 'ese día no entrenaste', 'none');
  if (session?.competition?.eventDay) return plain('compete', 'Hoy compites', competitionHeadline(session.competition), 'plan');
  if (session?.isRestDay) return plain('rest', 'Día de descanso', 'toca recuperar', 'plan');
  if (session) return pendingModel(input, session);
  return plain('empty', 'Elige qué entrenar hoy', 'sin macrociclo ni programa', 'plan');
}
