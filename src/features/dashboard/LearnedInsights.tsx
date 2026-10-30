import type { LearnedInsight, ReadinessLearning } from '../../engine/readinessLearning';
import { SectionLabel } from '../shell/SectionLabel';
import { RECOVERY_LOW, RECOVERY_MID } from './RecoveryCard';

const NOTICEABLE = 0.5;
const STRONG = 1;
/** Un RPE de diferencia llena la barra al 50 %; 2 la llena entera. */
const FULL_BAR = 2;

const fmt = (n: number) => String(Math.abs(n).toFixed(1)).replace('.', ',');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(n)}`;

function InsightRow({ insight }: { insight: LearnedInsight }) {
  const noticeable = insight.delta >= NOTICEABLE;
  const color = insight.delta >= STRONG ? RECOVERY_LOW : RECOVERY_MID;
  const width = Math.min(100, Math.max(0, (insight.delta / FULL_BAR) * 100));
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="w-[6.5rem] shrink-0 text-xs text-neutral-300">{insight.label}</span>
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          {noticeable && <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, width)}%`, background: color }} />}
        </div>
        <span className="num w-14 shrink-0 text-right text-sm font-semibold" style={{ color: noticeable ? color : undefined }}>
          {noticeable ? signed(insight.delta) : <span className="text-[11px] font-medium text-neutral-500">sin efecto</span>}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-600">
        Cuando {insight.condition}: esfuerzo {fmt(insight.rpeBad)} frente a {fmt(insight.rpeOk)} ({insight.nBad} sesiones así, {insight.nOk} sin)
      </p>
    </div>
  );
}

/**
 * "Lo que aprendo de ti": qué factores del check-in suben de verdad el esfuerzo percibido de tus sesiones.
 * Solo informa — no cambia la nota ni la carga (ver `readinessLearning.ts`).
 */
export function LearnedInsights({ learning, bare = false }: { learning: ReadinessLearning; bare?: boolean }) {
  const top = learning.insights[0];
  return (
    <div>
      {!bare && <SectionLabel className="mb-3">Lo que aprendo de ti</SectionLabel>}
      {!learning.ready ? (
        <div className="flex flex-col gap-2">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-white/70 transition-all duration-500" style={{ width: `${Math.max(4, (learning.pairs / learning.needed) * 100)}%` }} />
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Cruzo cada check-in con cómo te sale la sesión de ese día. Llevo <span className="font-semibold text-neutral-200">{learning.pairs}</span> de {learning.needed}
            {' '}para empezar a decirte qué te afecta a ti.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {top && top.delta >= NOTICEABLE ? (
            <p className="text-sm leading-snug text-neutral-200">
              Cuando {top.condition}, tus sesiones te cuestan <span className="font-semibold" style={{ color: top.delta >= STRONG ? RECOVERY_LOW : RECOVERY_MID }}>{signed(top.delta)}</span> de esfuerzo.
            </p>
          ) : (
            <p className="text-sm leading-snug text-neutral-300">Por ahora ningún factor te cambia claramente el esfuerzo de las sesiones.</p>
          )}
          {learning.insights.length > 0 && (
            <div className="flex flex-col gap-3">
              {learning.insights.map((i) => (
                <InsightRow key={i.key} insight={i} />
              ))}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-neutral-600">
            Basado en {learning.pairs} sesiones con check-in. Orientativo: el esfuerzo también depende de lo duro que fuese el día. Todavía no cambia tu nota.
          </p>
        </div>
      )}
    </div>
  );
}
