import { useMemo, useState } from 'react';
import {
  Pencil,
  Trash2,
  Plus,
  CalendarRange,
  CalendarPlus,
  Dumbbell,
  Target,
  Check,
  Gauge,
  Map,
  Sparkles,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { STRENGTH_METHOD_META, STRENGTH_METHODS, STRENGTH_METHOD_COLOR } from './strengthMethodMeta';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import { getSkillProgressionFor } from '../../data/movements/skillProgressions';
import type {
  AthleteProfile,
  Goal,
  GoalEmphasis,
  GoalType,
  IntensityRamp,
  Macrocycle,
  PersonalRecords,
  SessionHistoryEntry,
  StrengthProgram,
} from '../../data/athlete/types';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate, totalMacrocycleWeeks, weeksSinceStart } from '../../engine/periodization';
import { DEFAULT_STRENGTH_PROGRAM_LIFTS, resolveStrengthProgramDay, TEMPORADA_TOTAL_WEEKS } from '../../engine/strengthPrograms';
import { HALTERO_TOTAL_WEEKS, resolveHalteroDay } from '../../engine/halteroProgram';
import {
  MAYHEM_BASE_TOTAL_WEEKS,
  MAYHEM_PICO_TOTAL_WEEKS,
  MAYHEM_TECNICA_TOTAL_WEEKS,
  resolveMayhemBaseDay,
  resolveMayhemPicoDay,
  resolveMayhemTecnicaDay,
} from '../../engine/mayhemProgram';
import { getAvoidedPatterns } from '../../engine/painFlags';
import { describeRampStatus } from '../../engine/intensityRamp';
import { GOAL_TYPE_COLOR, GOAL_TYPE_META, GOAL_TYPES } from './goalMeta';
import { MacroPlanModal } from './MacroPlanModal';
import { SeasonPlannerModal } from './SeasonPlannerModal';
import { buildNextMacroSuggestion } from '../../engine/nextMacroSuggestion';
import { buildGoalRows } from '../dashboard/progressOverview';

/** A partir de aqui, un objetivo se trata como urgente — mismo umbral usado para destacarlo con el badge pulsante. */
const URGENT_THRESHOLD_DAYS = 14;

const EMPHASIS_HELP: Record<GoalEmphasis, string> = {
  moderado: 'Se adapta a las sesiones ya programadas: cuando un bloque coincide con tu objetivo, se prioriza tu movimiento.',
  intensivo: 'Las sesiones se reestructuran para exponer más tu objetivo en los bloques correspondientes.',
};

type MacroStatus = 'activo' | 'proximo' | 'finalizado';

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

/** Semanas de descarga restantes tras restar acumulacion/intensificacion/pico del total del macro. */
function remainingDeloadWeeks(macro: Macrocycle): number {
  if (!macro.phaseWeeks) return 0;
  const [acc, int, peak] = macro.phaseWeeks;
  return totalMacrocycleWeeks(macro) - acc - int - peak;
}

/** Semana actual dentro del macrociclo (1-indexada, acotada al total) — solo tiene sentido si esta activo. */
function currentMacroWeek(macro: Macrocycle, today: string): number {
  const elapsed = weeksSinceStart(macro.startDate, new Date(`${today}T00:00:00`)) + 1;
  return Math.min(Math.max(elapsed, 1), totalMacrocycleWeeks(macro));
}

type ProgramStatus = MacroStatus;

function programStatus(program: StrengthProgram, today: string): ProgramStatus {
  if (today < program.startDate) return 'proximo';
  if (today > program.endDate) return 'finalizado';
  return 'activo';
}

/**
 * Formato del dia de hoy para un programa activo (ej. "Conjugado · esfuerzo máximo (Back Squat)"),
 * solo para mostrar de un vistazo que toca — autoregFactor=1 porque aqui solo interesa saber que
 * levantamiento/rol toca, no la carga exacta (esa si depende del historial real, y se calcula en
 * Planificacion cuando genera la sesion de verdad).
 */
