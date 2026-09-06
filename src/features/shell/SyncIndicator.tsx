import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { onSyncStatus, type SyncStatus } from '../../data/athlete/remoteSync';

/**
 * Punto discreto de estado de sincronizacion — solo visible cuando hay algo que mirar (subiendo o
 * error). En reposo no muestra nada para no meter ruido.
 */
export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  useEffect(() => onSyncStatus(setStatus), []);

  if (status === 'idle') return null;

  const isError = status === 'error';
  return (
    <div
      className={`fixed right-3 top-3 z-40 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur ${
        isError ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/40' : 'bg-brand-surface/90 text-neutral-400'
      }`}
      title={isError ? 'No se pudo sincronizar — se reintenta en el próximo cambio' : 'Sincronizando…'}
    >
      {isError ? (
        <CloudOff size={12} strokeWidth={2.5} />
      ) : (
        <RefreshCw size={12} strokeWidth={2.5} className="animate-spin" />
      )}
      <span>{isError ? 'Sin sincronizar' : 'Sincronizando'}</span>
    </div>
  );
}
