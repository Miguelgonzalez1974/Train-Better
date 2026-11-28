import { useSyncExternalStore } from 'react';
import { Heart } from 'lucide-react';
import { HR_GAP_MS, hrSummary } from '../../engine/heartRate';
import { heartRate } from '../../lib/heartRateMonitor';
import { PartGuard } from '../shell/PartGuard';

/** El estado de la pulsera, actualizado en directo. */
export const useHeartRate = () => useSyncExternalStore(heartRate.subscribe, heartRate.snapshot, heartRate.snapshot);

/** La señal se ha parado: hace más de unos segundos de la última medición. */
const isStale = (now: number, lastAt: number | null) => lastAt !== null && now - lastAt >= HR_GAP_MS;

/** La cifra del pulso para la cinta y la pantalla completa; null si no está conectada. */
function useLiveBpm(): string | null {
  const { status, bpm, now, session } = useHeartRate();
  if (status !== 'connected' && status !== 'reconnecting') return null;
  return bpm === null || status === 'reconnecting' || isStale(now, session.lastAt) ? '—' : String(bpm);
}

/** El pulso en la cinta fina del reloj. */
export function StripBpm() {
  const bpm = useLiveBpm();
  if (bpm === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-xs font-bold tabular-nums" aria-label={`Pulso: ${bpm}`} data-testid="hr-strip">
      <Heart size={11} strokeWidth={3} aria-hidden="true" />
      {bpm}
    </span>
  );
}

/** El pulso a pantalla completa, grande para leerlo de lejos. */
export function ClockBpm() {
  const bpm = useLiveBpm();
  if (bpm === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-2 text-4xl font-black tabular-nums text-white" aria-label={`Pulso: ${bpm}`} data-testid="hr-fullscreen">
      <Heart size={28} strokeWidth={3} className="text-brand-orange" aria-hidden="true" />
      {bpm}
    </span>
  );
}

const BUTTON = 'shrink-0 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-semibold text-neutral-200 hover:bg-white/15';

function Panel() {
  const { status, bpm, session, now, hidden } = useHeartRate();
  if (!heartRate.supported()) return null;
  const summary = hrSummary(session, now, hidden);

  if (status === 'connected' || status === 'reconnecting') {
    const stale = status === 'reconnecting' || isStale(now, session.lastAt);
    const note =
      status === 'reconnecting'
        ? 'Se ha cortado · reconectando…'
        : session.lastAt === null
          ? 'Esperando pulso…'
          : stale
            ? `Sin señal hace ${Math.round((now - session.lastAt) / 1000)} s`
            : null;
    return (
      <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2" data-testid="hr-panel">
        <Heart size={18} strokeWidth={2.5} className={`shrink-0 ${stale || bpm === null ? 'text-neutral-500' : 'text-brand-orange'}`} aria-hidden="true" />
        <span className={`w-11 shrink-0 text-2xl font-bold tabular-nums leading-none ${stale || bpm === null ? 'text-neutral-500' : 'text-white'}`} data-testid="hr-bpm">
          {bpm === null || stale ? '—' : bpm}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-neutral-400" data-testid="hr-notes">
          {note && <span className="block font-semibold text-neutral-200">{note}</span>}
          {summary.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </span>
        <button type="button" onClick={() => heartRate.disconnect()} className={BUTTON}>
          Parar
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg bg-white/5 px-3 py-2" data-testid="hr-panel">
      <div className="flex items-center gap-2.5">
        <Heart size={18} strokeWidth={2.5} className="shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-xs font-semibold text-neutral-300">Pulso en directo (prueba)</span>
        <button type="button" onClick={() => void heartRate.connect()} disabled={status === 'connecting'} className={`${BUTTON} disabled:opacity-50`}>
          {status === 'connecting' ? 'Conectando…' : 'Conectar pulsera'}
        </button>
      </div>
      {status === 'error' && (
        <p className="mt-1.5 text-[11px] leading-snug text-warn" role="alert">
          No se ha podido conectar. Comprueba que el Bluetooth está encendido y que la pulsera está emitiendo el pulso, y vuelve a probar.
        </p>
      )}
      {summary.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-400" data-testid="hr-last">
          Última prueba: {summary.join(' · ')}
        </p>
      )}
    </div>
  );
}

/** La fila del reloj para conectar la pulsera y ver el pulso. Si algo fallara, el reloj sigue entero. */
export function HeartRatePanel() {
  return (
    <PartGuard name="el pulso en directo" fallback={null}>
      <Panel />
    </PartGuard>
  );
}