function todayProgramFormat(program: StrengthProgram, profile: AthleteProfile): string | null {
  const now = new Date();
  const dayPlan = getDayPlan(getWeekdayIndex(now), profile.trainingDaysPerWeek);
  if (!dayPlan.isTrainingDay) return 'Hoy descansas';
  if (program.method === 'haltero') {
    const halteroDay = resolveHalteroDay(program, dayPlan, profile.prs, 1, now);
    if (!halteroDay) return null;
    return `Semana ${halteroDay.weekNumber}/${HALTERO_TOTAL_WEEKS} · ${halteroDay.lifts.map((l) => l.format.split('· ').pop()).join(', ')}`;
  }
  if (program.method === 'mayhem-base' || program.method === 'mayhem-tecnica' || program.method === 'mayhem-pico') {
    const spec =
      program.method === 'mayhem-tecnica'
        ? { resolve: resolveMayhemTecnicaDay, total: MAYHEM_TECNICA_TOTAL_WEEKS }
        : program.method === 'mayhem-pico'
          ? { resolve: resolveMayhemPicoDay, total: MAYHEM_PICO_TOTAL_WEEKS }
          : { resolve: resolveMayhemBaseDay, total: MAYHEM_BASE_TOTAL_WEEKS };
    const mayhemDay = spec.resolve(program, dayPlan, profile.prs, 1, now);
    if (!mayhemDay) return null;
    return `Semana ${mayhemDay.weekNumber}/${spec.total} · ${mayhemDay.lifts.map((l) => l.format.split('· ').pop()).join(', ')}`;
  }
  const avoidedPatterns = getAvoidedPatterns(profile.painFlags, toLocalIsoDate(now));
  const day = resolveStrengthProgramDay(program, dayPlan, profile.prs, 1, now, profile.trainingDaysPerWeek, avoidedPatterns, profile.variantPrs);
  return day?.format ?? null;
}

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

