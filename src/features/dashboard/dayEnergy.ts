import type { AthleteProfile, DailySession, DayWorkout, NightFeel, SessionHistoryEntry, WorkoutKind, WorkSetEntry } from '../../data/athlete/types';
import { MOBILITY_ZONE_LABEL } from '../../data/mobility';
import { clampEnergy, costOfSrpe, daySpend, nightAdjust, shiftIso, sleepGain, CARRY_SHARE } from '../../engine/energy';
import { dayBonuses, NO_BONUS } from '../../engine/energyBonus';
import { isRestMarked } from '../../engine/restDays';
import { loadHistoryFor } from '../../engine/readinessAt';
import { strainFromSrpe } from '../../engine/strain';
import { otherKindInfo } from '../planificacion/otherActivity';
import { sessionLabel } from './sessionLabel';

/**
 * El día contado en energía: cada cosa entrenada (la sesión, el programa de fuerza y los entrenos añadidos), lo que ha restado, lo que queda por
 * hacer y con cuánta energía se acaba. La mañana es la preparación (ver `engine/energy.ts`). Puro: lo pintan el aro y las filas del Dashboard.
 */

/** Qué fue cada cosa del día: decide su icono. */
export type ActivityKind = WorkoutKind | 'sesion' | 'programa' | 'descanso' | 'movilidad';

export interface EnergyItem {
  id: string;
  kind: 'sesion' | 'programa' | 'libre' | 'descanso' | 'movilidad';
  activity: ActivityKind;
  /** El tipo de entreno tal como se lee en su fila: «CrossFit», «Running»… */
  name: string;
  /** De qué iba, en pequeño debajo del nombre («DL + WOD», «Recovery»); sin ello la fila va en una línea. */
  detail?: string;
  /** Hora de inicio en horas («13,5»), solo para ordenar; null si no se sabe. */
  start: number | null;
  minutes: number;
  rpe: number;
  cost: number;
  /** Lo que ha sumado (descanso, movilidad o recuperación suave); sin él, es algo que gasta. */
  gain?: number;
  done: boolean;
  /** El id en `profile.workouts` (solo los entrenos libres, que se pueden corregir). */
  workoutId?: string;
  /** El id en `profile.mobilityLog` (las filas de movilidad, que se pueden corregir). */
  mobilityId?: string;
}

/** ¿Es un entreno? El descanso y la movilidad no cuentan como haber entrenado. */
export const isTraining = (item: Pick<EnergyItem, 'kind'>): boolean => item.kind !== 'descanso' && item.kind !== 'movilidad';

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
  /** Lo sumado ese día (descanso, movilidad, recuperación suave). */
  gained: number;
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
  /** Las series anotadas: de ellas sale la línea pequeña de la sesión. */
  workLog?: WorkSetEntry[];
}

