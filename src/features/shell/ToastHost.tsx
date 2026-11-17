import { useSyncExternalStore } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { toast, type ToastTone } from '../../lib/toast';

const TONE_ICON: Record<ToastTone, { Icon: typeof Check; className: string }> = {
  ok: { Icon: Check, className: 'text-good' },
  info: { Icon: Info, className: 'text-info' },
  warn: { Icon: AlertTriangle, className: 'text-warn' },
};

/**
 * Los avisos cortos tras una acción (ver `lib/toast.ts`). Salen arriba y centrados: abajo tapan el menú y el globo de Rex. Un aviso con
 * acción («Deshacer») la lleva a la derecha; se cierra solo y también con la equis.
 */
export function ToastHost() {
  const toasts = useSyncExternalStore(toast.subscribe, toast.list, toast.list);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { Icon, className } = TONE_ICON[t.tone];
        return (
          <div key={t.id} className="card pointer-events-auto flex w-full max-w-md items-center gap-2.5 px-3 py-2.5 shadow-lg animate-section-in motion-reduce:animate-none" data-testid="toast">
            <Icon size={16} strokeWidth={2.5} className={`shrink-0 ${className}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm text-white">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  toast.dismiss(t.id);
                }}
                className="shrink-0 text-sm font-semibold text-brand-orange transition-colors hover:text-brand-gold"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => toast.dismiss(t.id)} aria-label="Cerrar aviso" className="shrink-0 text-neutral-500 transition-colors hover:text-white">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
