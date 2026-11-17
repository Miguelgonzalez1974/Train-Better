import type { LucideIcon } from 'lucide-react';
import type { Goal, PersonalRecords, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { getGoalProgress, targetKgProgress } from '../../engine/goalProgress';
import { daysBetween } from '../../engine/loadMetrics';
import { GOAL_TYPE_COLOR, GOAL_TYPE_META } from '../objetivos/goalMeta';

export interface ProgressRow {
  id: string;
  label: string;
  sublabel: string;
  pct: number;
  color: string;
  Icon: LucideIcon;
}

export function buildGoalRows(goals: Goal[], history: SessionHistoryEntry[], prs?: Partial<PersonalRecords>): ProgressRow[] {
  const today = new Date();
  return goals.map((goal) => {
    const meta = GOAL_TYPE_META[goal.type];
    const movement = goal.movementId ? getMovementById(goal.movementId) : undefined;
    const remaining = -daysBetween(goal.targetDate, today);
    return {
      id: goal.id,
      label: movement ? `${meta.label} — ${movement.name}` : meta.label,
      sublabel: remaining >= 0 ? `Vence en ${remaining}d` : 'Objetivo vencido',
      pct: Math.round((targetKgProgress(goal, prs) ?? getGoalProgress(goal, history, today, prs)) * 100),
      color: GOAL_TYPE_COLOR[goal.type],
      Icon: meta.Icon,
    };
  });
}
