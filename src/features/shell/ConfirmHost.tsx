import { useEffect, useSyncExternalStore } from 'react';
import { confirmStore } from '../../lib/confirmSheet';

/**
 * La hoja de confirmación (ver `lib/confirmSheet.ts`): sube desde abajo, con el verbo de la acción en el botón y «Cancelar» a la izquierda
 * como salida segura. Se cierra también al tocar fuera o con Escape.
 */
export function ConfirmHost() {
  const pending = useSyncExternalStore(confirmStore.subscribe, confirmStore.current, confirmStore.current);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pending.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;
  return (
    <div data-blocking className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <button aria-label="Cancelar" onClick={() => pending.resolve(false)} className="absolute inset-0 cursor-default" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card relative w-full max-w-md rounded-b-none px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:rounded-b-xl sm:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15 sm:hidden" aria-hidden="true" />
        <p id="confirm-title" className="text-base font-semibold text-white">
          {pending.title}
        </p>
        {pending.body && <p className="mt-1 text-sm leading-relaxed text-neutral-400">{pending.body}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => pending.resolve(false)}
            autoFocus
            className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:bg-white/[0.06]"
          >
            {pending.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            onClick={() => pending.resolve(true)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ${
              pending.danger ? 'bg-bad/20 text-bad hover:bg-bad/30' : 'bg-brand-orange text-black hover:bg-brand-orange-dark'
            }`}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
