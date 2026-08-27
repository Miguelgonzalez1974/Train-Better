import { useState } from 'react';
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { BodyweightEntry } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toLocalIsoDate } from '../../engine/periodization';
import { Sparkline } from './Sparkline';

/** Ventana visible del grafico — no hace falta guardar mas para una tendencia legible. */
const MAX_POINTS = 20;

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

      {recent.length >= 2 ? (
        <Sparkline
          values={recent.map((e) => e.kg)}
          strokeClassName="stroke-brand-orange"
          areaClassName="fill-brand-orange/10"
          dotClassName="fill-brand-orange"
          className="mt-3 h-14 w-full"
        />
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