/** Si ya hay una rampa activa, se edita conservando su fecha de inicio real — solo se resetea a "empieza hoy" cuando es la primera vez que se configura. */
function newRampDraft(existing: IntensityRamp | undefined): IntensityRamp {
  return existing ?? { startDate: todayIso(), strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 };
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

type ObjetivosSection = 'macrociclos' | 'programa' | 'rampa' | 'objetivos';

const SECTION_TABS: { key: ObjetivosSection; label: string; Icon: LucideIcon }[] = [
  { key: 'macrociclos', label: 'Macrociclos', Icon: CalendarRange },
  { key: 'programa', label: 'Programa', Icon: Dumbbell },
  { key: 'rampa', label: 'Rampa', Icon: Gauge },
  { key: 'objetivos', label: 'Objetivos', Icon: Target },
];

export function Objetivos() {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [history] = useState<SessionHistoryEntry[]>(() => athleteRepository.getHistory());
  const [activeSection, setActiveSection] = useState<ObjetivosSection>('macrociclos');
  const [macroDraft, setMacroDraft] = useState<Macrocycle | null>(null);
  const [goalDraft, setGoalDraft] = useState<Goal | null>(null);
  const [programDraft, setProgramDraft] = useState<StrengthProgram | null>(null);
  const [rampDraft, setRampDraft] = useState<IntensityRamp | null>(null);
  const [planMacro, setPlanMacro] = useState<Macrocycle | null>(null);
  const [seasonPlanner, setSeasonPlanner] = useState<{ targetDate?: string } | null>(null);
  const [nextMacroDismissed, setNextMacroDismissed] = useState(false);
  const nextMacroSuggestion = useMemo(() => buildNextMacroSuggestion(profile, history), [profile, history]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);

  function persist(next: AthleteProfile) {
    athleteRepository.saveProfile(next);
    setProfile(next);
  }

  function saveRamp(e: React.FormEvent) {
    e.preventDefault();
    if (!rampDraft) return;
    persist({ ...profile, intensityRamp: rampDraft });
    setRampDraft(null);
  }

  function deleteRamp() {
    persist({ ...profile, intensityRamp: undefined });
    setRampDraft(null);
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
    const program = (profile.strengthPrograms ?? []).find((p) => p.id === id);
    if (!window.confirm('¿Eliminar este programa de fuerza? Las sesiones que ya generó dejarán de mostrarse.')) return;
    // Sin esto, las sesiones periodizadas que el programa ya dejó cacheadas se seguirían mostrando
    // en Planificación aunque el programa ya no exista (ver `isCachedSessionOrphaned`).
    if (program) athleteRepository.deleteCachedSessionsInRange(program.startDate, program.endDate);
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
    const macro = profile.macrocycles.find((m) => m.id === id);
    if (!window.confirm('¿Eliminar este macrociclo? Las sesiones que ya generó dejarán de mostrarse.')) return;
    // Sin esto, las sesiones periodizadas que el macro ya dejó cacheadas se seguirían mostrando en
    // Planificación aunque el macro ya no exista (ver `isCachedSessionOrphaned`).
    if (macro) athleteRepository.deleteCachedSessionsInRange(macro.startDate, macro.endDate);
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
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {SECTION_TABS.map((tab) => {
          const isActive = activeSection === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-full px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-brand-bg text-white'
                  : 'border border-brand-border text-neutral-400 hover:border-brand-neon/40 hover:text-neutral-200'
              }`}
            >
              {isActive && <span className="absolute inset-0 rounded-full bg-brand-neon/20 blur-md" />}
              <tab.Icon
                size={16}
                strokeWidth={2.25}
                className={`relative shrink-0 ${isActive ? 'text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.7)]' : 'text-neutral-500'}`}
              />
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSection === 'macrociclos' && (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Tu programación</p>
            <p className="text-lg font-semibold text-white">Macrociclos</p>
          </div>
          {!macroDraft && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSeasonPlanner({})}
                className="flex items-center gap-1.5 rounded-lg border border-brand-neon/40 px-3 py-1.5 text-sm font-semibold text-brand-neon transition-all duration-200 hover:bg-brand-neon/10"
              >
                <Sparkles size={15} strokeWidth={2.25} />
                Planificar temporada
              </button>
              <button
                onClick={() => setMacroDraft(newMacroDraft())}
                className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-brand-gold/20 transition-all duration-200 hover:bg-brand-gold-soft"
              >
                <Plus size={15} strokeWidth={2.25} />
                Nuevo
              </button>
            </div>
          )}
        </div>

        {nextMacroSuggestion && !nextMacroDismissed && !macroDraft && (
          <div className="relative overflow-hidden rounded-xl border border-brand-neon/30 bg-gradient-to-br from-brand-neon/[0.08] to-brand-surface p-3.5">
            <div className="flex items-start gap-3">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-surface">
                <span className="absolute inset-0 rounded-[11px] bg-brand-neon/25 blur-md" />
                <Sparkles size={16} strokeWidth={2.25} className="relative text-brand-neon" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {nextMacroSuggestion.endingStructure.label} termina en {nextMacroSuggestion.daysRemaining === 0 ? 'hoy' : `${nextMacroSuggestion.daysRemaining} días`}
                  {' '}— ¿planeamos {nextMacroSuggestion.suggestsSeason ? 'la temporada' : 'el siguiente bloque'}?
                </p>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-neutral-400">
                  {nextMacroSuggestion.drivingGoal && (
                    <li>
                      Sigue abierto tu objetivo de{' '}
                      <span className="text-neutral-300">
                        {GOAL_TYPE_META[nextMacroSuggestion.drivingGoal.type].label}
                        {nextMacroSuggestion.drivingGoal.movementName ? ` — ${nextMacroSuggestion.drivingGoal.movementName}` : ''}
                      </span>{' '}
                      ({nextMacroSuggestion.drivingGoal.targetDate}) — la fecha de fin se propone en función de eso.
                    </li>
                  )}
                  {!nextMacroSuggestion.drivingGoal && (
                    <li>Sin un objetivo concreto que lo marque, se propone la misma duración que el bloque actual.</li>
                  )}
                  {nextMacroSuggestion.weakPointLabel && (
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle size={11} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-orange" />
                      <span>
                        Tu punto más flojo ahora mismo: <span className="text-neutral-300">{nextMacroSuggestion.weakPointLabel}</span> — tenlo
                        en cuenta al repartir las fases.
                      </span>
                    </li>
                  )}
                  {nextMacroSuggestion.recoveryNote && (
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle size={11} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
                      <span className="text-neutral-300">{nextMacroSuggestion.recoveryNote}</span>
                    </li>
                  )}
                </ul>
                <p className="mt-1.5 text-[11px] text-neutral-600">
                  Solo es un punto de partida — {nextMacroSuggestion.suggestsSeason ? 'se abre el planificador ya relleno' : 'se abre el formulario ya relleno'} para que revises fechas y fases antes de guardar nada.
                </p>
                <div className="mt-2.5 flex gap-2">
                  {nextMacroSuggestion.suggestsSeason ? (
                    <button
                      onClick={() => {
                        setSeasonPlanner({ targetDate: nextMacroSuggestion.drivingGoal?.targetDate });
                        setNextMacroDismissed(true);
                      }}
                      className="rounded-md bg-brand-neon px-2.5 py-1 text-xs font-semibold text-brand-bg transition-colors duration-200 hover:bg-brand-neon-soft"
                    >
                      Planificar temporada
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setMacroDraft(nextMacroSuggestion.draft);
                        setNextMacroDismissed(true);
                      }}
                      className="rounded-md bg-brand-neon px-2.5 py-1 text-xs font-semibold text-brand-bg transition-colors duration-200 hover:bg-brand-neon-soft"
                    >
                      Revisar borrador
                    </button>
                  )}
                  <button
                    onClick={() => setNextMacroDismissed(true)}
                    className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sortedMacros.length === 0 && !macroDraft && (
          <div className="relative overflow-hidden rounded-2xl border border-brand-neon/20 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-4">
            <CalendarRange size={100} strokeWidth={1.5} className="pointer-events-none absolute -bottom-4 -right-2 text-brand-neon/[0.06]" />
            <div className="relative flex items-center gap-3.5">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-bg">
                <span className="absolute inset-0 rounded-2xl bg-brand-neon/25 blur-md" />
                <CalendarRange size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_5px_rgba(57,255,20,0.6)]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Macrociclos</p>
                <p className="text-xs text-neutral-400">Tu programación por fases, activa o futura.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {sortedMacros.map((m) => {
            const status = macroStatus(m, today);

            if (status === 'activo') {
              const totalWeeks = totalMacrocycleWeeks(m);
              const weekNow = currentMacroWeek(m, today);
              const pct = Math.round((weekNow / totalWeeks) * 100);
              return (
                <div
                  key={m.id}
                  className="relative overflow-hidden rounded-xl border p-3.5"
                  style={{ borderColor: 'rgba(212,175,55,0.4)', background: 'linear-gradient(135deg, rgba(212,175,55,0.12), #171310 55%)' }}
                >
                  <div className="absolute inset-y-0 left-0 w-[3px] bg-brand-gold" />
                  <div className="ml-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-surface">
                        <span className="absolute inset-0 rounded-[11px] bg-brand-gold/30 blur-md" />
                        <CalendarRange size={17} strokeWidth={2.25} className="relative text-brand-gold" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">{m.label}</p>
                          <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-semibold text-brand-bg">Activo ahora</span>
                        </div>
                        <p className="text-xs text-neutral-400">
                          {m.startDate} → {m.endDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPlanMacro(m)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-gold/40 text-brand-gold transition-colors duration-200 hover:bg-brand-gold/10"
                      >
                        <Map size={13} />
                      </button>
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
                  <div className="ml-1.5 mt-2.5">
                    {m.phaseWeeks && (
                      <p className="mb-1.5 text-[11px] text-neutral-500">
                        {m.phaseWeeks[0]}s acum. · {m.phaseWeeks[1]}s intens. · {m.phaseWeeks[2]}s pico · {m.phaseWeeks[3]}s descarga
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-neutral-500">
                      <span>
                        Semana {weekNow} de {totalWeeks}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full rounded-full bg-brand-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            }

            if (status === 'proximo') {
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-neutral-500">
                    <CalendarPlus size={16} strokeWidth={2.25} />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-200">{m.label}</p>
                    <p className="text-xs text-neutral-500">Empieza en {daysRemaining(m.startDate)} días</p>
                  </div>
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-400">Próximo</span>
                  <button
                    onClick={() => setPlanMacro(m)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-gold/40 text-brand-gold transition-colors duration-200 hover:bg-brand-gold/10"
                  >
                    <Map size={13} />
                  </button>
                  <button
                    onClick={() => setMacroDraft(m)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteMacro(m.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-1.5 opacity-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.03] text-neutral-600">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <p className="flex-1 text-xs text-neutral-500">{m.label}</p>
                <span className="text-[10px] text-neutral-600">Finalizado</span>
                <button onClick={() => deleteMacro(m.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 hover:text-neutral-400">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <MacroPlanModal macro={planMacro} prs={profile.prs} onClose={() => setPlanMacro(null)} />

        {seasonPlanner !== null && (
          <SeasonPlannerModal
            open
            profile={profile}
            initialTargetDate={seasonPlanner.targetDate}
            onClose={() => setSeasonPlanner(null)}
            onSave={(macrocycles) => {
              persist({ ...profile, macrocycles });
              setSeasonPlanner(null);
            }}
          />
        )}

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
                      const total = totalMacrocycleWeeks(macroDraft);
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
      )}

      {activeSection === 'programa' && (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Solo fuerza, sin wod</p>
            <p className="text-lg font-semibold text-white">Programa de fuerza</p>
          </div>
          {!programDraft && (
            <button
              onClick={() => setProgramDraft(newStrengthProgramDraft())}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-brand-gold/20 transition-all duration-200 hover:bg-brand-gold-soft"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nuevo
            </button>
          )}
        </div>

        {sortedPrograms.length === 0 && !programDraft && (
          <div className="relative overflow-hidden rounded-2xl border border-brand-neon/20 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-4">
            <Dumbbell size={100} strokeWidth={1.5} className="pointer-events-none absolute -bottom-4 -right-2 text-brand-neon/[0.06]" />
            <div className="relative flex items-center gap-3.5">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-bg">
                <span className="absolute inset-0 rounded-2xl bg-brand-neon/25 blur-md" />
                <Dumbbell size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_5px_rgba(57,255,20,0.6)]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Programa de fuerza</p>
                <p className="text-xs text-neutral-400">Un único método, sin wod, cuando te apetezca.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {sortedPrograms.map((p) => {
            const status = programStatus(p, today);
            const meta = STRENGTH_METHOD_META[p.method];
            const color = STRENGTH_METHOD_COLOR[p.method];
            const lifts = p.lifts.length > 0 ? p.lifts : DEFAULT_STRENGTH_PROGRAM_LIFTS;
            // El ciclo de halterofilia ignora `lifts` (trae fijos snatch/clean&jerk/tirones/sentadilla
            // cada semana) — mostrar ese array por defecto aqui confundiria con levantamientos que el
            // ciclo en realidad no usa.
            const liftsLabel =
              p.method === 'haltero'
                ? 'Snatch · Clean & Jerk · Tirones · Sentadilla'
                : p.method === 'mayhem-base' || p.method === 'mayhem-tecnica' || p.method === 'mayhem-pico'
                  ? 'Snatch · Clean & Jerk · Complejos · Sentadilla'
                  : lifts.map((key) => LIFT_OPTIONS.find((l) => l.key === key)?.label ?? key).join(', ');

            if (status === 'activo') {
              const todayFormat = todayProgramFormat(p, profile);
              return (
                <div
                  key={p.id}
                  className="relative overflow-hidden rounded-xl border p-3.5"
                  style={{ borderColor: `${color}66`, background: `linear-gradient(135deg, ${color}1f, #171310 55%)` }}
                >
                  <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
                  <div className="ml-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-surface">
                        <span className="absolute inset-0 rounded-[11px] blur-md" style={{ background: `${color}4d` }} />
                        <meta.Icon size={17} strokeWidth={2.25} className="relative" style={{ color }} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">{meta.label}</p>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: color, color: '#171310' }}>
                            Activo ahora
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400">{liftsLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
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
                  {todayFormat && (
                    <div className="ml-1.5 mt-2.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-neutral-500">Hoy:</span>
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}26`, color }}>
                        {todayFormat}
                      </span>
                    </div>
                  )}
                </div>
              );
            }

            if (status === 'proximo') {
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-neutral-500">
                    <meta.Icon size={16} strokeWidth={2.25} />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-200">{meta.label}</p>
                    <p className="text-xs text-neutral-500">
                      {liftsLabel} · empieza en {daysRemaining(p.startDate)} días
                    </p>
                  </div>
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-400">Próximo</span>
                  <button
                    onClick={() => setProgramDraft(p)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteStrengthProgram(p.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            }

            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-1.5 opacity-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.03] text-neutral-600">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <p className="flex-1 text-xs text-neutral-500">
                  {meta.label} — {liftsLabel}
                </p>
                <span className="text-[10px] text-neutral-600">Finalizado</span>
                <button onClick={() => deleteStrengthProgram(p.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 hover:text-neutral-400">
                  <Trash2 size={12} />
                </button>
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
                      onClick={() =>
                        setProgramDraft((prev) => {
                          if (!prev) return prev;
                          // El ciclo de halterofilia y el bloque de temporada tienen una duracion real
                          // fija (14 y 8 semanas respectivamente) — al elegirlos se propone esa fecha de
                          // fin en vez de dejar el default generico de 2 meses, para que el ciclo pueda
                          // llegar hasta su cierre real (3 intentos de 1RM / semana de retest).
                          const fixedWeeks =
                            method === 'haltero'
                              ? 14
                              : method === 'temporada'
                                ? TEMPORADA_TOTAL_WEEKS
                                : method === 'mayhem-base'
                                  ? MAYHEM_BASE_TOTAL_WEEKS
                                  : method === 'mayhem-tecnica'
                                    ? MAYHEM_TECNICA_TOTAL_WEEKS
                                    : method === 'mayhem-pico'
                                      ? MAYHEM_PICO_TOTAL_WEEKS
                                      : null;
                          if (fixedWeeks !== null && prev.method !== method) {
                            const end = new Date(`${prev.startDate}T00:00:00`);
                            end.setDate(end.getDate() + fixedWeeks * 7 - 1);
                            return { ...prev, method, endDate: toLocalIsoDate(end) };
                          }
                          return { ...prev, method };
                        })
                      }
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

            {programDraft.method !== 'haltero' &&
              programDraft.method !== 'mayhem-base' &&
              programDraft.method !== 'mayhem-tecnica' &&
              programDraft.method !== 'mayhem-pico' && (
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
            )}

            <p className="text-xs text-neutral-600">
              {programDraft.method === 'haltero' ||
              programDraft.method === 'mayhem-base' ||
              programDraft.method === 'mayhem-tecnica' ||
              programDraft.method === 'mayhem-pico'
                ? 'Mientras esté activo, tu día se reduce a calentamiento + los levantamientos de olímpico/sentadilla que toquen esa semana + enfriamiento — el ciclo ya trae fijos los movimientos de cada día, no hace falta elegir. Puedes añadir un WOD aparte cualquier día desde Planificación.'
                : 'Mientras esté activo, tu día se reduce a calentamiento + este levantamiento + enfriamiento. Puedes añadir un WOD aparte cualquier día desde Planificación, incluido el que tocaría según tu macrociclo.'}
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={
                  programDraft.method !== 'haltero' &&
                  programDraft.method !== 'mayhem-base' &&
                  programDraft.method !== 'mayhem-tecnica' &&
                  programDraft.method !== 'mayhem-pico' &&
                  programDraft.lifts.length === 0
                }
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
      )}

      {activeSection === 'rampa' && (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Vuelta gradual sin macro ni programa</p>
            <p className="text-lg font-semibold text-white">Rampa de vuelta</p>
          </div>
          {!rampDraft && (
            <button
              onClick={() => setRampDraft(newRampDraft(profile.intensityRamp))}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-brand-gold/20 transition-all duration-200 hover:bg-brand-gold-soft"
            >
              {profile.intensityRamp ? <Pencil size={13} strokeWidth={2.25} /> : <Plus size={15} strokeWidth={2.25} />}
              {profile.intensityRamp ? 'Editar' : 'Nueva'}
            </button>
          )}
        </div>

        {!profile.intensityRamp && !rampDraft && (
          <div className="relative overflow-hidden rounded-2xl border border-brand-neon/20 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-4">
            <Gauge size={100} strokeWidth={1.5} className="pointer-events-none absolute -bottom-4 -right-2 text-brand-neon/[0.06]" />
            <div className="relative flex items-center gap-3.5">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-bg">
                <span className="absolute inset-0 rounded-2xl bg-brand-neon/25 blur-md" />
                <Gauge size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_5px_rgba(57,255,20,0.6)]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Rampa de vuelta</p>
                <p className="text-xs text-neutral-400">Si vuelves de un parón, sube de intensidad poco a poco en vez de ir al 100% el primer día.</p>
              </div>
            </div>
          </div>
        )}

        {profile.intensityRamp && !rampDraft && (
          <div className="relative overflow-hidden rounded-xl border border-brand-neon/25 p-3.5" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.12), #171310 55%)' }}>
            <div className="absolute inset-y-0 left-0 w-[3px] bg-brand-neon" />
            <div className="ml-1.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-surface">
                  <span className="absolute inset-0 rounded-[11px] bg-brand-neon/30 blur-md" />
                  <Gauge size={17} strokeWidth={2.25} className="relative text-brand-neon" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {describeRampStatus(profile.intensityRamp, new Date()) ?? 'Rampa completada'}
                  </p>
                  <p className="text-xs text-neutral-400">Empezó el {profile.intensityRamp.startDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRampDraft(profile.intensityRamp!)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={deleteRamp}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors duration-200 hover:bg-white/5"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {rampDraft && (
          <form onSubmit={saveRamp} className="card flex flex-col gap-3 p-4">
            <p className="text-xs text-neutral-500">
              Cada dominio sube en línea recta desde el 60% hasta el 100% a lo largo de las semanas que elijas — pon 0 si no
              quieres rampa en ese dominio.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Fuerza (semanas)
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={rampDraft.strengthWeeks}
                  onChange={(e) => setRampDraft((prev) => (prev ? { ...prev, strengthWeeks: Number(e.target.value) } : prev))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Oly (semanas)
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={rampDraft.olyWeeks}
                  onChange={(e) => setRampDraft((prev) => (prev ? { ...prev, olyWeeks: Number(e.target.value) } : prev))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                WOD (semanas)
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={rampDraft.wodWeeks}
                  onChange={(e) => setRampDraft((prev) => (prev ? { ...prev, wodWeeks: Number(e.target.value) } : prev))}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
              >
                Guardar rampa
              </button>
              <button
                type="button"
                onClick={() => setRampDraft(null)}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
      )}

      {activeSection === 'objetivos' && (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">Énfasis concurrentes</p>
            <p className="text-lg font-semibold text-white">Objetivos</p>
          </div>
          {!goalDraft && (
            <button
              onClick={() => setGoalDraft(newGoalDraft())}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-brand-gold/20 transition-all duration-200 hover:bg-brand-gold-soft"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nuevo
            </button>
          )}
        </div>

        {profile.goals.length === 0 && !goalDraft && (
          <div className="relative overflow-hidden rounded-2xl border border-brand-neon/20 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-4">
            <Target size={100} strokeWidth={1.5} className="pointer-events-none absolute -bottom-4 -right-2 text-brand-neon/[0.06]" />
            <div className="relative flex items-center gap-3.5">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-bg">
                <span className="absolute inset-0 rounded-2xl bg-brand-neon/25 blur-md" />
                <Target size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_5px_rgba(57,255,20,0.6)]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Objetivos</p>
                <p className="text-xs text-neutral-400">Varios a la vez — el más urgente manda.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {profile.goals.map((g) => {
            const meta = GOAL_TYPE_META[g.type];
            const color = GOAL_TYPE_COLOR[g.type];
            const movement = g.movementId ? getMovementById(g.movementId) : undefined;
            const remaining = daysRemaining(g.targetDate);
            const row = goalRows.find((r) => r.id === g.id);
            const isExpired = remaining < 0;
            const isUrgent = !isExpired && remaining <= URGENT_THRESHOLD_DAYS;

            if (isExpired) {
              return (
                <div key={g.id} className="flex items-center gap-3 rounded-xl px-3 py-1.5 opacity-50">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.03] text-neutral-600">
                    <meta.Icon size={12} strokeWidth={2.5} />
                  </span>
                  <p className="flex-1 text-xs text-neutral-500">
                    {meta.label}
                    {movement ? ` — ${movement.name}` : ''}
                  </p>
                  <span className="text-[10px] text-neutral-600">Vencido</span>
                  <button
                    onClick={() => setGoalDraft(g)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 hover:text-neutral-400"
                  >
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deleteGoal(g.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 hover:text-neutral-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={g.id}
                className="relative overflow-hidden rounded-xl border p-3.5"
                style={{ borderColor: `${color}66`, background: `linear-gradient(135deg, ${color}1f, #171310 55%)` }}
              >
                <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
                <div className="ml-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-surface">
                      <span className="absolute inset-0 rounded-[11px] blur-md" style={{ background: `${color}4d` }} />
                      <meta.Icon size={17} strokeWidth={2.25} className="relative" style={{ color }} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{meta.label}</p>
                        {isUrgent && (
                          <span className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                            {remaining === 0 ? 'Hoy' : remaining === 1 ? '1 día' : `${remaining} días`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-400">
                        {movement ? `${movement.name} · ` : ''}
                        {g.targetDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                <div className="ml-1.5 mt-2.5">
                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span>
                      {row?.sublabel} · <span className="capitalize">{g.emphasis}</span>
                    </span>
                    <span>{row?.pct ?? 0}%</span>
                  </div>
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full" style={{ width: `${row?.pct ?? 0}%`, background: color }} />
                  </div>
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
                          prev
                            ? {
                                ...prev,
                                type,
                                movementId: GOAL_TYPE_META[type].needsMovement ? firstMovementId(type) : undefined,
                                skillLevel: undefined,
                              }
                            : prev,
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
                  onChange={(e) =>
                    setGoalDraft((prev) => (prev ? { ...prev, movementId: e.target.value, skillLevel: undefined } : prev))
                  }
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

            {goalDraft.type === 'mejorar-gimnasticos' &&
              (() => {
                const progression = goalDraft.movementId ? getSkillProgressionFor(goalDraft.movementId) : undefined;
                if (!progression) return null;
                const total = progression.steps.length;
                const selectedIndex =
                  goalDraft.skillLevel != null ? Math.min(total - 1, Math.floor(goalDraft.skillLevel * total)) : -1;
                return (
                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    ¿Por dónde empiezas?
                    <select
                      value={selectedIndex}
                      onChange={(e) =>
                        setGoalDraft((prev) => {
                          if (!prev) return prev;
                          const i = Number(e.target.value);
                          return { ...prev, skillLevel: i < 0 ? undefined : (i + 0.5) / total };
                        })
                      }
                      className={inputClass}
                    >
                      <option value={-1}>Desde el principio</option>
                      {progression.steps.map((step, i) => (
                        <option key={step.movementId} value={i}>
                          Paso {i + 1} de {total} — {getMovementById(step.movementId)?.name ?? step.movementId}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-neutral-600">
                      El coach no programará un escalón por debajo de este. La fecha objetivo sigue tirando hacia arriba.
                    </span>
                  </label>
                );
              })()}

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
      )}
    </div>
  );
}
