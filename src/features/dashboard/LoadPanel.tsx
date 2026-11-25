import type { ReactNode } from 'react';
import { CalendarCheck2, ChevronRight, History } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import { Fold } from '../shell/Fold';
import { SectionLabel } from '../shell/SectionLabel';
import { AcwrGauge } from './AcwrGauge';
import { loadPercent } from './loadWords';

/**
 * El apartado «Carga» de «Tu forma», lo que has gastado: cómo va tu semana frente a lo normal (la misma cifra de la tarjeta y del aro), el esfuerzo
 * del día y la tendencia (`children`), la relación de carga en detalle plegada y la puerta al historial y a la constancia.
 */
export function LoadPanel({
  acwr,
  trend,
  onHistory,
  onConsistency,
  children,
}: {
  acwr: AcwrResult;
  trend: (number | null)[];
  onHistory: () => void;
  onConsistency: () => void;
  children: ReactNode;
}) {
  const { value, word } = loadPercent(acwr);
  const high = acwr.zone === 'moderada' || acwr.zone === 'alta';
  const link = 'flex w-full items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 text-left text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/[0.06]';
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Tu carga">
        <SectionLabel>Tus últimos 7 días</SectionLabel>
        <div className="mt-2 flex items-end gap-3">
          <p className={`num shrink-0 whitespace-nowrap text-4xl font-extrabold leading-none ${word && high ? 'text-warn' : 'text-white'}`}>{value}</p>
          <div className="pb-0.5">
            <p className="text-sm font-semibold text-white">{word ? `Carga ${word.toLowerCase()}` : 'Aún sin dato'}</p>
            <p className="text-[11px] leading-snug text-neutral-500">{word ? 'frente a tu media de 4 semanas' : 'necesita más sesiones registradas'}</p>
          </div>
        </div>
      </section>
      {children}
      <Fold title="La relación de carga en detalle" summary={acwr.acwr === null ? undefined : acwr.acwr.toFixed(2)}>
        <AcwrGauge result={acwr} trend={trend} />
      </Fold>
      <button type="button" onClick={onHistory} className={link}>
        <History size={16} className="text-neutral-400" aria-hidden="true" />
        <span className="flex-1">Historial</span>
        <ChevronRight size={16} className="text-neutral-600" aria-hidden="true" />
      </button>
      <button type="button" onClick={onConsistency} className={link}>
        <CalendarCheck2 size={16} className="text-neutral-400" aria-hidden="true" />
        <span className="flex-1">Constancia</span>
        <ChevronRight size={16} className="text-neutral-600" aria-hidden="true" />
      </button>
    </div>
  );
}
