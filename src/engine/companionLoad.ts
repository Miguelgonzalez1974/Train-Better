import type { AthleteProfile, CompanionLogEntry, SessionHistoryEntry } from '../data/athlete/types';
import { strainFromSrpe } from './strain';
import { companionStatus, isCompanionProgram, type CompanionProgram } from './strengthCompanion';

/**
 * La carga del programa de fuerza que convive con el macro (el Texas) cuenta como carga de verdad. Sus sesiones se guardan aparte del historial del
 * macro (`companionLog`), así que el coach no las veía: ni el esfuerzo del día, ni la carga acumulada (ACWR), ni el semáforo, ni cómo te salió «ayer».
 * Aquí se suman, sin tocar lo guardado: `withCompanionLoad` devuelve un historial DERIVADO en el que cada día entrenado suma los minutos y el esfuerzo
 * (sRPE) de su sesión del programa. Puro.
 */

/** sRPE de una sesión del programa hecha, o null si no se apuntó con RPE y duración. */
function loadOf(c: CompanionLogEntry): { minutes: number; srpe: number } | null {
  if (c.outcome !== 'hecha' || !c.rpe || !c.durationMin || c.durationMin <= 0) return null;
  return { minutes: c.durationMin, srpe: c.rpe * c.durationMin };
}

/**
 * El historial con la carga del programa sumada. Un día con sesión del macro suma los minutos y pondera el RPE (la suma de sRPE se conserva). Con
 * `orphans`, un día en el que solo se hizo el programa añade una entrada propia (sin movimientos, así no cuenta como patrón reciente): solo para el
 * motor, nunca para pantallas que cuentan días o sesiones, porque «hoy ya has entrenado» sería falso. Idempotente: una entrada ya fusionada
 * (`companionLoadMin`) no se vuelve a tocar. Ordenado por fecha.
 */
export function withCompanionLoad(history: SessionHistoryEntry[], log: CompanionLogEntry[] | undefined, opts: { orphans?: boolean } = {}): SessionHistoryEntry[] {
  const byDate = new Map<string, { minutes: number; srpe: number }>();
  for (const c of log ?? []) {
    const l = loadOf(c);
    if (!l) continue;
    const prev = byDate.get(c.date) ?? { minutes: 0, srpe: 0 };
    byDate.set(c.date, { minutes: prev.minutes + l.minutes, srpe: prev.srpe + l.srpe });
  }
  if (byDate.size === 0) return history;

  const used = new Set<string>();
  const merged = history.map((h) => {
    const add = byDate.get(h.date);
    if (!add || used.has(h.date) || h.companionLoadMin !== undefined) {
      if (add) used.add(h.date);
      return h;
    }
    used.add(h.date);
    const minutes = h.durationMin + add.minutes;
    const rpe = Math.round(((h.rpe * h.durationMin + add.srpe) / minutes) * 10) / 10;
    return { ...h, durationMin: minutes, rpe, companionLoadMin: add.minutes };
  });
  if (opts.orphans) {
    for (const [date, add] of byDate) {
      if (used.has(date)) continue;
      merged.push({ date, mesocycleWeek: 0, movementIds: [], rxOrScaled: 'rx', rpe: Math.round((add.srpe / add.minutes) * 10) / 10, durationMin: add.minutes, companionLoadMin: add.minutes });
    }
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

/** Lo mínimo que hace falta saber de la sesión del programa para estimar su esfuerzo (lo cumple `CompanionSessionPlan`). */
export interface CompanionPlanLike {
  role: string;
  intensity: boolean;
  lifts: { sets: number; attempt: boolean }[];
}

/** RPE y minutos que se esperan de una sesión del programa antes de hacerla (el día de la marca pesa más que el de recuperación). */
export function expectedCompanionLoad(plan: CompanionPlanLike): { minutes: number; rpe: number } {
  // Calentamiento y descansos: unos 3 min por serie de trabajo; la marca de 5 lleva su rampa (≈ 6 series de aproximación y de intento).
  const sets = plan.lifts.reduce((s, l) => s + (l.attempt ? 6 : l.sets), 0);
  const minutes = 10 + sets * 3;
  const rpe = plan.intensity ? 8.5 : /recuper/i.test(plan.role) ? 5.5 : 7;
  return { minutes, rpe };
}

/**
 * Lo que añade al día de hoy la sesión del programa que has aceptado hacer («hacerla hoy»): null si no hay programa que convive, no la has aceptado o no
 * se puede generar. Se suma al esfuerzo PREVISTO de hoy para que el anillo y el aviso de «se pasa» cuenten con ella. `makePlan` genera la sesión del
 * programa (viene de `generateCompanionSession`; se pasa de fuera para no enredar los módulos).
 */
export function acceptedCompanionLoad(profile: AthleteProfile, todayIso: string, makePlan: (program: CompanionProgram) => CompanionPlanLike | null): { minutes: number; rpe: number } | null {
  const program = (profile.strengthPrograms ?? []).filter(isCompanionProgram).find((p) => todayIso >= p.startDate && todayIso <= p.endDate);
  if (!program || companionStatus(program, todayIso).kind !== 'aceptada') return null;
  const plan = makePlan(program);
  return plan ? expectedCompanionLoad(plan) : null;
}

/** El esfuerzo previsto de hoy con la sesión del programa sumada (sRPE total → misma curva que el real). */
export function combinedPlannedStrain(macro: { rpe: number; minutes: number }, extra: { rpe: number; minutes: number }): { strain: number; rpe: number; minutes: number } {
  const minutes = macro.minutes + extra.minutes;
  const srpe = macro.rpe * macro.minutes + extra.rpe * extra.minutes;
  return { strain: strainFromSrpe(srpe), rpe: Math.round((srpe / minutes) * 10) / 10, minutes };
}