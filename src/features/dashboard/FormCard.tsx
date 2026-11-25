import { AlertCircle, CalendarDays, ChevronRight, Info, type LucideIcon } from 'lucide-react';
import { PartGuard } from '../shell/PartGuard';
import type { FormCardModel } from './formCardModel';

const LINE_ICON: Record<FormCardModel['line']['icon'], LucideIcon> = { window: CalendarDays, pain: AlertCircle, info: Info };

/** La batería de la energía: se llena según tu porcentaje. */
function Battery({ value }: { value: number }) {
  return (
    <span className="relative mr-[3px] inline-block h-3 w-6 shrink-0 rounded-[3px] border-[1.5px] border-current" aria-hidden="true">
      <span className="absolute bottom-[1.5px] left-[1.5px] top-[1.5px] rounded-[1px] bg-current" style={{ width: `${Math.max(6, Math.min(100, value)) * 0.18}px` }} />
      <span className="absolute -right-1 top-[2.5px] h-1 w-0.5 bg-current" />
    </span>
  );
}

function CardBody({ model, onOpen }: { model: FormCardModel; onOpen: () => void }) {
  const { state, figures, line } = model;
  const LineIcon = LINE_ICON[line.icon];
  return (
    <button onClick={onOpen} className="day-card flex w-full flex-col gap-[9px] px-[13px] py-[11px] text-left transition-colors duration-200" data-testid="form-card">
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">Tu forma</span>
        {state && (
          <span className={`flex shrink-0 items-center gap-1.5 ${state.tired ? 'text-warn' : 'text-white'}`} data-testid="form-state">
            <Battery value={state.energy} />
            <span className="text-[15px] font-semibold leading-none">{state.title}</span>
          </span>
        )}
        <ChevronRight size={14} className="-mr-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
      </span>
      <span className="grid w-full grid-cols-3">
        {figures.map((f, i) => (
          <span key={f.label} className={`min-w-0 ${i === 0 ? 'pr-2.5' : 'border-l border-white/[0.12] pl-[11px]'}`} data-testid="form-figure">
            {/* Hasta dos líneas: «Cadera / lumbar» no cabe en una. */}
            <span className={`num line-clamp-2 block text-[15px] font-semibold leading-[19.5px] ${f.warn ? 'text-warn' : 'text-white'}`}>{f.value}</span>
            <span className="mt-px line-clamp-2 block text-[11px] leading-snug text-neutral-500">{f.label}</span>
          </span>
        ))}
      </span>
      <span className={`flex w-full items-center gap-[7px] border-t border-white/[0.08] pt-2 text-[11px] ${line.warn ? 'text-warn' : 'text-neutral-400'}`} data-testid="form-line">
        <LineIcon size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{line.text}</span>
      </span>
    </button>
  );
}

/** La tarjeta «Tu forma»: todo lo que influye en cómo estás, de un vistazo. Al tocarla se abre su pantalla con los chips (`FormScreen`). */
export function FormCard({ model, onOpen }: { model: FormCardModel; onOpen: () => void }) {
  return (
    <PartGuard
      name="la tarjeta Tu forma"
      fallback={
        <button onClick={onOpen} className="day-card w-full px-[13px] py-3 text-left text-[13px] font-semibold text-white" data-testid="form-card">
          Tu forma · toca para verla
        </button>
      }
    >
      <CardBody model={model} onOpen={onOpen} />
    </PartGuard>
  );
}
