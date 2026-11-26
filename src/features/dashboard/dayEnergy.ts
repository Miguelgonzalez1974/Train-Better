import type { AthleteProfile, DailySession, NightFeel, SessionBlockResult, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { clampEnergy, costOfSrpe, nightAdjust, shiftIso, sleepGain, CARRY_SHARE, spendOfEntry } from '../../engine/energy';
import { loadHistoryFor } from '../../engine/readinessAt';
import { strainFromSrpe } from '../../engine/strain';
import { blockMinutes } from '../../lib/sessionDuration';
import { otherKindInfo } from '../planificacion/otherActivity';

/**
 * El día contado en energía: cada cosa entrenada (la sesión por bloques, el programa de fuerza y los entrenos añadidos), lo que ha restado, lo que
 * queda por hacer y con cuánta energía se acaba. La mañana es la preparación (ver `engine/energy.ts`). Puro: lo pintan el anillo, las tarjetas y el
 * gráfico del Dashboard.
 */

export type BlockKey = 'fuerza' | 'oly' | 'wod' | 'accesorio' | 'tecnica';

export const BLOCK_COLOR: Record<BlockKey, string> = { fuerza: '#8b5cf6', oly: '#0ea5e9', wod: 'rgb(var(--c-brand-orange))', accesorio: 'rgb(var(--c-brand-gold))', tecnica: '#ec4899' };
export const PROGRAM_COLOR = '#a78bfa';
export const WORKOUT_COLOR = '#14b8a6';
export const SESSION_COLOR = '#8b5cf6';

const BLOCK_LABEL: Record<BlockKey, string> = { fuerza: 'Fuerza', oly: 'Oly', wod: 'WOD', accesorio: 'Accesorio', tecnica: 'Técnica' };
/** Lo intenso que es cada bloque por minuto, para repartir el gasto de la sesión (una estimación: el total sale de tu RPE). */
const BLOCK_WEIGHT: Record<BlockKey, number> = { wod: 1.3, fuerza: 1, oly: 0.8, accesorio: 0.7, tecnica: 0.4 };
/** Una fuerza u oly con series falladas cuesta más. */
const FAILED_WEIGHT = 1.2;
const WOD_FEEL_WEIGHT = { facil: 0.85, justo: 1, duro: 1.2 } as const;
const BLOCK_OF: Partial<Record<SessionBlockResult['block'], BlockKey>> = { strength: 'fuerza', oly: 'oly', wod: 'wod', accessory: 'accesorio', skill: 'tecnica' };

export interface EnergyBlock {
  key: BlockKey;
  label: string;
  cost: number;
  color: string;
}

export interface EnergyItem {
  id: string;
  kind: 'sesion' | 'programa' | 'libre';
  name: string;
  /** Hora de inicio en horas («13,5»); null si no se sabe. */
  start: number | null;
  minutes: number;
  rpe: number;
  cost: number;
  done: boolean;
  color: string;
  blocks?: EnergyBlock[];
  /** El id en `profile.workouts` (solo los entrenos libres, que se pueden corregir). */
  workoutId?: string;
}

export interface DayEnergy {
  /** La preparación de la mañana; null si aún no hay datos. */
  morning: number | null;
  /** Lo hecho (por hora) y, hoy, lo que queda por hacer al final. */
  items: EnergyItem[];
  /** Lo gastado por lo hecho. */
  spent: number;
  /** La energía de ahora (o la del final del día) sin la respuesta de la noche. */
  computed: number | null;
  nightFeel: NightFeel | undefined;
  /** La energía que queda: la calculada, corregida por la respuesta de la noche. */
  energy: number | null;
  /** Lo que costaría lo que queda por hacer y con cuánto se acabaría. */
  pending: number;
  projected: number | null;
  /** El esfuerzo del día (0-100) con todo lo hecho. */
  effort: number;
}

/** Reparte `total` en partes proporcionales a `weights` que suman exactamente `total` (los restos, a las mayores fracciones). */
export function shareOut(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, rest: v - Math.floor(v) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0, left = total - out.reduce((s, v) => s + v, 0); k < left; k++) out[order[k].i] += 1;
  return out;
}

interface SplitOptions {
  date: string;
  workLog?: WorkSetEntry[];
  wodFeel?: keyof typeof WOD_FEEL_WEIGHT;
}

/** El gasto de una sesión repartido entre sus bloques: por minutos estimados, lo intenso que es cada uno y cómo salió. */
export function blockShares(session: DailySession, total: number, opts: SplitOptions): EnergyBlock[] {
  if (session.isRestDay || session.source === 'custom') return [];
  const minutes = blockMinutes(session);
  const present: BlockKey[] = [];
  for (const b of session.blocks) {
    const key = BLOCK_OF[b.block];
    if (key && !present.includes(key)) present.push(key);
  }
  if (present.length === 0) return [];
  const failed = new Set<BlockKey>((opts.workLog ?? []).filter((s) => s.date === opts.date && s.quality === 'fallada').map((s) => (s.block === 'strength' ? 'fuerza' : 'oly')));
  const weights = present.map((key) => {
    const block = key === 'fuerza' ? 'strength' : key === 'oly' ? 'oly' : key === 'wod' ? 'wod' : key === 'accesorio' ? 'accessory' : 'skill';
    let weight = (minutes[block] || 1) * BLOCK_WEIGHT[key];
    if (failed.has(key)) weight *= FAILED_WEIGHT;
    if (key === 'wod' && opts.wodFeel) weight *= WOD_FEEL_WEIGHT[opts.wodFeel];
    return weight;
  });
  const costs = shareOut(total, weights);
  return present.map((key, i) => ({ key, label: BLOCK_LABEL[key], cost: costs[i], color: BLOCK_COLOR[key] }));
}