export function buildDayEnergy(input: DayEnergyInput): DayEnergy {
  const { profile, history, dateIso, morning, session } = input;
  const done: EnergyItem[] = [];

  const entry = history.find((h) => h.date === dateIso);
  if (entry) {
    const end = hourOf(entry.closedAt);
    // Una clase apuntada con «Hice otra cosa» también es CrossFit: se lee igual que los demás días, con «Clase» debajo.
    const asClass = session?.source === 'custom' && session.customTitle === otherKindInfo('clase').title;
    const detail = asClass ? 'Clase' : sessionLabel({ entry, session, workLog: input.workLog ?? [] });
    done.push({
      id: 'sesion',
      kind: 'sesion',
      activity: 'sesion',
      name: session?.source === 'custom' && !asClass ? session.customTitle || 'Sesión propia' : 'CrossFit',
      ...(detail ? { detail } : {}),
      start: end === null ? null : Math.max(0, end - entry.durationMin / 60),
      minutes: entry.durationMin,
      rpe: entry.rpe,
      cost: costOfSrpe(entry.rpe * entry.durationMin),
      done: true,
    });
  }
  for (const c of profile.companionLog ?? []) {
    if (c.date !== dateIso || c.outcome !== 'hecha' || !c.rpe || !c.durationMin) continue;
    done.push({ id: `programa:${c.id}`, kind: 'programa', activity: 'programa', name: 'Programa de fuerza', ...(c.label ? { detail: c.label } : {}), start: hourOf(c.time) === null ? null : Math.max(0, hourOf(c.time)! - c.durationMin / 60), minutes: c.durationMin, rpe: c.rpe, cost: costOfSrpe(c.rpe * c.durationMin), done: true });
  }
  for (const w of profile.workouts ?? []) {
    if (w.date !== dateIso) continue;
    done.push({ id: `libre:${w.id}`, kind: 'libre', activity: w.kind, name: workoutName(w), start: hourOf(w.time), minutes: w.minutes, rpe: w.rpe, cost: costOfSrpe(w.rpe * w.minutes), done: true, workoutId: w.id });
  }

  // El total manda (es el mismo que usa la preparación de mañana): los redondeos de cada parte se ajustan a él.
  const bonus = dayBonuses(profile, history).get(dateIso) ?? NO_BONUS;
  const total = daySpend(loadHistoryFor(profile, history).find((h) => h.date === dateIso), bonus);
  // Una recuperación suave no gasta: suma.
  const recovered = bonus.recovery > 0 ? done.find((i) => i.kind === 'sesion') : undefined;
  if (recovered) Object.assign(recovered, { cost: 0, gain: bonus.recovery });
  const spending = done.filter((i) => i !== recovered);
  if (spending.length > 0) shareOut(total, spending.map((i) => i.rpe * i.minutes)).forEach((cost, i) => (spending[i].cost = cost));
  done.sort((a, b) => (a.start ?? 24) - (b.start ?? 24));

  const extras: EnergyItem[] = [];
  if (bonus.rest > 0) extras.push({ id: 'descanso', kind: 'descanso', activity: 'descanso', name: 'Descanso', start: null, minutes: 0, rpe: 0, cost: 0, gain: bonus.rest, done: true });
  const mobility = (profile.mobilityLog ?? []).filter((m) => m.date === dateIso);
  const mobilityGains = shareOut(bonus.mobility, mobility.map((m) => m.minutes));
  const mobilityItems: EnergyItem[] = mobility.map((m, i) => ({
    id: `mov:${m.id}`,
    kind: 'movilidad',
    activity: 'movilidad',
    name: 'Movilidad',
    detail: [`${m.minutes} min`, m.zones.slice(0, 3).map((z, k) => (k === 0 ? MOBILITY_ZONE_LABEL[z] : MOBILITY_ZONE_LABEL[z].toLowerCase())).join(', ') || null].filter(Boolean).join(' · '),
    start: null,
    minutes: m.minutes,
    rpe: 0,
    cost: 0,
    gain: mobilityGains[i],
    done: true,
    mobilityId: m.id,
  }));

  // Con el día marcado como descanso (y sin haber entrenado) no queda nada previsto.
  const resting = done.length === 0 && isRestMarked(profile.restDates, dateIso);
  const pendingItems: EnergyItem[] = [];
  if (!resting && !entry && input.plannedSession && session && !session.isRestDay) {
    const cost = costOfSrpe(input.plannedSession.rpe * input.plannedSession.minutes);
    pendingItems.push({ id: 'sesion-prevista', kind: 'sesion', activity: 'sesion', name: 'Sesión del día', start: null, minutes: input.plannedSession.minutes, rpe: input.plannedSession.rpe, cost, done: false });
  }
  if (!resting && input.plannedProgram && !done.some((i) => i.kind === 'programa')) {
    const { rpe, minutes } = input.plannedProgram;
    pendingItems.push({ id: 'programa-previsto', kind: 'programa', activity: 'programa', name: 'Programa de fuerza', start: null, minutes, rpe, cost: costOfSrpe(rpe * minutes), done: false });
  }

  const spent = done.reduce((s, i) => s + i.cost, 0);
  const pending = pendingItems.reduce((s, i) => s + i.cost, 0);
  const nightFeel = profile.nightLog?.find((n) => n.date === dateIso)?.feel;
  const computed = morning === null ? null : clampEnergy(morning - spent + bonus.total);
  const energy = computed === null ? null : nightAdjust(computed, nightFeel);
  return {
    morning,
    // El descanso encabeza el día; después, lo entrenado en su orden, la movilidad y lo que falta.
    items: [...extras, ...done, ...mobilityItems, ...pendingItems],
    spent,
    gained: bonus.total,
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
  const bonuses = dayBonuses(profile, history);
  const spend = (iso: string) => daySpend(load.find((h) => h.date === iso), bonuses.get(iso));
  const carry = Math.round(CARRY_SHARE[0] * spend(dateIso) + CARRY_SHARE[1] * spend(shiftIso(dateIso, -1)));
  return clampEnergy(energy + sleepGain(energy, hours) - carry);
}
