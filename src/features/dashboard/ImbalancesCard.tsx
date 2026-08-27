import { useState } from 'react';
import { ChevronDown, ChevronUp, GitCompare } from 'lucide-react';
import type { ImbalanceGroup, ImbalanceStatus } from '../../engine/imbalances';

const STATUS_META: Record<ImbalanceStatus, { label: string; badgeClass: string; borderColor: string }> = {
  desbalance: { label: 'Gran desbalance', badgeClass: 'bg-red-500/15 text-red-400', borderColor: '#ef4444' },
  equilibrado: { label: 'Equilibrado', badgeClass: 'bg-emerald-500/15 text-emerald-400', borderColor: '#34d399' },
  'faltan-datos': { label: 'Faltan datos', badgeClass: 'bg-white/[0.06] text-neutral-400', borderColor: '#52525b' },
};

const MAX_BAR_HEIGHT = 64;

function GroupBars({ group }: { group: ImbalanceGroup }) {
  const values = group.bars.map((b) => b.value ?? 0);
  const max = Math.max(...values, 1);

  return (
    <div className="mb-2 flex items-end gap-3 px-1" style={{ height: MAX_BAR_HEIGHT + 28 }}>
      {group.bars.map((bar) => {
        const height = bar.value !== null ? Math.max((bar.value / max) * MAX_BAR_HEIGHT, 6) : MAX_BAR_HEIGHT * 0.35;
        const barColor = bar.flagged ? '#ef4444' : '#d4af37';
        return (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-[10px] font-semibold ${bar.flagged ? 'text-red-300' : 'text-white'}`}>
              {bar.value !== null ? bar.value : '—'}
            </span>
            {bar.value !== null ? (
              <div className="w-5 rounded-t" style={{ height, background: barColor }} />
            ) : (
              <div className="w-5 rounded-t border border-dashed border-white/15" style={{ height }} />
            )}
            <span className="text-center text-[9px] leading-tight text-neutral-500">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function GroupRow({ group }: { group: ImbalanceGroup }) {
  const meta = STATUS_META[group.status];
  const hasAnyBarData = group.bars.some((b) => b.value !== null);

  return (
    <div className="border-l-2 py-1.5 pl-3" style={{ borderColor: meta.borderColor }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-white">{group.label}</p>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}>{meta.label}</span>
      </div>
      {hasAnyBarData && <GroupBars group={group} />}
      <p className="text-[11px] leading-relaxed text-neutral-400">{group.note}</p>
      {group.missingLabels.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          Te faltan resultados de: <span className="text-neutral-400">{group.missingLabels.join(', ')}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Complementa a `WeakPointsCard`: aquella mira RPE/escalado/tendencia dentro de un mismo patron,
 * esta compara levantamientos relacionados entre si (ver `computeImbalances`). Colapsada por
 * defecto para no alargar el scroll, pero el resumen de pildoras ya es visible sin expandir —
 * un grupo equilibrado es un refuerzo positivo real para el atleta, no ruido a esconder detras de
 * un clic, asi que la card nunca devuelve null ni oculta los grupos "equilibrado" por defecto.
 */
export function ImbalancesCard({ groups }: { groups: ImbalanceGroup[] }) {
  const [collapsed, setCollapsed] = useState(true);

  const desbalanceCount = groups.filter((g) => g.status === 'desbalance').length;
  const equilibradoCount = groups.filter((g) => g.status === 'equilibrado').length;
  const faltanCount = groups.filter((g) => g.status === 'faltan-datos').length;

  return (
    <section className="card overflow-hidden p-0">
      <button onClick={() => setCollapsed((prev) => !prev)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <GitCompare size={16} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.6)]" />
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-white">Desequilibrios</span>
          {desbalanceCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">{desbalanceCount} desbalance{desbalanceCount > 1 ? 's' : ''}</span>
          )}
          {equilibradoCount > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{equilibradoCount} equilibrado{equilibradoCount > 1 ? 's' : ''}</span>
          )}
          {faltanCount > 0 && (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-neutral-400">{faltanCount} sin datos</span>
          )}
        </span>
        {collapsed ? (
          <ChevronDown size={16} className="shrink-0 text-neutral-500" />
        ) : (
          <ChevronUp size={16} className="shrink-0 text-neutral-500" />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-3 border-t border-white/5 px-3.5 pb-3.5 pt-3">
          {groups.map((group) => (
            <GroupRow key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
