import { useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { buildDailyVolume } from '../../engine/volumeMetrics';
import { toLocalIsoDate } from '../../engine/periodization';
import { Modal } from '../shell/Modal';

interface VolumeSummaryModalProps {
  onClose: () => void;
}

const DAYS_SHOWN = 14;
/**
 * Ancho de columna fijo en px — deliberadamente pequeño y sin `flex-1`: un flex item con `flex-1`
 * pero sin `min-width` no encoge por debajo del ancho de su propio contenido, así que un número o
 * texto ancho en una sola columna empujaba la fila entera fuera de la tarjeta (el bug reportado).
 * Con ancho fijo, 14 columnas + gaps (194px) caben con margen de sobra dentro del padding NORMAL de
 * la tarjeta (`.card` no recorta overflow — un truco de margen negativo para ganar ancho dejaba las
 * barras asomando por fuera de las esquinas redondeadas, que es justo lo que se veía "excedido").
 * Los números van en texto aparte, no flotando sobre cada barra, para no necesitar más ancho.
 */
const COLUMN_PX = 12;

/**
 * Tonelaje total (Σ kg × reps, todos los movimientos) por día — últimos 14 días. Sin scroll lateral:
 * columnas estrechas de ancho fijo, y los números (total / hoy / máximo) van en texto arriba, no
 * flotando sobre cada barra — así una columna nunca necesita ser más ancha que la barra en sí.
 * Ocupa el hueco del botón de "próxima semana" en el Dashboard.
 */
export function VolumeSummaryModal({ onClose }: VolumeSummaryModalProps) {
  const [workLog] = useState(() => athleteRepository.getWorkLog());
  const days = buildDailyVolume(workLog, DAYS_SHOWN);
  const totalKg = days.reduce((sum, d) => sum + d.tonnageKg, 0);
  const maxKg = Math.max(...days.map((d) => d.tonnageKg), 1);
  const todayIso = toLocalIsoDate(new Date());
  const todayKg = days[days.length - 1]?.tonnageKg ?? 0;

  return (
    <Modal open onClose={onClose} title="Volumen por día">
      {totalKg === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          Aún no hay series registradas en el modo entreno en los últimos 14 días — el tonelaje de cada día aparecerá aquí en
          cuanto marques alguna.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm text-neutral-400">
              Total 14 días <span className="font-bold text-white">{totalKg.toLocaleString('es')} kg</span>
            </p>
            {todayKg > 0 && (
              <p className="text-sm text-neutral-400">
                Hoy <span className="font-bold text-brand-neon">{todayKg.toLocaleString('es')} kg</span>
              </p>
            )}
          </div>
          <div className="flex items-end justify-center gap-0.5">
            {days.map((d) => {
              const pct = Math.max(4, Math.round((d.tonnageKg / maxKg) * 100));
              const isToday = d.date === todayIso;
              const dayNum = Number(d.date.slice(8, 10));
              return (
                <div key={d.date} className="flex shrink-0 flex-col items-center gap-1" style={{ width: COLUMN_PX }}>
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={`w-full rounded-t-sm ${isToday ? 'bg-brand-neon' : 'bg-brand-gold/70'}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[9px] ${isToday ? 'font-bold text-brand-neon' : 'text-neutral-600'}`}>{dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
