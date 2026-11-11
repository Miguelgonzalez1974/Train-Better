import { useMemo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { computeAthleteDiagnosis, type Confidence } from '../../engine/athleteDiagnosis';
import { ProfileRadar } from '../objetivos/ProfileRadar';
import { levelHighlights, MIN_SCORED_AREAS, scoredAreas } from './levelSummary';

const CONFIDENCE_LABEL: Record<Confidence, string> = { fiable: 'Fiable', provisional: 'Lectura provisional', 'sin-datos': 'Sin datos' };

/**
 * «Tu nivel»: el radar de tu perfil de atleta en el Dashboard, para ver de un vistazo dónde vas mejor y dónde peor. Es el mismo radar y el mismo
 * diagnóstico de Análisis → Perfil (que se abre al tocar la tarjeta), más pequeño y con una flecha de tendencia por área. No sale hasta que
 * hay datos de tres áreas: antes sería un dibujo vacío.
 */
export function LevelCard({ profile, history, onOpen }: { profile: AthleteProfile; history: SessionHistoryEntry[]; onOpen: () => void }) {
  const diagnosis = useMemo(() => computeAthleteDiagnosis({ profile, history }), [profile, history]);
  const { best, worst } = useMemo(() => levelHighlights(diagnosis.areas), [diagnosis]);
  if (scoredAreas(diagnosis.areas).length < MIN_SCORED_AREAS) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Tu nivel: abrir el perfil de atleta"
      className="flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 pb-3.5 pt-3 text-left transition-colors duration-200 hover:bg-white/[0.05]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">Tu nivel</span>
        <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-neutral-400">{CONFIDENCE_LABEL[diagnosis.confidence]}</span>
      </span>
      <ProfileRadar areas={diagnosis.areas} trends />
      <span className="flex items-center justify-center gap-4 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-info bg-info/30" aria-hidden="true" />
          Tu nivel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t border-dashed border-white/50" aria-hidden="true" />
          Lo esperable
        </span>
      </span>
      {best && worst && (
        <span className="grid grid-cols-2 gap-2">
          <span className="rounded-lg bg-white/[0.04] px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              <TrendingUp size={12} className="text-good" aria-hidden="true" />
              Va mejor
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-good">{best.title}</span>
            {best.detail && <span className="block text-[11px] leading-snug text-neutral-500">{best.detail}</span>}
          </span>
          <span className="rounded-lg bg-white/[0.04] px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              <TrendingDown size={12} className="text-warn" aria-hidden="true" />
              Va peor
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-warn">{worst.title}</span>
            {worst.detail && <span className="block text-[11px] leading-snug text-neutral-500">{worst.detail}</span>}
          </span>
        </span>
      )}
    </button>
  );
}
