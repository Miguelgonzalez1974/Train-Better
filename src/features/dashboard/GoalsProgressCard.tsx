import { Target } from 'lucide-react';
import type { Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { getGoalProgress } from '../../engine/goalProgress';
import { daysBetween } from '../../engine/loadMetrics';
import { GOAL_TYPE_META } from '../objetivos/goalMeta';

/** El progreso (getGoalProgress, 0-1) ya alimenta el sesgo del motor desde hace tiempo, pero nunca se le mostraba al atleta — solo veia el chip con el enfasis, sin saber si de verdad iba bien encaminado. */
export function GoalsProgressCard({ goals, history }: { goals: Goal[]; history: SessionHistoryEntry[] }) {
  if (goals.length === 0) return null;
  const today = new Date();

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
          <Target size={14} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Tus objetivos</p>
      </div>
      <div className="flex flex-col gap-3">
        {goals.map((goal) => {
          const meta = GOAL_TYPE_META[goal.type];
          const movement = goal.movementId ? getMovementById(goal.movementId) : undefined;
          const pct = Math.round(getGoalProgress(goal, history, today) * 100);
          const remaining = -daysBetween(goal.targetDate, today);
          return (
            <div key={goal.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-neutral-300">
                  <meta.Icon size={13} strokeWidth={2.25} className="shrink-0 text-brand-gold" />
                  <span className="truncate">
                    {meta.label}
                    {movement && ` — ${movement.name}`}
                  </span>
                </span>
                <span className="shrink-0 text-neutral-500">{remaining >= 0 ? `${remaining}d` : 'vencido'}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-brand-gold transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
