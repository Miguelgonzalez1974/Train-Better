import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Flame, Zap, Moon, ArrowRight } from 'lucide-react';
import type { AthleteProfile, Macrocycle } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import {
  buildSeasonPlan,
  MAX_SEASON_BLOCKS,
  MIN_SEASON_BLOCKS,
  seasonBlocksToMacrocycles,
} from '../../engine/seasonPlan';
import { Modal } from '../shell/Modal';

interface SeasonPlannerModalProps {
  open: boolean;
  profile: AthleteProfile;
  /** Fecha objetivo con la que pre-rellenar (p.ej. desde la tarjeta de "planifica el siguiente bloque"). */
  initialTargetDate?: string;
  onClose: () => void;
  /** Recibe la lista COMPLETA de macrociclos ya combinada (existentes + nuevos), lista para persistir. */
  onSave: (macrocycles: Macrocycle[]) => void;
}

const inputClass =
  'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

const PHASE_ICON = [TrendingUp, Flame, Zap, Moon] as const;
const PHASE_SHORT = ['acum.', 'intens.', 'pico', 'descarga'] as const;

function todayIso(): string {
  return toLocalIsoDate(new Date());
}

/** Día siguiente al fin del último macrociclo planificado; si no hay ninguno, hoy. */
function defaultStart(profile: AthleteProfile): string {
  const lastEnd = profile.macrocycles.map((m) => m.endDate).sort().pop();
  if (!lastEnd) return todayIso();
  const d = new Date(`${lastEnd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const iso = toLocalIsoDate(d);
  return iso > todayIso() ? iso : todayIso();
}

/** Objetivo abierto (no vencido) con la fecha más lejana. */
function farthestOpenGoal(profile: AthleteProfile): string | undefined {
  const today = todayIso();
  return profile.goals
    .map((g) => g.targetDate)
    .filter((d) => d > today)
    .sort()
    .pop();
}

export function SeasonPlannerModal({ open, profile, initialTargetDate, onClose, onSave }: SeasonPlannerModalProps) {
  const [startDate, setStartDate] = useState(() => defaultStart(profile));
  const [targetDate, setTargetDate] = useState(() => initialTargetDate ?? farthestOpenGoal(profile) ?? '');
  const [blockCount, setBlockCount] = useState<number | undefined>(undefined);

  const plan = useMemo(() => {
    if (!targetDate) return null;
    return buildSeasonPlan({ startDate, targetDate, prs: profile.prs, blockCount });
  }, [startDate, targetDate, blockCount, profile.prs]);

  const overlap = useMemo(() => {
    if (!plan) return false;
    return plan.blocks.some((b) =>
      profile.macrocycles.some((m) => m.startDate <= b.endDate && b.startDate <= m.endDate),
    );
  }, [plan, profile.macrocycles]);

  const rangeTooShort = Boolean(targetDate) && !plan;

  function handleSave() {
    if (!plan || overlap) return;
    const merged = [...profile.macrocycles, ...seasonBlocksToMacrocycles(plan.blocks)].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    onSave(merged);
  }

  const blockButtons = Array.from(
    { length: MAX_SEASON_BLOCKS - MIN_SEASON_BLOCKS + 1 },
    (_, i) => MIN_SEASON_BLOCKS + i,
  );

  return (
    <Modal open={open} onClose={onClose} title="Planificar temporada">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-neutral-500">
          El coach reparte el rango en varios macrociclos encadenados hacia tu fecha objetivo — más volumen al
          principio, más intensidad y una semana de taper al final. Es un punto de partida: cada bloque se edita
          después como cualquier macrociclo.
        </p>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
            Inicio
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-400">
            Fecha objetivo
            <input
              type="date"
              min={startDate}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-neutral-400">Nº de bloques</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBlockCount(undefined)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                blockCount === undefined
                  ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                  : 'border-brand-border text-neutral-400 hover:border-brand-gold/50'
              }`}
            >
              Auto
            </button>
            {blockButtons.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBlockCount(n)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  blockCount === n
                    ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                    : 'border-brand-border text-neutral-400 hover:border-brand-gold/50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {!targetDate && (
          <p className="rounded-lg border border-brand-border/60 bg-white/[0.02] p-3 text-xs text-neutral-500">
            Elige una fecha objetivo (una competición o la fecha de un objetivo abierto) para ver la propuesta.
          </p>
        )}

        {rangeTooShort && (
          <p className="rounded-lg border border-brand-orange/40 bg-brand-orange/[0.06] p-3 text-xs text-brand-orange">
            El rango es demasiado corto para una temporada. Crea un macrociclo suelto con el botón «Nuevo».
          </p>
        )}

        {plan && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span>
                {plan.totalWeeks} semanas · {plan.blockCount} bloques
              </span>
              {plan.drivingGoal && <span className="text-neutral-400">Objetivo: {plan.drivingGoal.label}</span>}
            </div>

            {plan.blocks.map((b, i) => (
              <div
                key={b.id}
                className="relative overflow-hidden rounded-xl border p-3"
                style={{
                  borderColor: b.role === 'pico' ? 'rgba(249,115,22,0.4)' : 'rgba(212,175,55,0.35)',
                  background:
                    b.role === 'pico'
                      ? 'linear-gradient(135deg, rgba(249,115,22,0.12), #171310 60%)'
                      : 'linear-gradient(135deg, rgba(212,175,55,0.10), #171310 60%)',
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: b.role === 'pico' ? '#f97316' : '#d4af37' }}
                />
                <div className="ml-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{b.label}</p>
                    <span className="text-[10px] text-neutral-500">{b.totalWeeks} sem.</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {b.startDate} <ArrowRight size={9} className="mx-0.5 inline" /> {b.endDate}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {b.phaseWeeks.map((w, pi) => {
                      const Icon = PHASE_ICON[pi];
                      return (
                        <span key={pi} className="flex items-center gap-1 text-[10px] text-neutral-500">
                          <Icon size={10} strokeWidth={2.5} />
                          {w}s {PHASE_SHORT[pi]}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-600">{b.focusNote}</p>
                </div>
                {i < plan.blocks.length - 1 && (
                  <div className="mt-1 flex justify-center text-neutral-700">
                    <span className="h-3 w-px bg-neutral-700" />
                  </div>
                )}
              </div>
            ))}

            {overlap && (
              <p className="rounded-lg border border-brand-orange/40 bg-brand-orange/[0.06] p-3 text-xs text-brand-orange">
                Algún bloque se solapa con un macrociclo que ya tienes. Ajusta la fecha de inicio o borra el
                macrociclo que estorba antes de guardar.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!plan || overlap}
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={14} strokeWidth={2.5} />
            Guardar temporada
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
