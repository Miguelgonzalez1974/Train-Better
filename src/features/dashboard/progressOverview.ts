import { CalendarRange, type LucideIcon } from 'lucide-react';
import type { AthleteProfile, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { getGoalProgress } from '../../engine/goalProgress';
import { daysBetween } from '../../engine/loadMetrics';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { currentWeekInRange, getActiveMacrocycle, resolveMacrocyclePhase, totalMacrocycleWeeks } from '../../engine/periodization';
import { getActiveStrengthProgram } from '../../engine/strengthPrograms';
import { GOAL_TYPE_META } from '../objetivos/goalMeta';
import { STRENGTH_METHOD_COLOR, STRENGTH_METHOD_META } from '../objetivos/strengthMethodMeta';

export interface ProgressRow {
  id: string;
  label: string;
  sublabel: string;
  pct: number;
  color: string;
  Icon: LucideIcon;
}

const MACRO_COLOR = '#d4af37';

/**
 * Como mucho una fila de "estructura activa" a la vez, nunca las dos: un programa de fuerza
 * activo sustituye entera la sesion del dia y pausa el macrociclo (ver generateSession.ts),
 * asi que enseñar ambas barras avanzando a la vez sugeriria que las dos gobiernan el
 * entrenamiento hoy cuando solo una de verdad lo hace.
 */
export function buildStructureRow(profile: AthleteProfile, todayIso: string): ProgressRow | null {
  const today = new Date(`${todayIso}T00:00:00`);

  const activeProgram = getActiveStrengthProgram(profile.strengthPrograms ?? [], todayIso);
  if (activeProgram) {
    const week = currentWeekInRange(activeProgram, today);
    const total = totalMacrocycleWeeks(activeProgram);
    const meta = STRENGTH_METHOD_META[activeProgram.method];
    return {
      id: activeProgram.id,
      label: meta.label,
      sublabel: `Semana ${week} de ${total}`,
      pct: Math.round((week / total) * 100),
      color: STRENGTH_METHOD_COLOR[activeProgram.method],
      Icon: meta.Icon,
    };
  }

  const activeMacro = getActiveMacrocycle(profile.macrocycles, todayIso);
  if (activeMacro) {
    const week = currentWeekInRange(activeMacro, today);
    const total = totalMacrocycleWeeks(activeMacro);
    const phase = resolveMacrocyclePhase(activeMacro, today);
    return {
      id: activeMacro.id,
      label: activeMacro.label,
      sublabel: `Semana ${week} de ${total} · ${MESOCYCLE_PHASE[phase.phaseIndex]}`,
      pct: Math.round((week / total) * 100),
      color: MACRO_COLOR,
      Icon: CalendarRange,
    };
  }

  return null;
}

export function buildGoalRows(goals: Goal[], history: SessionHistoryEntry[]): ProgressRow[] {
  const today = new Date();
  return goals.map((goal) => {
    const meta = GOAL_TYPE_META[goal.type];
    const movement = goal.movementId ? getMovementById(goal.movementId) : undefined;
    const remaining = -daysBetween(goal.targetDate, today);
    return {
      id: goal.id,
      label: movement ? `${meta.label} — ${movement.name}` : meta.label,
      sublabel: remaining >= 0 ? `Vence en ${remaining}d` : 'Objetivo vencido',
      pct: Math.round(getGoalProgress(goal, history, today) * 100),
      color: MACRO_COLOR,
      Icon: meta.Icon,
    };
  });
}