/** «19:40» → 19,67; null si no es una hora. */
export function hourOf(time: string | undefined): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h < 24 ? h : null;
}

export interface DayEnergyInput {
  profile: AthleteProfile;
  /** El historial del macro, sin sumar nada. */
  history: SessionHistoryEntry[];
  dateIso: string;
  /** La preparación de ese día (la energía con la que se sale). */
  morning: number | null;
  /** La sesión de ese día (la prevista, o la guardada si ya se hizo). */
  session: DailySession | null;
  /** Lo que se espera de la sesión de hoy y del programa de fuerza aceptado, si aún no se han hecho. */
  plannedSession?: { rpe: number; minutes: number } | null;
  plannedProgram?: { rpe: number; minutes: number } | null;
  workLog?: WorkSetEntry[];
}

export function buildDayEnergy(input: DayEnergyInput): DayEnergy {
  const { profile, history, dateIso, morning, session } = input;
  const done: EnergyItem[] = [];

  const entry = history.find((h) => h.date === dateIso);
  if (entry) {
    const end = hourOf(entry.closedAt);
    done.push({
      id: 'sesion',
      kind: 'sesion',
      name: session?.source === 'custom' ? session.customTitle || 'Sesión propia' : 'Sesión hecha',
      start: end === null ? null : Math.max(0, end - entry.durationMin / 60),
      minutes: entry.durationMin,
      rpe: entry.rpe,
      cost: costOfSrpe(entry.rpe * entry.durationMin),
      done: true,
      color: SESSION_COLOR,
    });
  }
  for (const c of profile.companionLog ?? []) {
    if (c.date !== dateIso || c.outcome !== 'hecha' || !c.rpe || !c.durationMin) continue;
    done.push({ id: `programa:${c.id}`, kind: 'programa', name: c.label ?? 'Programa de fuerza', start: hourOf(c.time) === null ? null : Math.max(0, hourOf(c.time)! - c.durationMin / 60), minutes: c.durationMin, rpe: c.rpe, cost: costOfSrpe(c.rpe * c.durationMin), done: true, color: PROGRAM_COLOR });
  }
  for (const w of profile.workouts ?? []) {
    if (w.date !== dateIso) continue;
    done.push({ id: `libre:${w.id}`, kind: 'libre', name: w.name?.trim() || otherKindInfo(w.kind).label, start: hourOf(w.time), minutes: w.minutes, rpe: w.rpe, cost: costOfSrpe(w.rpe * w.minutes), done: true, color: WORKOUT_COLOR, workoutId: w.id });
  }

  // El total manda (es el mismo que usa la preparación de mañana): los redondeos de cada parte se ajustan a él.
  const total = spendOfEntry(loadHistoryFor(profile, history).find((h) => h.date === dateIso));
  if (done.length > 0) shareOut(total, done.map((i) => i.rpe * i.minutes)).forEach((cost, i) => (done[i].cost = cost));
  done.sort((a, b) => (a.start ?? 24) - (b.start ?? 24));

  const sessionDone = done.find((i) => i.kind === 'sesion');
  if (sessionDone && session) sessionDone.blocks = blockShares(session, sessionDone.cost, { date: dateIso, workLog: input.workLog, wodFeel: entry?.wodFeel });

  const pendingItems: EnergyItem[] = [];
  if (!entry && input.plannedSession && session && !session.isRestDay) {
    const cost = costOfSrpe(input.plannedSession.rpe * input.plannedSession.minutes);
    pendingItems.push({ id: 'sesion-prevista', kind: 'sesion', name: 'Sesión del día', start: null, minutes: input.plannedSession.minutes, rpe: input.plannedSession.rpe, cost, done: false, color: SESSION_COLOR, blocks: blockShares(session, cost, { date: dateIso }) });
  }
  if (input.plannedProgram && !done.some((i) => i.kind === 'programa')) {
    const { rpe, minutes } = input.plannedProgram;
    pendingItems.push({ id: 'programa-previsto', kind: 'programa', name: 'Programa de fuerza', start: null, minutes, rpe, cost: costOfSrpe(rpe * minutes), done: false, color: PROGRAM_COLOR });
  }

  const spent = done.reduce((s, i) => s + i.cost, 0);
  const pending = pendingItems.reduce((s, i) => s + i.cost, 0);
  const nightFeel = profile.nightLog?.find((n) => n.date === dateIso)?.feel;
  const computed = morning === null ? null : clampEnergy(morning - spent);
  const energy = computed === null ? null : nightAdjust(computed, nightFeel);
  return {
    morning,
    items: [...done, ...pendingItems],
    spent,
    computed,
    nightFeel,
    energy,
    pending,
    projected: energy === null ? null : clampEnergy(energy - pending),
    effort: strainFromSrpe(done.reduce((s, i) => s + i.rpe * i.minutes, 0)),
  };
}

/** Con cuánta energía se amanecería mañana si se acaba así y se duermen esas horas (sin el check-in, que luego lo ajusta). */
export function tomorrowEstimate(profile: AthleteProfile, history: SessionHistoryEntry[], dateIso: string, energy: number, hours: number): number {
  const load = loadHistoryFor(profile, history);
  const spend = (iso: string) => spendOfEntry(load.find((h) => h.date === iso));
  const carry = Math.round(CARRY_SHARE[0] * spend(dateIso) + CARRY_SHARE[1] * spend(shiftIso(dateIso, -1)));
  return clampEnergy(energy + sleepGain(energy, hours) - carry);
}
