import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { computeLevel, levelSeries, recentOfCategory, type CategoryLevel, type LevelKey } from '../../engine/levelCategories';
import { CategoryRadar, MiniCategoryRadar } from './CategoryRadar';
import { CategoryRecent } from './CategoryRecent';

const deltaText = (d: number) => `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)}`;
const deltaClass = (d: number) => (d > 0 ? 'text-good' : d < 0 ? 'text-warn' : 'text-neutral-500');

/** La fila de una categoría: su nombre con lo que hay detrás, la puntuación con su cambio y una barra. Al tocarla se abren sus 3 últimos entrenos y su evolución. */
function CategoryRow({ c, expanded, onToggle, children }: { c: CategoryLevel; expanded: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const empty = c.score === null;
  return (
    <div className="bg-white/[0.03]" data-testid="level-category" data-key={c.key}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold ${empty ? 'text-neutral-500' : 'text-white'}`}>{c.label}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            {c.confidence === 'provisional' && <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">provisional</span>}
            {!empty && <span className="num text-sm font-bold text-white">{c.score}</span>}
            {c.delta !== null && <span className={`num text-[11px] font-semibold ${deltaClass(c.delta)}`}>{deltaText(c.delta)}</span>}
            <ChevronDown size={13} className={`self-center text-neutral-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/10" aria-hidden="true">
          <div className={`h-1 rounded-full bg-brand-orange ${c.confidence === 'provisional' ? 'opacity-55' : ''}`} style={{ width: `${c.score ?? 0}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">{c.need && c.confidence !== 'sin-datos' ? `${c.detail}. ${c.need}` : empty ? c.need : c.detail}</p>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * «Tu nivel»: una fila de «Tu día» que se abre con el radar de las 8 categorías de BTWB (Power lifts, Olímpicos, Velocidad, Resistencia, Peso corporal, Pesado, Ligero y
 * Largo), medidas contra TUS marcas, con un número único y su cambio en 3 meses. Las categorías se van rellenando con tus marcas de barra y tus WODs en Rx. La constancia va
 * aparte: no cuenta. El detalle completo del perfil sigue en «Ver el perfil completo». Ver `engine/levelCategories.ts`.
 */
export function LevelCard({ profile, history, onOpen }: { profile: AthleteProfile; history: SessionHistoryEntry[]; onOpen: () => void }) {
  const level = useMemo(() => computeLevel({ profile, history }), [profile, history]);
  const [open, setOpen] = useState(false);
  const [openKey, setOpenKey] = useState<LevelKey | null>(null);
  // La evolución mes a mes solo se calcula con el panel abierto; los últimos entrenos, de la categoría abierta.
  const series = useMemo(() => (open ? levelSeries({ profile, history }) : null), [open, profile, history]);
  const recent = useMemo(() => (openKey ? recentOfCategory({ profile, history, key: openKey }) : []), [openKey, profile, history]);
  if (level.filled === 0) return null;

  const title = level.overall !== null ? `Tu nivel · ${level.overall}` : `Tu nivel · ${level.filled} de ${level.categories.length} categorías`;
  const sub =
    level.delta !== null
      ? `${level.delta > 0 ? '+' : level.delta < 0 ? '−' : ''}${Math.abs(level.delta)} en 3 meses`
      : level.overall !== null
        ? 'Con tus propias marcas'
        : 'Se va rellenando con tus marcas y tus WODs';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="day-card flex w-full items-center gap-3 px-[13px] py-3 text-left transition-colors duration-200"
      >
        <span className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
          <MiniCategoryRadar categories={level.categories} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-white">{title}</span>
          <span className={`mt-0.5 block truncate text-[11.5px] ${level.delta !== null && level.delta > 0 ? 'text-good' : 'text-neutral-500'}`}>{sub}</span>
        </span>
        <ChevronDown size={16} className={`mr-1 shrink-0 text-neutral-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="day-card flex animate-section-in flex-col gap-3 px-3.5 pb-3.5 pt-3 motion-reduce:animate-none">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-400">Tu nivel</span>
            <span className="text-[11px] text-neutral-500">100 = tu mejor marca de cada categoría</span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="num text-[44px] font-semibold leading-none text-white">{level.overall ?? '—'}</span>
            {level.delta !== null && <span className={`text-sm font-semibold ${deltaClass(level.delta)}`}>{level.delta > 0 ? '+' : level.delta < 0 ? '−' : ''}{Math.abs(level.delta)} en 3 meses</span>}
          </div>
          {level.overall === null && <p className="text-xs text-neutral-400">Hacen falta al menos 3 categorías con datos para dar un número.</p>}

          <CategoryRadar categories={level.categories} />
          <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-brand-orange" aria-hidden="true" />
              Hoy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-white/50" aria-hidden="true" />
              Hace 3 meses
            </span>
          </div>

          <div className="flex flex-col gap-px overflow-hidden rounded-xl bg-white/[0.08]" data-testid="level-categories">
            {level.categories.map((c) => (
              <CategoryRow key={c.key} c={c} expanded={openKey === c.key} onToggle={() => setOpenKey(openKey === c.key ? null : c.key)}>
                <CategoryRecent items={recent} series={series?.[c.key] ?? []} need={null} />
              </CategoryRow>
            ))}
          </div>

          {level.consistencyPct !== null && (
            <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs text-neutral-400">
              <span className="num text-lg font-semibold text-neutral-300">{level.consistencyPct} %</span>
              Constancia: tus días de entreno de las últimas 8 semanas. Es un hábito, no cuenta en tu nivel.
            </p>
          )}
          <button type="button" onClick={onOpen} className="self-end text-xs font-semibold text-neutral-400 underline decoration-dotted transition-colors hover:text-white">
            Ver el perfil completo →
          </button>
        </div>
      )}
    </div>
  );
}
