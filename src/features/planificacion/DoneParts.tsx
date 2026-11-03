import { useState } from 'react';
import { Check } from 'lucide-react';
import { describeSkipped, SKIP_REASONS, SKIP_REASON_LABEL, skippedParts, type SessionPart, type Skips } from '../../engine/sessionParts';
import type { SkipReason } from '../../data/athlete/types';

/**
 * "Qué has hecho": una fila por parte de la sesión, todas como hechas. Sin tocar nada no cuesta ni un toque (una línea que dice
 * "Todo"); si algo no se hizo se marca "No" y, si se quiere, el motivo. Lo no hecho se quita de lo que se anota en el historial y
 * el Resumen lo cuenta ("Sin el WOD, por la molestia").
 */
export function DoneParts({ parts, skips, onChange }: { parts: SessionPart[]; skips: Skips; onChange: (next: Skips) => void }) {
  const [open, setOpen] = useState(false);
  if (parts.length === 0) return null;
  const skippedCount = Object.keys(skips).length;
  const summary = describeSkipped(skippedParts(skips));

  function setDone(key: SessionPart['key'], done: boolean) {
    const next = { ...skips };
    if (done) delete next[key];
    else next[key] = {};
    onChange(next);
  }
  function setReason(key: SessionPart['key'], reason: SkipReason) {
    onChange({ ...skips, [key]: skips[key]?.reason === reason ? {} : { reason } });
  }

  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Qué has hecho</p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${skippedCount === 0 ? 'text-neutral-200' : 'text-warn'}`}>
            {skippedCount === 0 ? (
              <>
                <Check size={14} strokeWidth={3} className="text-good" aria-hidden="true" /> Todo
              </>
            ) : (
              summary?.replace(/\.$/, '')
            )}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-brand-gold hover:text-white"
        >
          {open ? 'Cerrar' : 'Cambiar'}
        </button>
      </div>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {parts.map((p) => {
            const skipped = Boolean(skips[p.key]);
            return (
              <li key={p.key} className={`rounded-xl px-3 py-2.5 ${skipped ? 'bg-warn/[0.08] ring-1 ring-warn/30' : 'bg-white/[0.04]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium text-neutral-100">
                    {p.label}
                    {skipped && <span className="block text-[11px] font-normal text-neutral-400">¿Por qué no?</span>}
                  </span>
                  <div className="flex shrink-0 rounded-lg bg-white/5 p-0.5" role="radiogroup" aria-label={`${p.label}: hecho o no`}>
                    <button
                      role="radio"
                      aria-checked={!skipped}
                      onClick={() => setDone(p.key, true)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!skipped ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
                    >
                      Hecho
                    </button>
                    <button
                      role="radio"
                      aria-checked={skipped}
                      onClick={() => setDone(p.key, false)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${skipped ? 'bg-warn/20 text-warn' : 'text-neutral-500 hover:text-neutral-200'}`}
                    >
                      No
                    </button>
                  </div>
                </div>
                {skipped && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SKIP_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setReason(p.key, r)}
                        aria-pressed={skips[p.key]?.reason === r}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          skips[p.key]?.reason === r ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                        }`}
                      >
                        {SKIP_REASON_LABEL[r]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
