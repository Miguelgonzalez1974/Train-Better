import type { ReactNode } from 'react';
import type { Block } from '../../data/movements/types';
import type { PersonalRecords, SessionBlockResult, VariantPersonalRecords } from '../../data/athlete/types';
import { resolveLiftPrTarget } from '../../engine/movementProgress';
import { localizeWodText } from '../../engine/wodUnits';
import type { MovementProgressData } from './LoadStat';
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
      <span className="num whitespace-nowrap text-[15px] font-semibold leading-tight text-white">{value}</span>
      <span className={`text-[9px] uppercase tracking-wide ${accent ? 'text-brand-neon/80' : 'text-neutral-500'}`}>{label}</span>
    </span>
  );
}

/** Qué fracción de su 1RM es la carga de hoy (0-1), o null si el movimiento no tiene PR propio o no hay carga. */
function pctOfOneRm(entry: SessionBlockResult, progress?: MovementProgressData): number | null {
  const movement = getMovementById(entry.movementId);
  if (!movement || !progress || !entry.loadKg) return null;
  const target = resolveLiftPrTarget(movement, progress.variantPrs);
  if (!target) return null;
  const oneRm = target.kind === 'variant' ? progress.variantPrs?.[target.key as keyof VariantPersonalRecords] : progress.prs[target.key as keyof PersonalRecords];
  return oneRm && oneRm > 0 ? entry.loadKg / oneRm : null;
}

function LiftPreview({ block, results, progress }: { block: Block; results: SessionBlockResult[]; progress?: MovementProgressData }) {
  // El levantamiento de trabajo: en oly, sin el calentamiento de barra ni el primer tecnico del complejo.
  const work = block === 'oly' ? results.filter((e) => !e.subgroup && e.reps !== '2-3') : results;
  const list = work.length > 0 ? work : results;
  const main = list[0];
  const rest = list.slice(1).map((e) => nameOf(e.movementId));
  const extra = block === 'oly' && rest.length > 0 ? `+ ${rest.length} más` : rest.length > 0 ? `+ ${rest.join(' · ')}` : '';
  // Un complejo no tiene un 1RM propio: no se enseña el % de ningún levantamiento.
  const pct = main.complex ? null : pctOfOneRm(main, progress);
  return (
    <>
      <p className="mt-1 truncate text-[17px] font-semibold leading-tight text-white">{main.complex?.name ?? nameOf(main.movementId)}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {main.sets ? (
          main.waveSize && main.waveSize >= 2 && main.sets > main.waveSize && main.sets % main.waveSize === 0 ? (
            <Mini value={main.sets / main.waveSize} label="olas" />
          ) : (
            <Mini value={main.sets} label="series" />
          )
        ) : null}
        {main.reps ? <Mini value={main.reps} label={main.complex ? 'complejo' : 'reps'} /> : null}
        {main.loadKg ? <Mini value={fmtKgValue(main.loadKg)} label={main.complex ? 'kg' : loadUnitLabel(main.movementId, block)} accent /> : null}
        {extra && <span className="ml-1 min-w-0 truncate text-xs text-neutral-500">{extra}</span>}
      </div>
      {pct !== null && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
            <span className="block h-full rounded-full bg-white/60" style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
          </span>
          <span className="whitespace-nowrap text-[11px] text-neutral-500">{Math.round(pct * 100)} % de tu 1RM</span>
        </div>
      )}
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
        // El formato empieza por su tipo ("AMRAP 16 min", "For time"): ese primer tramo va en una píldora.
        // Los WODs de programaciones escriben "AMRAP 15 min: 20 snatches, 10 burpees (…)": el tipo va antes de los dos puntos.
        const colon = (head.format ?? '').match(/^([^:]{3,40}):\s*(.*)$/);
        const [kind, ...restOfFormat] = colon ? [colon[1], colon[2]] : (head.format ?? '').split(/ — | · /);
        const detail = [localizeWodText(restOfFormat.join(' · ')), isBenchmark ? '' : `${group.length} mov.`].filter(Boolean).join(' · ');
        return (
          <div key={part} className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-tight text-white">
              {groups.length > 1 && <span className="mr-1.5 text-xs font-medium text-neutral-500">Parte {part}</span>}
              {title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {kind && (
                // Sin `shrink-0`: si el formato entero cae aquí ("4 sets cada 3 min for time, carga ascendente") la píldora tiene que poder partirse en vez de salirse de la tarjeta.
                <span className="max-w-full rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">{kind}</span>
              )}
              {detail && <span className="min-w-0 truncate text-xs text-neutral-500">{detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** La línea (o dos) que se ve cuando el bloque está plegado: lo justo para saber qué toca sin abrirlo. */
export function BlockPreview({ block, results, progress }: { block: Block; results: SessionBlockResult[]; progress?: MovementProgressData }) {
  if (block === 'strength' || block === 'oly') return <LiftPreview block={block} results={results} progress={progress} />;
  if (block === 'wod') return <WodPreview results={results} />;
  if (block === 'warmup' || block === 'cooldown') {
    return <p className="mt-0.5 text-sm text-neutral-400">{results.length} {results.length === 1 ? 'ejercicio' : 'ejercicios'}</p>;
  }
  return <p className="mt-0.5 truncate text-sm text-neutral-300">{results.map((e) => nameOf(e.movementId)).join(' · ')}</p>;
}
