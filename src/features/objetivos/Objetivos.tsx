import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import type { Goal, GoalEmphasis, GoalType } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { GOAL_TYPE_META, GOAL_TYPES } from './goalMeta';

const EMPHASIS_HELP: Record<GoalEmphasis, string> = {
  moderado: 'Se adapta a las sesiones ya programadas: cuando un bloque coincide con tu objetivo, se prioriza tu movimiento.',
  intensivo: 'Las sesiones se reestructuran para exponer más tu objetivo en los bloques correspondientes.',
};

function todayIso(): string {
  return toLocalIsoDate(new Date());
}

function firstMovementId(type: GoalType): string | undefined {
  return GOAL_TYPE_META[type].movementGroups[0]?.movements[0]?.id;
}

function emptyDraft(): Goal {
  return {
    type: 'subir-pr',
    movementId: firstMovementId('subir-pr'),
    targetDate: todayIso(),
    emphasis: 'moderado',
    createdAt: todayIso(),
  };
}

function daysRemaining(targetDate: string): number {
  const diffMs = new Date(targetDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function Objetivos() {
  const [goal, setGoal] = useState<Goal | null>(() => athleteRepository.getGoal());
  const [editing, setEditing] = useState(!goal);
  const [draft, setDraft] = useState<Goal>(() => goal ?? emptyDraft());

  const meta = GOAL_TYPE_META[draft.type];

  function handleTypeChange(type: GoalType) {
    setDraft((prev) => ({ ...prev, type, movementId: GOAL_TYPE_META[type].needsMovement ? firstMovementId(type) : undefined }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const toSave: Goal = { ...draft, createdAt: goal?.createdAt ?? todayIso() };
    athleteRepository.saveGoal(toSave);
    setGoal(toSave);
    setEditing(false);
  }

  function handleDelete() {
    athleteRepository.clearGoal();
    setGoal(null);
    setDraft(emptyDraft());
    setEditing(true);
  }

  if (!editing && goal) {
    const goalMeta = GOAL_TYPE_META[goal.type];
    const movement = goal.movementId ? getMovementById(goal.movementId) : undefined;
    const remaining = daysRemaining(goal.targetDate);

    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-neutral-400">Tu objetivo</p>
          <p className="text-lg font-semibold text-white">Activo</p>
        </div>

        <section className="card p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold">
                <goalMeta.Icon size={22} strokeWidth={2.25} />
              </span>
              <div>
                <p className="text-lg font-semibold text-white">{goalMeta.label}</p>
                {movement && <p className="text-sm text-neutral-400">{movement.name}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={handleDelete}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg bg-white/5 px-3 py-1 text-sm text-neutral-300">
              {goal.targetDate} ({remaining >= 0 ? `${remaining} días` : 'vencido'})
            </span>
            <span className="rounded-lg bg-brand-orange/15 px-3 py-1 text-sm font-medium capitalize text-brand-orange">
              {goal.emphasis}
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-500">{EMPHASIS_HELP[goal.emphasis]}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-neutral-400">Tu objetivo</p>
        <p className="text-lg font-semibold text-white">{goal ? 'Editar objetivo' : 'Define tu objetivo'}</p>
      </div>

      <form onSubmit={handleSave} className="card flex flex-col gap-5 p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Categoría</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GOAL_TYPES.map((type) => {
              const { label, Icon } = GOAL_TYPE_META[type];
              const isSelected = draft.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-all duration-200 ${
                    isSelected
                      ? 'border-brand-gold bg-brand-gold/10 text-brand-gold shadow-md shadow-brand-gold/10'
                      : 'border-brand-border text-neutral-400 hover:scale-[1.02] hover:bg-white/5'
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {meta.needsMovement && (
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Movimiento
            <select
              value={draft.movementId}
              onChange={(e) => setDraft((prev) => ({ ...prev, movementId: e.target.value }))}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none"
            >
              {meta.movementGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.movements.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Fecha objetivo
          <input
            type="date"
            min={todayIso()}
            value={draft.targetDate}
            onChange={(e) => setDraft((prev) => ({ ...prev, targetDate: e.target.value }))}
            className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Énfasis</p>
          <div className="flex gap-2">
            {(['moderado', 'intensivo'] as GoalEmphasis[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, emphasis: option }))}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-200 ${
                  draft.emphasis === option ? 'bg-brand-orange text-black shadow-md shadow-brand-orange/20' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{EMPHASIS_HELP[draft.emphasis]}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
          >
            Guardar objetivo
          </button>
          {goal && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
