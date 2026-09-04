import { useEffect, useRef, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { buildDailyVolume } from '../../engine/volumeMetrics';
import { toLocalIsoDate, getWeekdayIndex } from '../../engine/periodization';
import { Modal } from '../shell/Modal';

interface VolumeSummaryModalProps {
  onClose: () => void;
}

const DAYS_SHOWN = 14;
/** Inicial de cada día — lunes = 0, mismo orden que `getWeekdayIndex`. */
const WEEKDAY_LETTER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** "1.2k" a partir de 1000, si no el entero — para que la etiqueta nunca desborde una columna estrecha. */
function fmtKg(kg: number): string {
  if (kg <= 0) return '—';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return String(kg);
}

/**
 * Tonelaje total (Σ kg × reps, todos los movimientos) por día — últimos 14 días, columnas de ancho
 * fijo dentro de una franja con scroll horizontal propio, así nunca desborda el modal por muy grande
 * que sea un número (el fallo que había con columnas `flex-1`: sin `min-width`, un texto ancho
 * empujaba la fila entera fuera de la tarjeta en pantallas estrechas). Se abre centrado en hoy.
 * Ocupa el hueco del botón de "próxima semana" en el Dashboard.
 */
export function VolumeSummaryModal({ onClose }: VolumeSummaryModalProps) {
  const [workLog] = useState(() => athleteRepository.getWorkLog());
  const days = buildDailyVolume(workLog, DAYS_SHOWN);
  const totalKg = days.reduce((sum, d) => sum + d.tonnageKg, 0);
  const maxKg = Math.max(...days.map((d) => d.tonnageKg), 1);
  const todayIso = toLocalIsoDate(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth });
  }, []);

  return (
    <Modal open onClose={onClose} title="Volumen por día">
      {totalKg === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          Aún no hay series registradas en el modo entreno en los últimos 14 días — el tonelaje de cada día aparecerá aquí en
          cuanto marques alguna.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Total últimos 14 días <span className="font-bold text-white">{totalKg.toLocaleString('es')} kg</span>
          </p>
          <div ref={scrollRef} className="overflow-x-auto">
            <div className="flex items-end gap-1">
              {days.map((d) => {
                const pct = Math.max(4, Math.round((d.tonnageKg / maxKg) * 100));
                const isToday = d.date === todayIso;
                const dayNum = Number(d.date.slice(8, 10));
                const weekday = WEEKDAY_LETTER[getWeekdayIndex(new Date(`${d.date}T00:00:00`))];
                return (
                  <div key={d.date} className="flex w-10 shrink-0 flex-col items-center gap-1.5">
                    <span className="whitespace-nowrap text-[10px] font-semibold text-white">{fmtKg(d.tonnageKg)}</span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className={`w-full rounded-t-md ${isToday ? 'bg-brand-neon' : 'bg-brand-gold/70'}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span
                      className={`whitespace-nowrap text-[10px] uppercase tracking-wide ${isToday ? 'font-bold text-brand-neon' : 'text-neutral-500'}`}
                    >
                      {weekday} {dayNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
