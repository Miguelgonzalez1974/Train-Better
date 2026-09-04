import { useState } from 'react';
import type { PersonalRecords } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { buildWeeklyVolumeSeries, summariseVolumeTrend } from '../../engine/volumeMetrics';
import { Modal } from '../shell/Modal';
import { Sparkline } from './Sparkline';

/** Movimiento exacto que representa cada PR raíz para el tonelaje — mismo criterio de "sin mezclar variantes" que `MovementProgressModal`. */
const ROOT_MOVEMENT_ID: Record<keyof PersonalRecords, string> = {
  backSquat: 'back-squat',
  frontSquat: 'front-squat',
  benchPress: 'bench-press',
  deadlift: 'deadlift',
  strictPress: 'strict-press',
  clean: 'clean',
  snatch: 'snatch',
  cleanAndJerk: 'clean-and-jerk',
};

const ROOT_LABEL: Record<keyof PersonalRecords, string> = {
  backSquat: 'Back Squat',
  frontSquat: 'Front Squat',
  benchPress: 'Bench Press',
  deadlift: 'Deadlift',
  strictPress: 'Strict Press',
  clean: 'Clean',
  snatch: 'Snatch',
  cleanAndJerk: 'C&J',
};

interface VolumeSummaryModalProps {
  onClose: () => void;
}

interface Row {
  key: keyof PersonalRecords;
  label: string;
  values: number[];
  thisWeekKg: number;
  deltaPct: number | null;
}

/**
 * Tonelaje semanal (Σ kg × reps, `workLog`) de los 8 levantamientos raíz — ocupa el hueco del botón
 * de "próxima semana" en el Dashboard: ver la sesión de dentro de 7 días aportaba poco a un atleta
 * que va semana a semana, mientras que saber si el volumen de cada lift sube, baja o se estanca es
 * justo la pregunta que antes no tenía respuesta en la app. Solo lista lifts con tonelaje registrado.
 */
export function VolumeSummaryModal({ onClose }: VolumeSummaryModalProps) {
  const [workLog] = useState(() => athleteRepository.getWorkLog());

  const rows: Row[] = (Object.keys(ROOT_MOVEMENT_ID) as (keyof PersonalRecords)[])
    .map((key) => {
      const series = buildWeeklyVolumeSeries(workLog, ROOT_MOVEMENT_ID[key]);
      const trend = summariseVolumeTrend(series);
      return { key, label: ROOT_LABEL[key], values: series.map((p) => p.tonnageKg), thisWeekKg: trend.thisWeekKg, deltaPct: trend.deltaPct };
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
            <div key={row.key} className="border-l-2 border-white/10 py-1.5 pl-3">
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
