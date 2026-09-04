import { useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import { buildWeeklyVolumeSeries, summariseVolumeTrend } from '../../engine/volumeMetrics';
import { Modal } from '../shell/Modal';
import { Sparkline } from './Sparkline';

interface VolumeSummaryModalProps {
  onClose: () => void;
}

interface Row {
  movementId: string;
  label: string;
  values: number[];
  thisWeekKg: number;
  deltaPct: number | null;
}

/**
 * Tonelaje semanal (Σ kg × reps, `workLog`) de cada movimiento de fuerza/oly que el atleta ha
 * registrado — ocupa el hueco del botón de "próxima semana" en el Dashboard: ver la sesión de
 * dentro de 7 días aportaba poco a un atleta que va semana a semana, mientras que saber si el
 * volumen de cada lift sube, baja o se estanca es justo la pregunta que antes no tenía respuesta en
 * la app. Se calcula sobre el `movementId` exacto que aparece en `workLog` — cualquier levantamiento
 * o variante que el atleta haya marcado en el modo enfocado sale aquí, no solo los 8 PRs raíz.
 */
export function VolumeSummaryModal({ onClose }: VolumeSummaryModalProps) {
  const [workLog] = useState(() => athleteRepository.getWorkLog());

  const movementIds = [...new Set(workLog.map((e) => e.movementId))];
  const rows: Row[] = movementIds
    .map((movementId) => {
      const series = buildWeeklyVolumeSeries(workLog, movementId);
      const trend = summariseVolumeTrend(series);
      return {
        movementId,
        label: getMovementById(movementId)?.name ?? movementId,
        values: series.map((p) => p.tonnageKg),
        thisWeekKg: trend.thisWeekKg,
        deltaPct: trend.deltaPct,
      };
    })
    .filter((row) => row.values.some((v) => v > 0))
    .sort((a, b) => b.thisWeekKg - a.thisWeekKg);

  return (
    <Modal open onClose={onClose} title="Volumen semanal">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          Aún no hay series registradas en el modo entreno — el tonelaje semanal de cada levantamiento aparecerá aquí en cuanto
          marques alguna.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.movementId} className="border-l-2 border-white/10 py-1.5 pl-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-white">{row.label}</p>
                <p className="shrink-0 text-sm font-bold text-white">
                  {row.thisWeekKg.toLocaleString('es')} <span className="text-[10px] font-normal text-neutral-500">kg</span>
                </p>
              </div>
              {row.deltaPct != null && row.deltaPct !== 0 && (
                <p className={`text-[11px] ${row.deltaPct > 0 ? 'text-brand-neon' : 'text-brand-orange'}`}>
                  {row.deltaPct > 0 ? '+' : ''}
                  {row.deltaPct}% vs. semana anterior
                </p>
              )}
              <Sparkline
                values={row.values}
                strokeClassName="stroke-brand-gold"
                areaClassName="fill-brand-gold/10"
                dotClassName="fill-brand-gold"
                className="mt-1.5 h-10 w-full"
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
