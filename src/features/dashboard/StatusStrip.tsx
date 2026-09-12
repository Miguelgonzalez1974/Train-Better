import { CalendarCheck, Gauge, ChevronRight, Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { PrTrendDirection } from '../../engine/weakPoints';
import type { ProgressRow } from './progressOverview';
import { AcwrGauge } from './AcwrGauge';

const RPE_TREND_ICON: Record<PrTrendDirection, typeof TrendingUp> = {
  subida: TrendingUp,
  bajada: TrendingDown,
  estable: Minus,
};

const ACWR_DOT_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'bg-sky-400',
  optima: 'bg-emerald-400',
  moderada: 'bg-brand-orange',
  alta: 'bg-red-400',
};

interface StatusStripProps {
  diasEntrenados: string;
  diasEsteAnio: string | null;
  diasRxLabel: string;
  rpeLabel: string;
  rpeTrend: { direction: PrTrendDirection; label: string } | null;
  acwr: AcwrResult;
  acwrTrend: (number | null)[];
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  onNavigateToObjetivos: () => void;
}

/**
 * Antes eran 3 tarjetas separadas ("Este mes", "Tu progreso", el gauge de ACWR) apiladas nada más
 * abrir el Dashboard — cada una con su borde e icono propios para, en conjunto, decir bastante
 * poco: unos días, un RPE, si hay macro/objetivo, y la carga. Aquí es una sola franja de 3 cifras
 * (días / RPE / carga) más una línea de "estructura activa" tocable — el gauge de ACWR completo
 * (con la barra de zonas y el sparkline) solo se despliega debajo cuando la carga NO está en zona
 * óptima (o aún no hay datos suficientes): es cuando de verdad hace falta mirarlo, el mismo
 * criterio que ya usa `AttentionBanner` para avisar. Sin racha: el atleta ya tiene el heatmap de
 * constancia para eso, y duplicaba la misma idea de dos formas distintas.
 */
export function StatusStrip({
  diasEntrenados,
  diasEsteAnio,
  diasRxLabel,
  rpeLabel,
  rpeTrend,
  acwr,
  acwrTrend,
  structureRow,
  goalRows,
  onNavigateToObjetivos,
}: StatusStripProps) {
  const RpeTrendIcon = rpeTrend ? RPE_TREND_ICON[rpeTrend.direction] : null;
  const expandAcwr = acwr.acwr === null || acwr.zone !== 'optima';
  const hasStructure = Boolean(structureRow) || goalRows.length > 0;
  const goalsLabel = `${goalRows.length} ${goalRows.length === 1 ? 'objetivo activo' : 'objetivos activos'}`;
  const StructureIcon = structureRow?.Icon ?? Target;
  const structureColor = structureRow?.color ?? '#d4af37';

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3.5">
        <div className="grid grid-cols-3 divide-x divide-white/5">
          <div className="pr-2">
            <p className="text-[20px] font-bold leading-none tracking-tight text-white">{diasEntrenados}</p>
            <p className="mt-1 text-[10px] leading-tight text-neutral-400">días{diasEsteAnio ? ` · ${diasEsteAnio} año` : ''}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
              <CalendarCheck size={9} strokeWidth={2.5} className="shrink-0" />
              {diasRxLabel} Rx
            </p>
          </div>
          <div className="px-2">
            <p className="text-[20px] font-bold leading-none tracking-tight text-white">{rpeLabel}</p>
            <p className="mt-1 text-[10px] leading-tight text-neutral-400">RPE medio</p>
            {rpeTrend && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
                {RpeTrendIcon && <RpeTrendIcon size={9} strokeWidth={2.75} className="shrink-0" />}
                {rpeTrend.label}
              </p>
            )}
          </div>
          <div className="pl-2">
            <p className="flex items-center gap-1.5 text-[20px] font-bold leading-none tracking-tight text-white">
              {acwr.acwr !== null ? acwr.acwr.toFixed(2) : '—'}
              <span className={`h-2 w-2 shrink-0 rounded-full ${acwr.acwr !== null ? ACWR_DOT_CLASS[acwr.zone] : 'bg-neutral-700'}`} />
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-neutral-400">
              <Gauge size={9} strokeWidth={2.5} className="shrink-0" />
              carga (ACWR)
            </p>
          </div>
        </div>

        {hasStructure && (
          <button
            onClick={onNavigateToObjetivos}
            title="Ver macrociclos y objetivos"
            className="mt-3 flex w-full items-center gap-2.5 border-t border-white/5 pt-3 text-left transition-colors duration-200 hover:text-brand-gold"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${structureColor}26`, color: structureColor }}
            >
              <StructureIcon size={13} strokeWidth={2.25} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">
              {structureRow ? (
                <>
                  {structureRow.label} <span className="text-neutral-500">· {structureRow.sublabel}</span>
                  {goalRows.length > 0 && <span className="text-neutral-500"> · {goalsLabel}</span>}
                </>
              ) : (
                goalsLabel
              )}
            </span>
            <ChevronRight size={14} strokeWidth={2.25} className="shrink-0 text-neutral-600" />
          </button>
        )}
      </div>

      {expandAcwr && <AcwrGauge result={acwr} trend={acwrTrend} />}
    </div>
  );
}
