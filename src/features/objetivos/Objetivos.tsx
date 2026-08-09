import { useState } from 'react';
import { Pencil, Trash2, Plus, CalendarRange } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import type { AthleteProfile, Goal, GoalEmphasis, GoalType, Macrocycle } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { GOAL_TYPE_META, GOAL_TYPES } from './goalMeta';

const EMPHASIS_HELP: Record<GoalEmphasis, string> = {
  moderado: 'Se adapta a las sesiones ya programadas: cuando un bloque coincide con tu objetivo, se prioriza tu movimiento.',
  intensivo: 'Las sesiones se reestructuran para exponer más tu objetivo en los bloques correspondientes.',
};

type MacroStatus = 'activo' | 'proximo' | 'finalizado';

const MACRO_STATUS_LABEL: Record<MacroStatus, string> = {
  activo: 'Activo ahora',
  proximo: 'Próximo',
  finalizado: 'Finalizado',
};

const MACRO_STATUS_CLASS: Record<MacroStatus, string> = {
  activo: 'bg-brand-neon/15 text-brand-neon',
  proximo: 'bg-sky-500/15 text-sky-400',
  finalizado: 'bg-white/5 text-neutral-500',
};

function todayIso(): string {
  return toLocalIsoDate(new Date());
}

function macroStatus(macro: Macrocycle, today: string): MacroStatus {
  if (today < macro.startDate) return 'proximo';
  if (today > macro.endDate) return 'finalizado';
  return 'activo';
}

