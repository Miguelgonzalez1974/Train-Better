import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ExplainAction, ExplainRow, ExplainTone, Explanation } from '../../engine/explainNumbers';
import { RexMascot } from '../objetivos/RexMascot';

const TONE_COLOR: Record<ExplainTone, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  bad: 'rgb(var(--c-state-low))',
  info: 'rgb(var(--c-state-cool))',
  plan: 'rgb(var(--c-plan))',
  effort: 'rgb(var(--c-effort))',
  neutral: 'rgb(var(--c-white))',
};

/** Color de una nota de 0 a 100 con los mismos tramos que el aro de preparaciÃ³n. */
function scoreColor(value: number): string {
  return value >= 65 ? 'rgb(var(--c-ring-good))' : value <= 40 ? 'rgb(var(--c-ring-low))' : 'rgb(var(--c-ring-mid))';
}

function Row({ row }: { row: ExplainRow }) {
  if (row.kind === 'plain') {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
        <span className="min-w-0 text-neutral-300">{row.label}</span>
        {row.value && <span className="num shrink-0 font-semibold text-white">{row.value}</span>}
      </div>
    );
  }
  if (row.kind === 'score') {
    const color = scoreColor(row.value);
    return (
      <div className="py-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 text-neutral-300">
            {row.label}
            {row.weight && <span className="ml-1 text-neutral-500">Â· {row.weight}</span>}
          </span>
          <span className="num shrink-0 font-semibold" style={{ color }}>
            {row.value}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.value))}%`, backgroundColor: color }} />
        </div>
        {row.detail && <p className="mt-1 text-[11px] leading-snug text-neutral-500">{row.detail}</p>}
      </div>
    );
  }
  const positive = row.value > 0;
  const color = positive ? 'rgb(var(--c-ring-good))' : 'rgb(var(--c-ring-low))';
  const width = Math.min(50, Math.abs(row.value) * 3);
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 text-neutral-300">{row.label}</span>
        <span className="num shrink-0 font-semibold" style={{ color }}>
          {positive ? '+' : 'âˆ’'}
          {Math.abs(row.value)}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-white/[0.08]" aria-hidden="true">
        <div className="absolute bottom-0 top-0 rounded-full" style={{ [positive ? 'left' : 'right']: '50%', width: `${width}%`, backgroundColor: color }} />
      </div>
      {row.detail && <p className="mt-1 text-[11px] leading-snug text-neutral-500">{row.detail}</p>}
    </div>
  );
}

/**
 * El globo de Rex que explica un nÃºmero del anillo: sale bajo los nÃºmeros, con una cola que seÃ±ala de quÃ© lado estÃ¡ lo que has tocado
 * (izquierda: preparaciÃ³n y carga; derecha: realizado y previsto; centro: el objetivo). El texto y el desglose vienen de
 * `engine/explainNumbers.ts`; los botones los traduce quien lo usa (`onAction`).
 */
export function RexExplainBubble({
  explanation,
  anchor,
  onAction,
  onClose,
}: {
  explanation: Explanation;
  anchor: 'left' | 'center' | 'right';
  onAction: (action: ExplainAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // En pantallas bajas, el globo se trae a la vista al abrirse.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [explanation.id]);

  const left = anchor === 'left' ? '16%' : anchor === 'right' ? '84%' : '50%';
  return (
    <section ref={ref} role="region" aria-label="Rex explica este nÃºmero" className="relative mt-4 animate-section-in motion-reduce:animate-none">
      <span
        className="absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-white/20 bg-brand-surface"
        style={{ left }}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 rounded-2xl border border-white/20 bg-brand-surface px-3.5 py-3">
        <RexMascot size={34} mood="think" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] leading-relaxed text-neutral-200">
              <strong className="font-bold" style={{ color: TONE_COLOR[explanation.tone] }}>
                {explanation.lead}
              </strong>{' '}
              {explanation.text}
            </p>
            <button onClick={onClose} aria-label="Cerrar la explicaciÃ³n" className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/10 hover:text-white">
              <X size={14} />
            </button>
          </div>
          {explanation.rows.length > 0 && (
            <div className="mt-2 divide-y divide-white/[0.06]">
              {explanation.rows.map((row, i) => (
                <Row key={`${row.label}-${i}`} row={row} />
              ))}
            </div>
          )}
          {explanation.foot && <p className="mt-2 text-[11px] leading-snug text-neutral-500">{explanation.foot}</p>}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {explanation.actions.map((a, i) => (
              <button
                key={a.label}
                onClick={() => onAction(a.action)}
                className={
                  i === 0
                    ? 'rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark'
                    : 'rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-white/30 hover:bg-white/5'
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
