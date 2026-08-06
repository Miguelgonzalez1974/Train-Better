import { Activity } from 'lucide-react';
import { ACWR_ZONE_LABEL, type AcwrResult } from '../../engine/loadMetrics';

const SCALE_MAX = 2;

const ZONE_TEXT_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'text-sky-400',
  optima: 'text-emerald-400',
  moderada: 'text-brand-orange',
  alta: 'text-red-400',
};

export function AcwrGauge({ result }: { result: AcwrResult }) {
  const markerPercent = Math.min(100, Math.max(0, (Math.min(result.acwr ?? 0, SCALE_MAX) / SCALE_MAX) * 100));

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange">
            <Activity size={18} strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Carga aguda:crónica (ACWR)</p>
            {result.acwr !== null ? (
              <p className="text-2xl font-bold text-white">
                {result.acwr.toFixed(2)} <span className={`text-sm font-semibold ${ZONE_TEXT_CLASS[result.zone]}`}>{ACWR_ZONE_LABEL[result.zone]}</span>
              </p>
            ) : (
              <p className="text-sm text-neutral-500">Necesitas más sesiones registradas para calcularlo.</p>
            )}
            {result.coldStart && (
              <p className="mt-1 text-xs text-neutral-500">
                Aplicando carga conservadora mientras se genera tu historial reciente.
              </p>
            )}
          </div>
        </div>
      </div>

      {result.acwr !== null && (
        <div className="mt-4">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full">
            <div className="absolute inset-y-0 left-0 flex h-full w-full">
              <div className="h-full bg-sky-500/70" style={{ width: '40%' }} />
              <div className="h-full bg-emerald-500/70" style={{ width: '25%' }} />
              <div className="h-full bg-brand-orange/70" style={{ width: '10%' }} />
              <div className="h-full bg-red-500/70" style={{ width: '25%' }} />
            </div>
            <div
              className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white shadow"
              style={{ left: `calc(${markerPercent}% - 2px)` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Carga aguda (7 días): {result.acute.toFixed(0)} · Carga crónica (media semanal 28 días): {result.chronic.toFixed(0)}
          </p>
        </div>
      )}
    </section>
  );
}
