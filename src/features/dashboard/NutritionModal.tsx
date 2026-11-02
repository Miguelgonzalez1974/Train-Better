import { useMemo } from 'react';
import { ArrowRight, Scale } from 'lucide-react';
import type { BodyweightEntry, SessionHistoryEntry } from '../../data/athlete/types';
import { computeAcwr } from '../../engine/loadMetrics';
import { toLocalIsoDate } from '../../engine/periodization';
import { analyzeWeightTrend, NUTRITION_DISCLAIMER, type WeightTrendStatus } from '../../engine/nutritionPlan';
import { Modal } from '../shell/Modal';
import { nutritionPct, type NutritionSummary } from './nutritionSummary';

const TREND_STYLE: Record<WeightTrendStatus, string> = {
  'sin-datos': 'text-neutral-400',
  rapido: 'text-brand-orange',
  'en-objetivo': 'text-good',
  lento: 'text-brand-gold',
  'sin-perdida': 'text-brand-gold',
};

const TREND_TITLE: Record<WeightTrendStatus, string> = {
  'sin-datos': 'Sin datos suficientes',
  rapido: 'Pierdes demasiado deprisa',
  'en-objetivo': 'Ritmo en objetivo',
  lento: 'Ritmo lento',
  'sin-perdida': 'Sin pérdida en las últimas semanas',
};

/** Una barra de lo comido: gramos hechos sobre el objetivo; se pone verde al cubrirlo. */
function IntakeBar({ label, done, target }: { label: string; done: number; target: number }) {
  const pct = Math.min(100, (done / Math.max(1, target)) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-neutral-300">{label}</span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 100 ? 'rgb(var(--c-state-good))' : 'rgb(var(--c-white) / 0.7)' }} />
      </div>
      <span className="num w-[5rem] shrink-0 text-right text-xs text-neutral-400">
        <span className="font-semibold text-neutral-100">{done}</span>/{target} g
      </span>
    </div>
  );
}

/** Lo que llevas del día elegido, con el % grande y un acceso a la pestaña Nutrición. */
function NutritionToday({ progress, dayLabel, onOpen }: { progress: NutritionSummary | null; dayLabel: string; onOpen: () => void }) {
  const pct = progress ? nutritionPct(progress) : null;
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl bg-white/[0.04] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-white">Nutrición · {dayLabel.toLowerCase()}</p>
        {pct !== null && (
          <p className="num text-3xl font-extrabold leading-none" style={{ color: pct >= 90 ? 'rgb(var(--c-state-good))' : undefined }}>
            {pct}
            <span className="ml-0.5 text-base font-bold text-neutral-500">%</span>
          </p>
        )}
      </div>
      {progress ? (
        <div className="flex flex-col gap-2.5">
          <IntakeBar label="Proteína" done={progress.protein.done} target={progress.protein.target} />
          <IntakeBar label="Hidratos" done={progress.carbs.done} target={progress.carbs.target} />
        </div>
      ) : (
        <p className="text-xs text-neutral-400">No apuntaste comidas ese día.</p>
      )}
      <button
        onClick={onOpen}
        className="flex items-center justify-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-2 text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        Abrir Nutrición <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

interface NutritionModalProps {
  history: SessionHistoryEntry[];
  bodyweightLog: BodyweightEntry[];
  /** Lo comido del día elegido frente a lo que toca (null si no hay peso o ese día no se apuntó nada). */
  progress: NutritionSummary | null;
  /** El día elegido en el Dashboard ("Hoy", "Ayer"…). */
  dayLabel: string;
  /** Abre la pestaña Nutrición. */
  onOpenNutricion: () => void;
  /** La sesión de hoy es de descarga por fatiga: también cuenta como carga tensa para la tendencia. */
  deloadToday: boolean;
  onClose: () => void;
  onOpenBodyweight: () => void;
}

/**
 * Resumen de nutrición del Dashboard: lo comido del día elegido y el peso con su tendencia (ver `analyzeWeightTrend`
 * en `engine/nutritionPlan.ts` para los límites). Solo lee — nunca escribe en el perfil.
 */
export function NutritionModal({ history, bodyweightLog, progress, dayLabel, onOpenNutricion, deloadToday, onClose, onOpenBodyweight }: NutritionModalProps) {
  const todayIso = toLocalIsoDate(new Date());
  const latest = useMemo(() => [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop(), [bodyweightLog]);
  // Con la carga alta (ACWR) no se aprieta el déficit: la tendencia lo tiene en cuenta.
  const highStrain = useMemo(() => computeAcwr(history).zone === 'alta' || deloadToday, [history, deloadToday]);
  const trend = useMemo(() => analyzeWeightTrend(bodyweightLog, todayIso, { highStrain }), [bodyweightLog, todayIso, highStrain]);

  if (!latest) {
    return (
      <Modal open onClose={onClose} title="Nutrición">
        <div className="flex flex-col gap-3 text-sm text-neutral-300">
          <p>Las cantidades del día se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
          <button
            onClick={onOpenBodyweight}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black"
          >
            <Scale size={16} strokeWidth={2.25} /> Registrar mi peso
          </button>
          <p className="text-xs text-neutral-500">{NUTRITION_DISCLAIMER}</p>
        </div>
      </Modal>
    );
  }

  const kg = latest.kg;

  return (
    <Modal open onClose={onClose} title="Nutrición">
      <div className="flex flex-col gap-3">
        <NutritionToday progress={progress} dayLabel={dayLabel} onOpen={onOpenNutricion} />
        {/* El peso, a la vista: de él salen las cantidades por kilo y la tendencia. */}
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-white">Peso corporal</p>
            <p className="num text-2xl font-extrabold leading-none text-white">
              {String(kg).replace('.', ',')}
              <span className="ml-1 text-sm font-bold text-neutral-500">kg</span>
            </p>
          </div>
          <p className={`text-sm font-semibold ${TREND_STYLE[trend.status]}`}>
            {TREND_TITLE[trend.status]}
            {trend.lossPctPerWeek !== null && (
              <span className="ml-2 font-normal text-neutral-500">
                {trend.lossPctPerWeek >= 0 ? '−' : '+'}
                {Math.abs(trend.lossPctPerWeek).toFixed(1).replace('.', ',')} %/semana
              </span>
            )}
          </p>
          <p className="text-[13px] leading-relaxed text-neutral-300">{trend.message}</p>
          <button
            onClick={onOpenBodyweight}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-2 text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Scale size={13} strokeWidth={2.25} aria-hidden="true" /> Registrar peso
          </button>
        </div>
      </div>
    </Modal>
  );
}
