import { ChevronRight, Info, Trophy } from 'lucide-react';
import type { LevelSnapshot } from '../../engine/levelCategories';
import { PartGuard } from '../shell/PartGuard';
import { MiniCategoryRadar } from './CategoryRadar';
import type { LevelCardModel } from './myLevelModel';

function CardBody({ model, level, onOpen }: { model: LevelCardModel; level: LevelSnapshot; onOpen: () => void }) {
  const { overall, delta, filled, total, figures, line } = model;
  const LineIcon = line.icon === 'trophy' ? Trophy : Info;
  return (
    <button onClick={onOpen} className="day-card flex w-full flex-col gap-[9px] px-[13px] py-[11px] text-left transition-colors duration-200" data-testid="my-level-card">
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">Tu nivel</span>
        <span className="-my-1.5 flex shrink-0 items-center [&>svg]:h-[26px] [&>svg]:w-[26px]">
          <MiniCategoryRadar categories={level.categories} />
        </span>
        <span className="num shrink-0 text-[15px] font-semibold leading-none text-white" data-testid="my-level-number">
          {overall ?? `${filled} de ${total}`}
        </span>
        {overall === null ? (
          <span className="shrink-0 text-[11px] text-neutral-500">categorías</span>
        ) : delta !== null ? (
          <span className={`shrink-0 text-[11px] ${delta > 0 ? 'text-good' : delta < 0 ? 'text-warn' : 'text-neutral-500'}`}>
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {Math.abs(delta)} en 3 meses
          </span>
        ) : null}
        <ChevronRight size={14} className="-mr-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
      </span>
      <span className="grid w-full grid-cols-3">
        {figures.map((f, i) => (
          <span key={`${i}-${f.label}`} className={`min-w-0 ${i === 0 ? 'pr-2.5' : 'border-l border-white/[0.12] pl-[11px]'}`} data-testid="my-level-figure">
            <span className="num line-clamp-2 block text-[15px] font-semibold leading-[19.5px] text-white">{f.value}</span>
            <span className="mt-px line-clamp-2 block text-[11px] leading-snug text-neutral-500">{f.label}</span>
          </span>
        ))}
      </span>
      <span className="flex w-full items-center gap-[7px] border-t border-white/[0.08] pt-2 text-[11px] text-neutral-400" data-testid="my-level-line">
        <LineIcon size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{line.text}</span>
      </span>
    </button>
  );
}

/** La tarjeta «Tu nivel»: tus mediciones de un vistazo. Al tocarla se abre su pantalla con los chips (`LevelScreen`). */
export function LevelSummaryCard({ model, level, onOpen }: { model: LevelCardModel; level: LevelSnapshot; onOpen: () => void }) {
  return (
    <PartGuard
      name="la tarjeta Tu nivel"
      fallback={
        <button onClick={onOpen} className="day-card w-full px-[13px] py-3 text-left text-[13px] font-semibold text-white" data-testid="my-level-card">
          Tu nivel · toca para verlo
        </button>
      }
    >
      <CardBody model={model} level={level} onOpen={onOpen} />
    </PartGuard>
  );
}
