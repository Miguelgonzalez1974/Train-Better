import type { ReactNode } from 'react';
import type { YearConsistency } from '../../engine/yearConsistency';
import { SectionLabel } from '../shell/SectionLabel';

function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <p className="num text-2xl font-semibold leading-none tracking-tight text-white">{value}</p>
      <p className="text-[11px] text-neutral-400">{label}</p>
      {sub && <p className="text-[10px] text-neutral-600">{sub}</p>}
    </div>
  );
}

/**
 * Lo que se abre al tocar "Constancia": las tres escalas (semana, mes y año) y, debajo, el calendario de entrenos.
 * El anillo lleva solo la del año; la de la semana es la que ayuda a decidir cada día.
 */
export function ConsistencyDetail({
  week,
  monthDays,
  year,
  calendar,
}: {
  week: { done: number; planned: number };
  monthDays: number;
  year: YearConsistency;
  calendar: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <SectionLabel>Constancia</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          value={
            <>
              {week.done}
              <span className="text-sm font-medium text-neutral-500">/{week.planned}</span>
            </>
          }
          label="Esta semana"
        />
        <Stat value={monthDays} label="Este mes" sub="días" />
        <Stat value={year.days} label="Este año" sub={year.pct !== null ? `${year.pct} % de los previstos` : 'días'} />
      </div>
      {calendar}
    </div>
  );
}
