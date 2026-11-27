import { useState, type ReactNode } from 'react';
import type { RecentItem } from '../../engine/levelCategories';

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** La nota de la categoría mes a mes (12 puntos, de hace 11 meses a hoy): una línea con puntos solo donde hay datos. Solo pinta. */
export function Sparkline({ series }: { series: (number | null)[] }) {
  const W = 220;
  const H = 40;
  const n = series.length;
  const x = (i: number) => 4 + (i * (W - 8)) / Math.max(1, n - 1);
  const y = (v: number) => H - 4 - (Math.max(0, Math.min(100, v)) / 100) * (H - 8);
  const segments: string[] = [];
  let cur: string[] = [];
  series.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) segments.push(cur.join(' '));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length > 1) segments.push(cur.join(' '));
  const last = series.length - 1;
  const hasAny = series.some((v) => v !== null);
  if (!hasAny) return null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Evolución de esta categoría en los últimos 12 meses">
        <line x1={4} x2={W - 4} y1={y(100)} y2={y(100)} stroke="rgb(var(--c-white) / 0.14)" strokeDasharray="3 3" />
        {segments.map((pts) => (
          <polyline key={pts} points={pts} fill="none" stroke="rgb(var(--c-brand-orange))" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 3.2 : 1.8} fill="rgb(var(--c-brand-orange))" />))}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-600">
        <span>hace 12 meses</span>
        <span>hoy</span>
      </div>
    </div>
  );
}

/**
 * Lo que hay detrás de una categoría: cómo ha ido en el último año y sus 3 últimos entrenos (con lo que hiciste y cómo quedó frente a tu mejor marca). Un entreno que no cuenta
 * (un escalado sin detalle, o con un Rx por delante) sale atenuado con el motivo; si le falta el detalle, se puede decir ahora (`renderFix`).
 * Solo pinta: lo calcula `engine/levelCategories.ts`.
 */
export function CategoryRecent({ items, series, need, renderFix }: { items: RecentItem[]; series: (number | null)[]; need: string | null; renderFix?: (fix: NonNullable<RecentItem['fix']>, close: () => void) => ReactNode }) {
  const [fixing, setFixing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2.5 pt-1" data-testid="category-recent">
      <Sparkline series={series} />
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">Últimos entrenos</p>
        {items.length === 0 ? (
          <p className="text-xs leading-relaxed text-neutral-500">Aún no hay entrenos de esta categoría con detalle.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {items.map((it, i) => {
              const id = it.fix ? `${it.fix.date}|${it.fix.part}` : null;
              return (
                <li key={`${it.date}-${i}`} className="py-1.5">
                  <div className={`flex items-baseline justify-between gap-3 ${it.counts ? '' : 'opacity-60'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-neutral-100">{it.title}</span>
                      <span className="block text-[11px] text-neutral-500">
                        {shortDate(it.date)}
                        {it.vs ? ` · ${it.vs}` : ''}
                        {it.note ? ` · ${it.note}` : ''}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm font-bold text-white">{it.value}</span>
                  </div>
                  {it.fix && renderFix && fixing !== id && (
                    <button type="button" onClick={() => setFixing(id)} className="mt-1 rounded-full border border-brand-border px-3 py-1 text-[11px] font-semibold text-neutral-200 transition-colors hover:text-white">
                      Decir qué escalé
                    </button>
                  )}
                  {it.fix && renderFix && fixing === id && <div className="mt-2">{renderFix(it.fix, () => setFixing(null))}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {need && <p className="text-[11px] leading-relaxed text-warn">{need}</p>}
    </div>
  );
}
