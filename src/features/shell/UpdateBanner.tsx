import { useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { appUpdate } from '../../lib/appUpdate';

/** La franja de «hay una versión nueva»: arriba del todo, sin tapar nada. Al tocar «Actualizar» la app se recarga con la versión nueva. */
export function UpdateBanner() {
  const available = useSyncExternalStore(appUpdate.subscribe, appUpdate.available, appUpdate.available);
  if (!available) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-good/30 bg-good/10 px-3 py-2" role="status" data-testid="update-banner">
      <RefreshCw size={16} strokeWidth={2.5} className="shrink-0 text-good" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-white">Hay una versión nueva</span>
      <button onClick={() => appUpdate.apply()} className="shrink-0 text-sm font-semibold text-good transition-colors hover:underline">
        Actualizar
      </button>
    </div>
  );
}
