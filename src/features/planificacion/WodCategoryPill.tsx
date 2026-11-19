import { useMemo, useState } from 'react';
import { Activity, Dumbbell, Feather, Hourglass, PersonStanding, Zap, type LucideIcon } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { SessionBlockResult } from '../../data/athlete/types';
import { classifyWodBlocks, WOD_CATEGORY_LABEL, type WodCategory } from '../../engine/wodCategory';
import { Modal } from '../shell/Modal';

const ICON: Record<WodCategory, LucideIcon> = {
  velocidad: Zap,
  resistencia: Activity,
  'peso-corporal': PersonStanding,
  pesado: Dumbbell,
  ligero: Feather,
  largo: Hourglass,
};

/** Lo que significa cada categoría, para el «Por qué» (corto: una línea). */
const MEANING: Record<WodCategory, string> = {
  velocidad: 'WODs cortos y rápidos (hasta unos 5 minutos).',
  resistencia: 'WODs de cardio sostenido: remo, bici, correr.',
  'peso-corporal': 'WODs que solo usan tu peso corporal.',
  pesado: 'WODs con barra pesada para ti (desde la mitad de tu 1RM).',
  ligero: 'WODs con carga ligera: implementos o barra por debajo de la mitad de tu 1RM.',
  largo: 'WODs de mucha duración (desde unos 20 minutos).',
};

/**
 * La pastilla de «Tu nivel» sobre el WOD: la categoría a la que cuenta (Pesado, Largo…), o «Sin categoría» si no encaja con claridad. Al
 * tocarla dice por qué. En un día de recuperación (o sin WOD) no sale nada. Solo informa: lo que cuenta lo decide `engine/wodCategory.ts`.
 */
export function WodCategoryPill({ entries, part }: { entries: SessionBlockResult[]; part?: 1 | 2 | null }) {
  const [open, setOpen] = useState(false);
  const verdict = useMemo(() => classifyWodBlocks(entries, { prs: athleteRepository.getProfile().prs }, part ?? 1), [entries, part]);
  if (verdict.silent) return null;
  const { category } = verdict;
  const Icon = category ? ICON[category] : null;
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          data-testid="wod-category-pill"
          data-category={category ?? 'none'}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${category ? 'bg-brand-orange/15 text-brand-orange' : 'bg-white/5 text-neutral-400'}`}
        >
          {Icon && <Icon size={13} strokeWidth={2.25} aria-hidden="true" />}
          {category ? WOD_CATEGORY_LABEL[category] : 'Sin categoría'}
        </span>
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-neutral-400 transition-colors hover:text-white">
          Por qué
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={category ? `Cuenta para ${WOD_CATEGORY_LABEL[category]}` : 'No cuenta para tu nivel'}>
        <p className="text-sm leading-relaxed text-neutral-200">{verdict.reason}</p>
        {category && <p className="mt-3 text-xs leading-relaxed text-neutral-400">{WOD_CATEGORY_LABEL[category]}: {MEANING[category]} Cada WOD cuenta para una sola categoría.</p>}
        {!category && <p className="mt-3 text-xs leading-relaxed text-neutral-400">Solo cuentan para tu nivel los WODs que encajan con claridad en una categoría; así la nota de cada una significa algo.</p>}
      </Modal>
    </>
  );
}
