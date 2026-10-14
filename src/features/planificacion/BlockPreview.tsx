import type { ReactNode } from 'react';
import type { Block } from '../../data/movements/types';
import type { SessionBlockResult } from '../../data/athlete/types';
import { benchmarkWorkouts, getMovementById } from '../../data/movements';
import { loadUnitLabel } from '../../data/movements/loadUnits';
import { fmtKgValue } from '../../lib/format';

function nameOf(id: string): string {
  if (id.startsWith('benchmark:')) {
    const bid = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === bid)?.name ?? bid;
  }
  return getMovementById(id)?.name ?? id;
}

/** Cuadrito de la prescripción, como los de la tarjeta de fuerza pero compacto: cifra arriba, etiqueta debajo. */
function Mini({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <span className={`flex min-w-[2.9rem] flex-col items-center rounded-lg px-2 py-1 ${accent ? 'bg-brand-neon/10 ring-1 ring-brand-neon/30' : 'bg-black/20'}`}>
      <span className="num text-[15px] font-semibold leading-tight text-white">{value}</span>
      <span className={`text-[9px] uppercase tracking-wide ${accent ? 'text-brand-neon/80' : 'text-neutral-500'}`}>{label}</span>
    </span>
  );
}

function LiftPreview({ block, results }: { block: Block; results: SessionBlockResult[] }) {
  // El levantamiento de trabajo: en oly, sin el calentamiento de barra ni el primer tecnico del complejo.
  const work = block === 'oly' ? results.filter((e) => !e.subgroup && e.reps !== '2-3') : results;
  const list = work.length > 0 ? work : results;
  const main = list[0];
  const rest = list.slice(1).map((e) => nameOf(e.movementId));
  const extra = block === 'oly' && rest.length > 0 ? `+ ${rest.length} más` : rest.length > 0 ? `+ ${rest.join(' · ')}` : '';
  return (
    <>
      <p className="mt-1 truncate text-[15px] font-semibold text-white">{nameOf(main.movementId)}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {main.sets ? <Mini value={main.sets} label="series" /> : null}
        {main.reps ? <Mini value={main.reps} label="reps" /> : null}
        {main.loadKg ? <Mini value={fmtKgValue(main.loadKg)} label={loadUnitLabel(main.movementId, block)} accent /> : null}
        {extra && <span className="ml-1 min-w-0 truncate text-xs text-neutral-500">{extra}</span>}
      </div>
    </>
  );
}

function WodPreview({ results }: { results: SessionBlockResult[] }) {
  const parts = new Map<number, SessionBlockResult[]>();
  for (const e of results) parts.set(e.wodPart ?? 1, [...(parts.get(e.wodPart ?? 1) ?? []), e]);
  const groups = [...parts.entries()];
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {groups.map(([part, group]) => {
        const head = group[0];
        const isBenchmark = head.movementId.startsWith('benchmark:');
        const title = head.title ? `"${head.title}"` : nameOf(head.movementId);
        const detail = [head.format, isBenchmark ? '' : `${group.length} mov.`].filter(Boolean).join(' · ');
        return (
          <div key={part} className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">
              {groups.length > 1 && <span className="mr-1.5 text-xs font-medium text-neutral-500">Parte {part}</span>}
              {title}
            </p>
            {detail && <p className="truncate text-xs text-neutral-500">{detail}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** La línea (o dos) que se ve cuando el bloque está plegado: lo justo para saber qué toca sin abrirlo. */
export function BlockPreview({ block, results }: { block: Block; results: SessionBlockResult[] }) {
  if (block === 'strength' || block === 'oly') return <LiftPreview block={block} results={results} />;
  if (block === 'wod') return <WodPreview results={results} />;
  if (block === 'warmup' || block === 'cooldown') {
    return <p className="mt-0.5 text-sm text-neutral-400">{results.length} {results.length === 1 ? 'ejercicio' : 'ejercicios'}</p>;
  }
  return <p className="mt-0.5 truncate text-sm text-neutral-300">{results.map((e) => nameOf(e.movementId)).join(' · ')}</p>;
}
