import { AlertCircle, Check, ChevronRight, History, Minus, Plus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { CardLine, SessionCardModel } from './sessionCardModel';
import { ACCENT as EFFORT, OVER, PLAN } from './StrainRing';

const LINE_ICON: Record<CardLine['icon'], LucideIcon> = { history: History, up: TrendingUp, down: TrendingDown, same: Minus, alert: AlertCircle, plus: Plus, check: Check };

/** El peso de las últimas veces: una línea fina con el último punto marcado (azul en lo hecho, blanco en lo que toca). Sin ejes: es para ver la tendencia de un vistazo. */
function Spark({ values, done }: { values: number[]; done: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 3 + (i * 50) / (values.length - 1);
  const y = (v: number) => (max === min ? 9 : 15 - ((v - min) / (max - min)) * 12);
  const last = values.length - 1;
  return (
    <svg viewBox="0 0 56 18" className="h-[18px] w-14 shrink-0" role="img" aria-label={`Peso de las últimas ${values.length} veces: ${values.join(', ')} kilos`}>
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-white) / 0.35)' }} />
      <circle cx={x(last)} cy={y(values[last])} r="2.5" style={{ fill: done ? EFFORT : 'rgb(var(--c-white))' }} />
    </svg>
  );
}

/**
 * La tarjeta de sesión del Resumen: titular, tres cifras separadas por una raya y una sola línea más. Casi todo en blanco y gris: el color solo
 * aparece cuando significa algo (azul = lo hecho, rojo = te pasas, ámbar = el coach ha cambiado la sesión). Toda la tarjeta se toca.
 */
export function SessionCard({ model, onOpenPlan, onOpenDone }: { model: SessionCardModel; onOpenPlan: () => void; onOpenDone: () => void }) {
  const done = model.kind === 'done';
  const open = model.action === 'plan' ? onOpenPlan : model.action === 'done' ? onOpenDone : null;
  const { figures, line } = model;
  const LineIcon = line ? LINE_ICON[line.icon] : null;

  const body = (
    <>
      <span className="flex w-full items-center gap-2">
        {done && <Check size={16} strokeWidth={3} className="shrink-0" style={{ color: EFFORT }} aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15px] font-semibold ${model.kind === 'missing' ? 'text-neutral-400' : 'text-white'}`}>{model.title}</span>
          {/* Sin cifras (descanso, sin sesión…) la explicación va debajo del titular, no a su lado: así el titular no se corta. */}
          {model.meta && figures.length === 0 && <span className="mt-0.5 block truncate text-xs text-neutral-500">{model.meta}</span>}
        </span>
        {model.meta && figures.length > 0 && <span className="shrink-0 text-xs text-neutral-500">{model.meta}</span>}
        {open && <ChevronRight size={16} className="shrink-0 text-neutral-600" aria-hidden="true" />}
      </span>
      {figures.length > 0 && (
        <span className={`grid w-full ${figures.length === 3 ? 'grid-cols-[1.15fr_1.05fr_0.8fr]' : figures.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {figures.map((f, i) => (
            <span key={`${i}-${f.value}`} className={`min-w-0 px-2.5 ${i === 0 ? 'pl-0' : 'border-l border-white/[0.12]'}`} data-testid="session-figure">
              <span
                className={`num block truncate text-[19px] font-semibold leading-tight ${f.tone === 'effort' || f.tone === 'muted' ? '' : 'text-white'}`}
                style={f.tone === 'effort' ? { color: EFFORT } : f.tone === 'muted' ? { color: PLAN } : undefined}
              >
                {f.value}
              </span>
              <span className={`mt-0.5 line-clamp-2 block text-[11px] leading-snug ${f.labelTone === 'over' ? 'font-semibold' : 'text-neutral-500'}`} style={f.labelTone === 'over' ? { color: OVER } : undefined}>
                {f.label}
              </span>
            </span>
          ))}
        </span>
      )}
      {line && LineIcon && (
        <span className={`flex w-full items-center gap-2 border-t border-white/[0.08] pt-2 text-xs ${line.warn ? 'text-warn' : 'text-neutral-400'}`} data-testid="session-line">
          <LineIcon size={14} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{line.text}</span>
          {line.spark && <Spark values={line.spark} done={done} />}
        </span>
      )}
    </>
  );

  const cls = 'flex w-full flex-col gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-2.5 text-left';
  return open ? (
    <button onClick={open} className={`${cls} animate-section-in transition-colors duration-200 hover:bg-white/[0.07] motion-reduce:animate-none`} data-testid="session-card" data-kind={model.kind}>
      {body}
    </button>
  ) : (
    <div className={cls} data-testid="session-card" data-kind={model.kind}>
      {body}
    </div>
  );
}
