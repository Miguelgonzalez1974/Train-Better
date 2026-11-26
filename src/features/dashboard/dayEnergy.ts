import type { AthleteProfile, DailySession, DayWorkout, NightFeel, SessionHistoryEntry, WorkoutKind } from '../../data/athlete/types';
import { clampEnergy, costOfSrpe, nightAdjust, shiftIso, sleepGain, CARRY_SHARE, spendOfEntry } from '../../engine/energy';
import { loadHistoryFor } from '../../engine/readinessAt';
import { strainFromSrpe } from '../../engine/strain';
import { otherKindInfo } from '../planificacion/otherActivity';

/**
 * El día contado en energía: cada cosa entrenada (la sesión, el programa de fuerza y los entrenos añadidos), lo que ha restado, lo que queda por
 * hacer y con cuánta energía se acaba. La mañana es la preparación (ver `engine/energy.ts`). Puro: lo pintan el aro y las filas del Dashboard.
 */

/** Qué fue cada cosa entrenada: decide su icono. */
export type ActivityKind = WorkoutKind | 'sesion' | 'programa';

export interface EnergyItem {
  id: string;
  kind: 'sesion' | 'programa' | 'libre';
  activity: ActivityKind;
  /** El tipo de entreno tal como se lee en su fila: «CrossFit», «Running»… */
  name: string;
  /** Hora de inicio en horas («13,5»), solo para ordenar; null si no se sabe. */
  start: number | null;
  minutes: number;
  rpe: number;
  cost: number;
  done: boolean;
  /** El id en `profile.workouts` (solo los entrenos libres, que se pueden corregir). */
  workoutId?: string;
}

/** Cómo se llama un entreno añadido en su fila: el tipo, o el nombre que le pusiste. */
export function workoutName(w: Pick<DayWorkout, 'kind' | 'name'>): string {
  return w.name?.trim() || (w.kind === 'clase' ? 'CrossFit' : otherKindInfo(w.kind).label);
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
      activity: 'sesion',
      name: session?.source === 'custom' ? session.customTitle || 'Sesión propia' : 'CrossFit',
      start: end === null ? null : Math.max(0, end - entry.durationMin / 60),
      minutes: entry.durationMin,
      rpe: entry.rpe,
      cost: costOfSrpe(entry.rpe * entry.durationMin),
      done: true,
    });
  }
  for (const c of profile.companionLog ?? []) {
    if (c.date !== dateIso || c.outcome !== 'hecha' || !c.rpe || !c.durationMin) continue;
    done.push({ id: `programa:${c.id}`, kind: 'programa', activity: 'programa', name: c.label ?? 'Programa de fuerza', start: hourOf(c.time) === null ? null : Math.max(0, hourOf(c.time)! - c.durationMin / 60), minutes: c.durationMin, rpe: c.rpe, cost: costOfSrpe(c.rpe * c.durationMin), done: true });
  }
  for (const w of profile.workouts ?? []) {
    if (w.date !== dateIso) continue;
    done.push({ id: `libre:${w.id}`, kind: 'libre', activity: w.kind, name: workoutName(w), start: hourOf(w.time), minutes: w.minutes, rpe: w.rpe, cost: costOfSrpe(w.rpe * w.minutes), done: true, workoutId: w.id });
  }

  // El total manda (es el mismo que usa la preparación de mañana): los redondeos de cada parte se ajustan a él.
  const total = spendOfEntry(loadHistoryFor(profile, history).find((h) => h.date === dateIso));
  if (done.length > 0) shareOut(total, done.map((i) => i.rpe * i.minutes)).forEach((cost, i) => (done[i].cost = cost));
  done.sort((a, b) => (a.start ?? 24) - (b.start ?? 24));

  const pendingItems: EnergyItem[] = [];
  if (!entry && input.plannedSession && session && !session.isRestDay) {
    const cost = costOfSrpe(input.plannedSession.rpe * input.plannedSession.minutes);
    pendingItems.push({ id: 'sesion-prevista', kind: 'sesion', activity: 'sesion', name: 'Sesión del día', start: null, minutes: input.plannedSession.minutes, rpe: input.plannedSession.rpe, cost, done: false });
  }
  if (input.plannedProgram && !done.some((i) => i.kind === 'programa')) {
    const { rpe, minutes } = input.plannedProgram;
    pendingItems.push({ id: 'programa-previsto', kind: 'programa', activity: 'programa', name: 'Programa de fuerza', start: null, minutes, rpe, cost: costOfSrpe(rpe * minutes), done: false });
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
