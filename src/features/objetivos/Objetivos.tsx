import { useState } from 'react';
import { Pencil, Trash2, Plus, CalendarRange, Repeat, Repeat2, TrendingUp, Waves, Split, ListOrdered, type LucideIcon } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import type { AthleteProfile, Goal, GoalEmphasis, GoalType, Macrocycle, PersonalRecords, StrengthMethod, StrengthProgram } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { DEFAULT_STRENGTH_PROGRAM_LIFTS } from '../../engine/strengthPrograms';
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

const PHASE_LABELS = ['Acumulación', 'Intensificación', 'Pico'] as const;

function totalMacroWeeks(macro: Macrocycle): number {
  const start = new Date(macro.startDate);
  const end = new Date(macro.endDate);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
}

/** Semanas de descarga restantes tras restar acumulacion/intensificacion/pico del total del macro. */
function remainingDeloadWeeks(macro: Macrocycle): number {
  if (!macro.phaseWeeks) return 0;
  const [acc, int, peak] = macro.phaseWeeks;
  return totalMacroWeeks(macro) - acc - int - peak;
}

type ProgramStatus = MacroStatus;
const PROGRAM_STATUS_LABEL = MACRO_STATUS_LABEL;
const PROGRAM_STATUS_CLASS = MACRO_STATUS_CLASS;

function programStatus(program: StrengthProgram, today: string): ProgramStatus {
  if (today < program.startDate) return 'proximo';
  if (today > program.endDate) return 'finalizado';
  return 'activo';
}

const STRENGTH_METHOD_META: Record<StrengthMethod, { label: string; blurb: string; Icon: LucideIcon }> = {
  '531': {
    label: '5/3/1',
    blurb: 'Ondas de 4 semanas sobre tu training max — progresión lenta y sostenible.',
    Icon: Repeat,
  },
  lineal: {
    label: 'Lineal',
    blurb: 'Sube intensidad y baja volumen semana a semana — ideal si vuelves de un parón.',
    Icon: TrendingUp,
  },
  ondulante: {
    label: 'Ondulante',
    blurb: 'El mismo levantamiento varias veces por semana, cambiando el estímulo cada vez.',
    Icon: Waves,
  },
  conjugado: {
    label: 'Conjugado',
    blurb: 'Esfuerzo máximo con variante rotativa + esfuerzo dinámico a velocidad, alternando tren superior e inferior.',
    Icon: Split,
  },
  ruso: {
    label: 'Ruso / Sheiko',
    blurb: 'Frecuencia alta, volumen alto, intensidad moderada — nunca al fallo, prioriza la técnica repetida.',
    Icon: Repeat2,
  },
  texas: {
    label: 'Texas Method',
    blurb: 'Un día de volumen, uno de recuperación y uno de intensidad — busca un número nuevo cada semana.',
    Icon: ListOrdered,
  },
};

const STRENGTH_METHODS: StrengthMethod[] = ['531', 'lineal', 'ondulante', 'conjugado', 'ruso', 'texas'];

const LIFT_OPTIONS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'clean', label: 'Clean' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'cleanAndJerk', label: 'Clean & Jerk' },
];

