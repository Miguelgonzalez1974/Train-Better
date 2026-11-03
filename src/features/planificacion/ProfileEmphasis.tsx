import { ArrowRight, Target } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';

type Emphasis = NonNullable<DailySession['profileEmphasis']>;

/** "1 dic" a partir de una fecha ISO. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

/**
 * Una línea en la cabecera de la sesión con lo que el diagnóstico del atleta inclina en estas semanas ("más motor largo y más
 * empuje horizontal"), cuándo se revisa y un acceso a Objetivos → Perfil, donde se cambia o se apaga.
 */
export function ProfileEmphasisLine({ emphasis, onOpen }: { emphasis: Emphasis; onOpen?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.05] px-3 py-2.5 text-[13px] leading-snug text-neutral-300 sm:max-w-xl">
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange" aria-hidden="true">
        <Target size={13} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <strong className="font-semibold text-white">{emphasis.summary}</strong> Es lo que más margen tiene en tu perfil.
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-neutral-500">
          {emphasis.reviewOn && <span>Se revisa el {shortDate(emphasis.reviewOn)}.</span>}
          {onOpen && (
            <button onClick={onOpen} className="inline-flex items-center gap-1 font-semibold text-neutral-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-white">
              Ver o cambiar en Perfil <ArrowRight size={11} aria-hidden="true" />
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

/** La etiqueta de un bloque que lleva el énfasis, con su porqué debajo. */
export function EmphasisTag({ label, why }: { label: string; why: string }) {
  return (
    <div className="-mt-1 mb-3">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange/[0.12] px-2.5 py-1 text-[11.5px] font-semibold text-brand-orange">
        <span aria-hidden="true">▲</span> {label}
      </span>
      {why && <p className="mt-1.5 text-xs leading-snug text-neutral-500">{why}</p>}
    </div>
  );
}