function daysRemaining(targetDate: string): number {
  const diffMs = new Date(targetDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function newMacroDraft(): Macrocycle {
  const end = new Date();
  end.setMonth(end.getMonth() + 6);
  return { id: crypto.randomUUID(), label: '', startDate: todayIso(), endDate: toLocalIsoDate(end) };
}

function firstMovementId(type: GoalType): string | undefined {
  return GOAL_TYPE_META[type].movementGroups[0]?.movements[0]?.id;
}

function newGoalDraft(): Goal {
  return {
    id: crypto.randomUUID(),
    type: 'subir-pr',
    movementId: firstMovementId('subir-pr'),
    targetDate: todayIso(),
    emphasis: 'moderado',
    createdAt: todayIso(),
  };
}

const inputClass =
  'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

export function Objetivos() {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [macroDraft, setMacroDraft] = useState<Macrocycle | null>(null);
  const [goalDraft, setGoalDraft] = useState<Goal | null>(null);

  function persist(next: AthleteProfile) {
    athleteRepository.saveProfile(next);
    setProfile(next);
  }

  function saveMacro(e: React.FormEvent) {
    e.preventDefault();
    if (!macroDraft || !macroDraft.label.trim()) return;
    const exists = profile.macrocycles.some((m) => m.id === macroDraft.id);
    const macrocycles = exists
      ? profile.macrocycles.map((m) => (m.id === macroDraft.id ? macroDraft : m))
      : [...profile.macrocycles, macroDraft];
    persist({ ...profile, macrocycles });
    setMacroDraft(null);
  }

  function deleteMacro(id: string) {
    persist({ ...profile, macrocycles: profile.macrocycles.filter((m) => m.id !== id) });
  }

  function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalDraft) return;
    const exists = profile.goals.some((g) => g.id === goalDraft.id);
    const goals = exists ? profile.goals.map((g) => (g.id === goalDraft.id ? goalDraft : g)) : [...profile.goals, goalDraft];
    persist({ ...profile, goals });
    setGoalDraft(null);
  }

  function deleteGoal(id: string) {
    persist({ ...profile, goals: profile.goals.filter((g) => g.id !== id) });
  }

  const today = todayIso();
  const sortedMacros = [...profile.macrocycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const goalMeta = goalDraft ? GOAL_TYPE_META[goalDraft.type] : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Tu programación</p>
            <p className="text-lg font-semibold text-white">Macrociclos</p>
          </div>
          {!macroDraft && (
            <button
              onClick={() => setMacroDraft(newMacroDraft())}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nuevo
            </button>
          )}
        </div>

        {sortedMacros.length === 0 && !macroDraft && (
          <p className="card p-4 text-sm text-neutral-500">
            No tienes ningún macrociclo — mientras no haya uno activo entrenas en modo mantenimiento.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {sortedMacros.map((m) => {
            const status = macroStatus(m, today);
            return (
              <div key={m.id} className="card flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
                    <CalendarRange size={17} strokeWidth={2.25} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{m.label}</p>
                    <p className="text-xs text-neutral-500">
                      {m.startDate} → {m.endDate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${MACRO_STATUS_CLASS[status]}`}>
                    {MACRO_STATUS_LABEL[status]}
                  </span>
                  <button
                    onClick={() => setMacroDraft(m)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteMacro(m.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {macroDraft && (
          <form onSubmit={saveMacro} className="card flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Nombre
              <input
                type="text"
                value={macroDraft.label}
                onChange={(e) => setMacroDraft((prev) => (prev ? { ...prev, label: e.target.value } : prev))}
                placeholder="Ej. Prep competición otoño"
                className={inputClass}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
                Inicio
                <input
                  type="date"
                  value={macroDraft.startDate}
                  onChange={(e) => setMacroDraft((prev) => (prev ? { ...prev, startDate: e.target.value } : prev))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
                Fin
                <input
                  type="date"
                  value={macroDraft.endDate}
                  onChange={(e) => setMacroDraft((prev) => (prev ? { ...prev, endDate: e.target.value } : prev))}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs text-neutral-600">
              Fuera de las fechas de todos tus macrociclos entrenas en modo mantenimiento (sesiones ligeras).
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!macroDraft.label.trim()}
                className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar macrociclo
              </button>
              <button
                type="button"
                onClick={() => setMacroDraft(null)}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Énfasis concurrentes</p>
            <p className="text-lg font-semibold text-white">Objetivos</p>
          </div>
          {!goalDraft && (
            <button
              onClick={() => setGoalDraft(newGoalDraft())}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nuevo
            </button>
          )}
        </div>

        {profile.goals.length === 0 && !goalDraft && (
          <p className="card p-4 text-sm text-neutral-500">
            No tienes objetivos activos — puedes tener varios a la vez, el más urgente (fecha límite más cercana) gana prioridad cuando coinciden en un mismo bloque.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {profile.goals.map((g) => {
            const meta = GOAL_TYPE_META[g.type];
            const movement = g.movementId ? getMovementById(g.movementId) : undefined;
            const remaining = daysRemaining(g.targetDate);
            return (
              <div key={g.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold">
                      <meta.Icon size={20} strokeWidth={2.25} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{meta.label}</p>
                      {movement && <p className="text-xs text-neutral-400">{movement.name}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGoalDraft(g)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteGoal(g.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg bg-white/5 px-3 py-1 text-xs text-neutral-300">
                    {g.targetDate} ({remaining >= 0 ? `${remaining} días` : 'vencido'})
                  </span>
                  <span className="rounded-lg bg-brand-orange/15 px-3 py-1 text-xs font-medium capitalize text-brand-orange">{g.emphasis}</span>
                </div>
              </div>
            );
          })}
        </div>

        {goalDraft && goalMeta && (
          <form onSubmit={saveGoal} className="card flex flex-col gap-5 p-5">
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">Categoría</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {GOAL_TYPES.map((type) => {
                  const { label, Icon } = GOAL_TYPE_META[type];
                  const isSelected = goalDraft.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setGoalDraft((prev) =>
                          prev ? { ...prev, type, movementId: GOAL_TYPE_META[type].needsMovement ? firstMovementId(type) : undefined } : prev,
                        )
                      }
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

            {goalMeta.needsMovement && (
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Movimiento
                <select
                  value={goalDraft.movementId}
                  onChange={(e) => setGoalDraft((prev) => (prev ? { ...prev, movementId: e.target.value } : prev))}
                  className={inputClass}
                >
                  {goalMeta.movementGroups.map((group) => (
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
                value={goalDraft.targetDate}
                onChange={(e) => setGoalDraft((prev) => (prev ? { ...prev, targetDate: e.target.value } : prev))}
                className={`w-40 ${inputClass}`}
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">Énfasis</p>
              <div className="flex gap-2">
                {(['moderado', 'intensivo'] as GoalEmphasis[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGoalDraft((prev) => (prev ? { ...prev, emphasis: option } : prev))}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-200 ${
                      goalDraft.emphasis === option
                        ? 'bg-brand-orange text-black shadow-md shadow-brand-orange/20'
                        : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">{EMPHASIS_HELP[goalDraft.emphasis]}</p>
            </div>

            <p className="text-xs text-neutral-600">
              Si varios objetivos aplican al mismo bloque el mismo día, gana el que tenga la fecha límite más cercana.
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
              >
                Guardar objetivo
              </button>
              <button
                type="button"
                onClick={() => setGoalDraft(null)}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
