import { useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { buildWeekDailyVolume } from '../../engine/volumeMetrics';
import { toLocalIsoDate } from '../../engine/periodization';
import { Modal } from '../shell/Modal';

interface VolumeSummaryModalProps {
  onClose: () => void;
}

/** Lunes a domingo, mismo orden que `buildWeekDailyVolume`. */
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Tonelaje total (Σ kg × reps, todos los movimientos) por día de la semana en curso — 7 columnas,
 * lunes a domingo. Ocupa el hueco del botón de "próxima semana" en el Dashboard: importa más ver
 * cómo se reparte la carga entre los días de esta semana que la sesión de dentro de 7 días. Antes
 * agrupaba por levantamiento con 8 semanas de histórico por fila, que en móvil quedaba apretado —
 * esto es más simple de leer y más compacto.
 */
export function VolumeSummaryModal({ onClose }: VolumeSummaryModalProps) {
  const [workLog] = useState(() => athleteRepository.getWorkLog());
  const days = buildWeekDailyVolume(workLog);
  const totalKg = days.reduce((sum, d) => sum + d.tonnageKg, 0);
  const maxKg = Math.max(...days.map((d) => d.tonnageKg), 1);
  const todayIso = toLocalIsoDate(new Date());

  return (
    <Modal open onClose={onClose} title="Volumen esta semana">
      {totalKg === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          Aún no hay series registradas en el modo entreno esta semana — el tonelaje de cada día aparecerá aquí en cuanto marques
          alguna.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Total <span className="font-bold text-white">{totalKg.toLocaleString('es')} kg</span>
          </p>
          <div className="flex items-end gap-1.5">
            {days.map((d, i) => {
              const pct = Math.max(4, Math.round((d.tonnageKg / maxKg) * 100));
              const isToday = d.date === todayIso;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-white">{d.tonnageKg > 0 ? d.tonnageKg.toLocaleString('es') : '—'}</span>
                  <div className="flex h-28 w-full items-end">
                    <div
                      className={`w-full rounded-t-md ${isToday ? 'bg-brand-neon' : 'bg-brand-gold/70'}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] uppercase tracking-wide ${isToday ? 'font-bold text-brand-neon' : 'text-neutral-500'}`}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
