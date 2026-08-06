import { useState } from 'react';
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { BodyweightEntry } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toLocalIsoDate } from '../../engine/periodization';

const CHART_WIDTH = 280;
const CHART_HEIGHT = 56;
const CHART_PADDING = 6;
/** Ventana visible del grafico — no hace falta guardar mas para una tendencia legible. */
const MAX_POINTS = 20;

function buildLinePath(entries: BodyweightEntry[]): { line: string; area: string; lastPoint: { x: number; y: number } } {
  const values = entries.map((e) => e.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = entries.length > 1 ? (CHART_WIDTH - CHART_PADDING * 2) / (entries.length - 1) : 0;

  const points = entries.map((e, i) => {
    const x = CHART_PADDING + i * stepX;
    const y = CHART_HEIGHT - CHART_PADDING - ((e.kg - min) / range) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${CHART_HEIGHT} L ${points[0].x.toFixed(1)} ${CHART_HEIGHT} Z`;

  return { line, area, lastPoint: points[points.length - 1] };
}

interface BodyweightCardProps {
  log: BodyweightEntry[];
  onChange: (log: BodyweightEntry[]) => void;
}

export function BodyweightCard({ log, onChange }: BodyweightCardProps) {
  const [draft, setDraft] = useState('');
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-MAX_POINTS);
  const latest = recent[recent.length - 1];
  const first = recent[0];
  const delta = latest && first && recent.length > 1 ? latest.kg - first.kg : null;
  const chart = recent.length >= 2 ? buildLinePath(recent) : null;

  function handleAdd() {
    const kg = Number(draft.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) return;
    athleteRepository.appendBodyweightEntry({ date: toLocalIsoDate(new Date()), kg });
    onChange(athleteRepository.getBodyweightLog());
    setDraft('');
  }

  const TrendIcon = delta === null || Math.abs(delta) < 0.1 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const trendClass = delta === null || Math.abs(delta) < 0.1 ? 'text-neutral-500' : delta > 0 ? 'text-brand-orange' : 'text-emerald-400';

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
            <Scale size={18} strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Peso corporal</p>
            {latest ? (
              <p className="text-xs text-neutral-500">
                {latest.kg} kg · {latest.date}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">Sin registros todavía</p>
            )}
          </div>
        </div>
        {delta !== null && (
          <span className={`flex items-center gap-1 text-xs font-semibold ${trendClass}`}>
            <TrendIcon size={14} strokeWidth={2.5} />
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)} kg
          </span>
        )}
      </div>

      {chart ? (
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="mt-3 h-14 w-full">
          <path d={chart.area} className="fill-brand-orange/10" />
          <path d={chart.line} fill="none" className="stroke-brand-orange" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={chart.lastPoint.x} cy={chart.lastPoint.y} r={3} className="fill-brand-orange" />
        </svg>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">Registra al menos 2 pesajes para ver la tendencia.</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={0.1}
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Peso de hoy (kg)"
          className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Registrar
        </button>
      </div>
    </section>
  );
}