function newStrengthProgramDraft(): StrengthProgram {
  const end = new Date();
  end.setMonth(end.getMonth() + 2);
  return { id: crypto.randomUUID(), startDate: todayIso(), endDate: toLocalIsoDate(end), method: '531', lifts: [...DEFAULT_STRENGTH_PROGRAM_LIFTS] };
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
  const [programDraft, setProgramDraft] = useState<StrengthProgram | null>(null);

  function persist(next: AthleteProfile) {
    athleteRepository.saveProfile(next);
    setProfile(next);
  }

  function saveStrengthProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!programDraft || programDraft.lifts.length === 0) return;
    const existing = profile.strengthPrograms ?? [];
    const exists = existing.some((p) => p.id === programDraft.id);
    const strengthPrograms = exists ? existing.map((p) => (p.id === programDraft.id ? programDraft : p)) : [...existing, programDraft];
    persist({ ...profile, strengthPrograms });
    setProgramDraft(null);
  }

  function deleteStrengthProgram(id: string) {
    persist({ ...profile, strengthPrograms: (profile.strengthPrograms ?? []).filter((p) => p.id !== id) });
  }

  function toggleProgramLift(key: keyof PersonalRecords) {
    setProgramDraft((prev) => {
      if (!prev) return prev;
      const has = prev.lifts.includes(key);
      const lifts = has ? prev.lifts.filter((l) => l !== key) : [...prev.lifts, key];
      return { ...prev, lifts };
    });
  }

  function saveMacro(e: React.FormEvent) {
    e.preventDefault();
    if (!macroDraft || !macroDraft.label.trim()) return;
    // La duracion de descarga siempre se deriva del resto del macro en el momento de guardar,
    // nunca se guarda un numero obsoleto si el atleta cambio las fechas despues de fijar las fases.
    const finalDraft: Macrocycle = macroDraft.phaseWeeks
      ? { ...macroDraft, phaseWeeks: [...macroDraft.phaseWeeks.slice(0, 3), Math.max(1, remainingDeloadWeeks(macroDraft))] as [number, number, number, number] }
      : macroDraft;
    const exists = profile.macrocycles.some((m) => m.id === finalDraft.id);
    const macrocycles = exists
      ? profile.macrocycles.map((m) => (m.id === finalDraft.id ? finalDraft : m))
      : [...profile.macrocycles, finalDraft];
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
  const sortedPrograms = [...(profile.strengthPrograms ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
                    {m.phaseWeeks && (
                      <p className="mt-0.5 text-[11px] text-neutral-600">
                        {m.phaseWeeks[0]}s acum. · {m.phaseWeeks[1]}s intens. · {m.phaseWeeks[2]}s pico · {m.phaseWeeks[3]}s descarga
                      </p>
                    )}
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

            <div className="flex flex-col gap-2.5 rounded-lg border border-brand-border/60 p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                <input
                  type="checkbox"
                  checked={Boolean(macroDraft.phaseWeeks)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const total = totalMacroWeeks(macroDraft);
                      const chunk = Math.max(1, Math.floor(total / 4));
                      setMacroDraft((prev) => (prev ? { ...prev, phaseWeeks: [chunk, chunk, chunk, Math.max(1, total - chunk * 3)] } : prev));
                    } else {
                      setMacroDraft((prev) => (prev ? { ...prev, phaseWeeks: undefined } : prev));
                    }
                  }}
                />
                Personalizar duración de fases
              </label>
              <p className="text-xs text-neutral-600">
                Por defecto se repiten bloques de 4 semanas (Acumulación → Intensificación → Pico → Descarga) sin
                parar mientras dure el macrociclo. Actívalo para dar a cada fase su propia duración — el resto del
                macro, lo que sobre, siempre se reparte a descarga.
              </p>

              {macroDraft.phaseWeeks && (
                <div className="flex flex-wrap items-end gap-3">
                  {PHASE_LABELS.map((label, i) => (
                    <label key={label} className="flex w-24 flex-col gap-1 text-xs text-neutral-400">
                      {label}
                      <input
                        type="number"
                        min={1}
                        value={macroDraft.phaseWeeks![i]}
                        onChange={(e) => {
                          const value = Math.max(1, Number(e.target.value) || 1);
                          setMacroDraft((prev) => {
                            if (!prev?.phaseWeeks) return prev;
                            const next = [...prev.phaseWeeks] as [number, number, number, number];
                            next[i] = value;
                            return { ...prev, phaseWeeks: next };
                          });
                        }}
                        className={inputClass}
                      />
                    </label>
                  ))}
                  <div className="flex w-28 flex-col gap-1 text-xs text-neutral-400">
                    Descarga
                    <span className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-neutral-300">
                      {Math.max(0, remainingDeloadWeeks(macroDraft))} sem. (resto)
                    </span>
                  </div>
                </div>
              )}

              {macroDraft.phaseWeeks && remainingDeloadWeeks(macroDraft) < 1 && (
                <p className="text-xs text-brand-orange">
                  Acumulación + intensificación + pico ya ocupan todo el macrociclo — no queda semana para descarga.
                  Alarga el macro o reduce alguna fase.
                </p>
              )}
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
            <p className="text-sm text-neutral-400">Solo fuerza, sin wod</p>
            <p className="text-lg font-semibold text-white">Programa de fuerza</p>
          </div>
          {!programDraft && (
            <button
              onClick={() => setProgramDraft(newStrengthProgramDraft())}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nuevo
            </button>
          )}
        </div>

        {sortedPrograms.length === 0 && !programDraft && (
          <p className="card p-4 text-sm text-neutral-500">
            Sustituye tu día entero por un único método de fuerza durante el rango que quieras — pausa el
            macrociclo mientras dure, sin wod ni oly salvo que lo añadas tú ese día.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {sortedPrograms.map((p) => {
            const status = programStatus(p, today);
            const meta = STRENGTH_METHOD_META[p.method];
            const lifts = p.lifts.length > 0 ? p.lifts : DEFAULT_STRENGTH_PROGRAM_LIFTS;
            return (
              <div key={p.id} className="card flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
                    <meta.Icon size={17} strokeWidth={2.25} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{meta.label}</p>
                    <p className="text-xs text-neutral-500">
                      {p.startDate} → {p.endDate}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-600">
                      {lifts.map((key) => LIFT_OPTIONS.find((l) => l.key === key)?.label ?? key).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${PROGRAM_STATUS_CLASS[status]}`}>
                    {PROGRAM_STATUS_LABEL[status]}
                  </span>
                  <button
                    onClick={() => setProgramDraft(p)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteStrengthProgram(p.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {programDraft && (
          <form onSubmit={saveStrengthProgram} className="card flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
                Inicio
                <input
                  type="date"
                  value={programDraft.startDate}
                  onChange={(e) => setProgramDraft((prev) => (prev ? { ...prev, startDate: e.target.value } : prev))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
                Fin
                <input
                  type="date"
                  value={programDraft.endDate}
                  onChange={(e) => setProgramDraft((prev) => (prev ? { ...prev, endDate: e.target.value } : prev))}
                  className={inputClass}
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">Método</p>
              <div className="flex flex-col gap-2">
                {STRENGTH_METHODS.map((method) => {
                  const meta = STRENGTH_METHOD_META[method];
                  const isSelected = programDraft.method === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setProgramDraft((prev) => (prev ? { ...prev, method } : prev))}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ${
                        isSelected ? 'border-2 border-brand-gold bg-brand-gold/10' : 'border-brand-border bg-white/[0.03] hover:border-brand-gold/50'
                      }`}
                    >
                      <meta.Icon size={17} strokeWidth={2.25} className={`mt-0.5 shrink-0 ${isSelected ? 'text-brand-gold' : 'text-neutral-400'}`} />
                      <span>
                        <span className="block text-sm font-semibold text-white">{meta.label}</span>
                        <span className="block text-xs text-neutral-500">{meta.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">Levantamientos</p>
              <div className="flex flex-wrap gap-2">
                {LIFT_OPTIONS.map((lift) => {
                  const isChecked = programDraft.lifts.includes(lift.key);
                  return (
                    <button
                      key={lift.key}
                      type="button"
                      onClick={() => toggleProgramLift(lift.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                        isChecked
                          ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                          : 'border-brand-border text-neutral-400 hover:border-brand-gold/50'
                      }`}
                    >
                      {lift.label}
                    </button>
                  );
                })}
              </div>
              {programDraft.lifts.length === 0 && <p className="mt-1.5 text-xs text-brand-orange">Elige al menos un levantamiento.</p>}
            </div>

            <p className="text-xs text-neutral-600">
              Mientras esté activo, tu día se reduce a calentamiento + este levantamiento + enfriamiento. Puedes
              añadir un WOD aparte cualquier día desde Planificación, incluido el que tocaría según tu macrociclo.
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={programDraft.lifts.length === 0}
                className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar programa
              </button>
              <button
                type="button"
                onClick={() => setProgramDraft(null)}
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
