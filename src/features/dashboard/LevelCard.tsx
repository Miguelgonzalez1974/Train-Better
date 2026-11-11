import { useMemo, useState } from 'react';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { computeAthleteDiagnosis, type Confidence, type DiagnosisArea } from '../../engine/athleteDiagnosis';
import { ProfileRadar } from '../objetivos/ProfileRadar';
import { levelHighlights, MIN_SCORED_AREAS, scoredAreas } from './levelSummary';

const CONFIDENCE_LABEL: Record<Confidence, string> = { fiable: 'Fiable', provisional: 'Lectura provisional', 'sin-datos': 'Sin datos' };

/** El radar en miniatura para la insignia de la fila: el pentágono, el aro de lo esperable y tu polígono (si hay datos de tres áreas). */
function MiniRadar({ areas }: { areas: DiagnosisArea[] }) {
  const n = areas.length;
  const c = 22;
  const r = 17;
  const pt = (i: number, frac: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(c + r * frac * Math.cos(a)).toFixed(1)},${(c + r * frac * Math.sin(a)).toFixed(1)}`;
  };
  const ring = (frac: number) => areas.map((_, i) => pt(i, frac)).join(' ');
  const scored = areas.map((a, i) => (a.score === null ? null : pt(i, a.score / 100))).filter((p): p is string => p !== null);
  return (
    <svg viewBox="0 0 44 44" width="34" height="34" aria-hidden="true">
      <polygon points={ring(1)} fill="none" stroke="rgb(var(--c-white) / 0.18)" strokeWidth={1} />
      <polygon points={ring(0.55)} fill="none" stroke="rgb(var(--c-white) / 0.3)" strokeWidth={0.8} strokeDasharray="2 2" />
      {scored.length >= 3 && <polygon points={scored.join(' ')} fill="rgb(var(--c-state-cool) / 0.3)" stroke="rgb(var(--c-state-cool))" strokeWidth={1.4} strokeLinejoin="round" />}
    </svg>
  );
}

/**
 * «Tu nivel»: una fila de «Tu día» (mismo diseño que la sesión y Tu forma) que se abre hacia abajo con el radar de tu perfil de atleta, para ver de
 * un vistazo dónde vas mejor y dónde peor. Cerrada, dice lo más sólido y lo que hay que mejorar. Es el mismo diagnóstico de Análisis → Perfil
 * (al que lleva «Ver el perfil completo»). No sale hasta que hay datos de tres áreas.
 */
export function LevelCard({ profile, history, onOpen }: { profile: AthleteProfile; history: SessionHistoryEntry[]; onOpen: () => void }) {
  const diagnosis = useMemo(() => computeAthleteDiagnosis({ profile, history }), [profile, history]);
  const { best, worst } = useMemo(() => levelHighlights(diagnosis.areas), [diagnosis]);
  const [open, setOpen] = useState(false);
  if (scoredAreas(diagnosis.areas).length < MIN_SCORED_AREAS) return null;

  const title = best ? `Tu nivel · ${best.title} es lo más sólido` : 'Tu nivel';
  const sub = worst ? `A mejorar: ${worst.title}${worst.detail ? ` · ${worst.detail}` : ''}` : 'Tu perfil de atleta';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 text-left transition-colors duration-200 hover:bg-white/[0.07]"
      >
        <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
          <MiniRadar areas={diagnosis.areas} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">{sub}</span>
        </span>
        <ChevronDown size={16} className={`mr-1 shrink-0 text-neutral-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="flex animate-section-in flex-col gap-2 rounded-2xl bg-white/[0.04] px-3.5 pb-3.5 pt-3 motion-reduce:animate-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-400">Tu perfil de atleta</span>
            <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-neutral-400">{CONFIDENCE_LABEL[diagnosis.confidence]}</span>
          </div>
          <ProfileRadar areas={diagnosis.areas} trends />
          <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-info bg-info/30" aria-hidden="true" />
              Tu nivel
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 border-t border-dashed border-white/50" aria-hidden="true" />
              Lo esperable
            </span>
          </div>
          {best && worst && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  <TrendingUp size={12} className="text-good" aria-hidden="true" />
                  Va mejor
                </p>
                <p className="mt-0.5 text-sm font-semibold text-good">{best.title}</p>
                {best.detail && <p className="text-[11px] leading-snug text-neutral-500">{best.detail}</p>}
              </div>
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  <TrendingDown size={12} className="text-warn" aria-hidden="true" />
                  Va peor
                </p>
                <p className="mt-0.5 text-sm font-semibold text-warn">{worst.title}</p>
                {worst.detail && <p className="text-[11px] leading-snug text-neutral-500">{worst.detail}</p>}
              </div>
            </div>
          )}
          <button type="button" onClick={onOpen} className="self-end text-xs font-semibold text-neutral-400 underline decoration-dotted transition-colors hover:text-white">
            Ver el perfil completo →
          </button>
        </div>
      )}
    </div>
  );
}
