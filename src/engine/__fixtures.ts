/**
 * Fixtures compartidos por la suite de tests del motor. No es un `.test.ts` a proposito: solo
 * construye perfiles/macros validos y utilidades para recorrer semanas de sesiones generadas.
 */
import type { AthleteProfile, Goal, Macrocycle, PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { generateSessionForDate } from './generateSession';
import { toLocalIsoDate } from './periodization';
import type { DailySession } from '../data/athlete/types';

export const BASE_PRS: PersonalRecords = {
  backSquat: 170,
  frontSquat: 140,
  benchPress: 110,
  deadlift: 200,
  strictPress: 65,
  clean: 115,
  snatch: 90,
  cleanAndJerk: 118,
};

export function makeMacro(overrides: Partial<Macrocycle> = {}): Macrocycle {
  return {
    id: 'macro-test',
    label: 'Bloque de prueba',
    startDate: '2026-01-05', // lunes
    endDate: '2026-06-01',
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    prs: { ...BASE_PRS },
    trainingDaysPerWeek: 5,
    onboardedAt: '2025-11-01T00:00:00.000Z',
    macrocycles: [makeMacro()],
    goals: [],
    strengthPrograms: [],
    painFlags: [],
    ...overrides,
  };
}

export function makeStrengthGoal(movementId: string, emphasis: Goal['emphasis'] = 'intensivo'): Goal {
  return {
    id: `goal-${movementId}`,
    type: 'subir-pr',
    movementId,
    targetDate: '2026-05-01',
    emphasis,
    createdAt: '2026-01-01',
  };
}

/** `count` fechas consecutivas (1/dia) a partir de `startIso` a mediodia local. */
export function consecutiveDates(startIso: string, count: number): Date[] {
  const out: Date[] = [];
  const start = new Date(`${startIso}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

/** Todas las sesiones NO-descanso de un rango de fechas para un perfil (historial vacio). */
export function sessionsOver(profile: AthleteProfile, dates: Date[]): DailySession[] {
  return dates.map((d) => generateSessionForDate(profile, [], d, profile.goals)).filter((s) => !s.isRestDay && s.blocks.length > 0);
}

/**
 * Recorre las fechas generando la sesion de cada dia y ACUMULANDO su resultado en el historial
 * antes del siguiente — como en la app real. Necesario para probar lo que depende del historial
 * (no repetir patron, huecos semanales, sesgo por punto debil). Devuelve las sesiones no-descanso.
 */
export function simulateSessions(profile: AthleteProfile, dates: Date[]): DailySession[] {
  const history: SessionHistoryEntry[] = [];
  const out: DailySession[] = [];
  for (const d of dates) {
    const s = generateSessionForDate(profile, history, d, profile.goals);
    if (!s.isRestDay && s.blocks.length > 0) {
      out.push(s);
      const wodIds = s.blocks.filter((b) => b.block === 'wod').map((b) => b.movementId);
      history.push({
        date: toLocalIsoDate(d),
        mesocycleWeek: s.mesocycleWeek,
        movementIds: [...new Set(s.blocks.map((b) => b.movementId))],
        wodMovementIds: [...new Set(wodIds)],
        rxOrScaled: 'rx',
        rpe: 7,
        durationMin: 60,
      });
    }
  }
  return out;
}

/** Ids de movimiento de una sesion, sin el prefijo `benchmark:` (esos se validan aparte). */
export function realMovementIds(session: DailySession): string[] {
  return session.blocks.map((b) => b.movementId).filter((id) => !id.startsWith('benchmark:'));
}

/** true si todo `loadKg` presente en la sesion es un numero finito >= 0. */
export function loadsAreFinite(session: DailySession): boolean {
  return session.blocks.every((b) => b.loadKg == null || (Number.isFinite(b.loadKg) && b.loadKg >= 0));
}

/** true si todos los ids de movimiento (no benchmark) existen en el catalogo. */
export function allIdsResolve(session: DailySession): { ok: boolean; missing: string[] } {
  const missing = realMovementIds(session).filter((id) => !getMovementById(id));
  return { ok: missing.length === 0, missing };
}
