import { Flame, MapPin, Moon, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import type { Macrocycle, PersonalRecords } from '../../data/athlete/types';
import { buildMacroPlan, type MacroPlanPhase } from '../../engine/macroPlan';
import { Modal } from '../shell/Modal';

const PHASE_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: '#38bdf8',
  2: '#f97316',
  3: '#f87171',
  4: '#39ff14',
};

const PHASE_ICON: Record<1 | 2 | 3 | 4, LucideIcon> = {
  1: TrendingUp,
  2: Flame,
  3: Zap,
  4: Moon,
};

interface MacroPlanModalProps {
  macro: Macrocycle | null;
  prs: PersonalRecords;
  onClose: () => void;
}

export function MacroPlanModal({ macro, prs, onClose }: MacroPlanModalProps) {
  if (!macro) return null;
  const plan = buildMacroPlan(macro, prs);
  const markerPct = ((plan.currentWeek - 0.5) / plan.totalWeeks) * 100;
  const isBeforeStart = plan.currentWeek <= 1 && Date.now() < new Date(`${macro.startDate}T00:00:00`).getTime();

  return (
    <Modal open onClose={onClose} title={macro.label}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>
            {macro.startDate} → {macro.endDate}
          </span>
          <span className="font-semibold text-white">
            Semana {plan.currentWeek} de {plan.totalWeeks}
          </span>
        </div>

        {/* Linea de tiempo de fases */}
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {plan.phases.map((phase, i) => (
              <div
                key={i}
                style={{ flexGrow: phase.lengthWeeks, background: PHASE_COLOR[phase.phaseIndex] }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
          <div className="relative h-5">
            <div
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${Math.min(Math.max(markerPct, 2), 98)}%` }}
            >
              <div className="h-2 w-2 rotate-45 bg-white" />
              <MapPin size={13} strokeWidth={2.5} className="-mt-1 text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
            </div>
          </div>
          {isBeforeStart && <p className="-mt-2 text-center text-[10px] text-neutral-500">Aún no ha empezado</p>}
        </div>

        {/* Leyenda de tipos de fase */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {([1, 2, 3, 4] as const).map((idx) => {
            const Icon = PHASE_ICON[idx];
            const active = plan.currentPhaseIndex === idx;
            return (
              <span key={idx} className={`flex items-center gap-1.5 text-[11px] ${active ? 'font-semibold text-white' : 'text-neutral-500'}`}>
                <Icon size={12} strokeWidth={2.5} style={{ color: PHASE_COLOR[idx] }} />
                {phaseName(idx)}
              </span>
            );
          })}
        </div>

        {/* Fase actual */}
        <div className="relative overflow-hidden rounded-xl border p-3.5" style={{ borderColor: `${PHASE_COLOR[plan.currentPhaseIndex]}55`, background: `linear-gradient(135deg, ${PHASE_COLOR[plan.currentPhaseIndex]}1f, #171310 60%)` }}>
          <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: PHASE_COLOR[plan.currentPhaseIndex] }} />
          <div className="ml-1.5 flex items-center gap-2">
            {(() => {
              const Icon = PHASE_ICON[plan.currentPhaseIndex];
              return <Icon size={16} strokeWidth={2.5} style={{ color: PHASE_COLOR[plan.currentPhaseIndex] }} />;
            })()}
            <p className="text-sm font-semibold text-white">
              {phaseName(plan.currentPhaseIndex)} · semana {plan.weekInPhase} de {plan.phaseLengthWeeks}
            </p>
          </div>
          <p className="ml-1.5 mt-1 text-xs text-neutral-400">{phaseCoachNote(plan.currentPhaseIndex, plan.phases)}</p>
        </div>

        {/* Referencia de carga por fase */}
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">Carga de referencia (Sentadilla trasera)</p>
          <div className="grid grid-cols-4 gap-2">
            {plan.phases
              .filter((p, i, arr) => arr.findIndex((x) => x.phaseIndex === p.phaseIndex) === i)
              .sort((a, b) => a.phaseIndex - b.phaseIndex)
              .map((phase) => (
                <div
                  key={phase.phaseIndex}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 ${
                    phase.phaseIndex === plan.currentPhaseIndex ? 'border-white/30 bg-white/[0.06]' : 'border-brand-border'
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wide text-neutral-500">{Math.round(phase.percent * 100)}%</span>
                  <span className="text-sm font-semibold text-white">{phase.referenceLoadKg}</span>
                  <span className="text-[9px] text-neutral-600">kg</span>
                </div>
              ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Ejemplo con tu PR actual — el mismo % se aplica a cada levantamiento del día, no solo a sentadilla.
          </p>
        </div>

        {macro.phaseWeeks ? (
          <p className="text-[11px] text-neutral-600">
            Duración de fases personalizada por ti: {macro.phaseWeeks[0]}s / {macro.phaseWeeks[1]}s / {macro.phaseWeeks[2]}s / {macro.phaseWeeks[3]}s.
          </p>
        ) : (
          <p className="text-[11px] text-neutral-600">
            Sin fases personalizadas: el ciclo clásico de 4 semanas se repite sin parar durante todo el macrociclo — por eso
            la línea de arriba se ve rayada en vez de en 4 bloques grandes.
          </p>
        )}
      </div>
    </Modal>
  );
}

function phaseName(idx: 1 | 2 | 3 | 4): string {
  return ['Acumulación', 'Intensificación', 'Pico', 'Descarga'][idx - 1];
}

function phaseCoachNote(currentPhaseIndex: 1 | 2 | 3 | 4, phases: MacroPlanPhase[]): string {
  const phase = phases.find((p) => p.phaseIndex === currentPhaseIndex);
  return phase?.coachNote ?? '';
}
