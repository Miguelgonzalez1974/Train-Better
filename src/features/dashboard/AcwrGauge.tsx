import { Activity } from 'lucide-react';
import { ACWR_ZONE_LABEL, type AcwrResult } from '../../engine/loadMetrics';

const SCALE_MAX = 2;
/** Mismos umbrales que classifyAcwr en loadMetrics.ts, expresados como marcas de referencia en la barra. */
const SCALE_TICKS = [0, 0.8, 1.3, 1.5, 2];

const ZONE_TEXT_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'text-sky-400',
  optima: 'text-emerald-400',
  moderada: 'text-brand-orange',
  alta: 'text-red-400',
};

/** Halo alrededor del marcador y fondo de la etiqueta flotante, a juego con la zona actual. */
const ZONE_MARKER_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'shadow-[0_0_0_5px_rgba(56,189,248,0.35),0_0_12px_2px_rgba(56,189,248,0.5)]',
  optima: 'shadow-[0_0_0_5px_rgba(52,211,153,0.35),0_0_12px_2px_rgba(52,211,153,0.5)]',
  moderada: 'shadow-[0_0_0_5px_rgba(249,115,22,0.35),0_0_12px_2px_rgba(249,115,22,0.5)]',
  alta: 'shadow-[0_0_0_5px_rgba(239,68,68,0.35),0_0_12px_2px_rgba(239,68,68,0.5)]',
};

const ZONE_LABEL_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'bg-sky-400 text-sky-950',
  optima: 'bg-emerald-400 text-emerald-950',
  moderada: 'bg-brand-orange text-black',
  alta: 'bg-red-400 text-red-950',
};

/** Icono de cabecera a juego con la zona actual — categoria "riesgo/fatiga", la unica tarjeta cuyo estado real cambia de significado (verde no es igual de bueno que rojo), asi que el acento fijo naranja de las demas no le pega. */
const ZONE_ICON_CLASS: Record<AcwrResult['zone'], string> = {
  baja: 'bg-sky-400/15 text-sky-400',
  optima: 'bg-emerald-400/15 text-emerald-400',
  moderada: 'bg-brand-orange/15 text-brand-orange',
  alta: 'bg-red-400/15 text-red-400',
};

export function AcwrGauge({ result }: { result: AcwrResult }) {
  const markerPercent = Math.min(100, Math.max(0, (Math.min(result.acwr ?? 0, SCALE_MAX) / SCALE_MAX) * 100));
  // Sin suficientes datos todavia no hay una zona real que representar — icono neutro en vez de un color de zona que insinuaria una lectura que aun no existe.
  const iconClass = result.acwr !== null ? ZONE_ICON_CLASS[result.zone] : 'bg-white/5 text-neutral-500';

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}>
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
        <div className="mx-1 mt-8">
          <div className="relative h-4">
            <div className="absolute inset-0 flex overflow-hidden rounded-full">
              <div className="h-full bg-sky-500/55" style={{ width: '40%' }} />
              <div className="h-full bg-emerald-500/55" style={{ width: '25%' }} />
              <div className="h-full bg-brand-orange/70" style={{ width: '10%' }} />
              <div className="h-full bg-red-500/75" style={{ width: '25%' }} />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${markerPercent}%` }}>
              <div className={`h-4 w-4 -translate-x-1/2 rounded-full bg-white ${ZONE_MARKER_CLASS[result.zone]}`} />
            </div>
            <div className="absolute bottom-full mb-2" style={{ left: `${markerPercent}%` }}>
              <span
                className={`-translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${ZONE_LABEL_CLASS[result.zone]}`}
                style={{ display: 'inline-block' }}
              >
                {result.acwr.toFixed(2)}
              </span>
            </div>
            {SCALE_TICKS.map((tick) => (
              <span
                key={tick}
                className="absolute top-full mt-1.5 -translate-x-1/2 text-[10px] text-neutral-500"
                style={{ left: `${(tick / SCALE_MAX) * 100}%` }}
              >
                {tick}
              </span>
            ))}
          </div>
          <p className="mt-6 text-xs text-neutral-500">
            Carga aguda (7 días): {result.acute.toFixed(0)} · Carga crónica (media semanal 28 días): {result.chronic.toFixed(0)}
          </p>
        </div>
      )}
    </section>
  );
}
