import { Fragment, type ReactNode } from 'react';
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

/** El nombre de lo que toca en el bloque: misma jerarquía en todos los bloques plegados. */
const PREVIEW_NAME = 'mt-1 truncate text-base font-extrabold leading-tight text-white';
/** La línea de cifras bajo el nombre ("4 × 6 · 45 kg · 69 % de tu 1RM"): texto corrido, sin recuadros. */
const PREVIEW_FIG = 'mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] text-neutral-400';

function Dot() {
  return (
    <span aria-hidden="true" className="text-neutral-600">
      ·
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
  const isWaves = Boolean(main.sets && main.waveSize && main.waveSize >= 2 && main.sets > main.waveSize && main.sets % main.waveSize === 0);
  // Series y repeticiones en una sola cifra ("4 × 6"); con varias olas, "2 olas · 3-2-1".
  const parts: ReactNode[] = [];
  if (main.sets && isWaves) {
    parts.push(
      <span key="w">
        <b className="num font-bold text-neutral-100">{main.sets / main.waveSize!}</b> olas{main.reps ? <> · <b className="num font-bold text-neutral-100">{main.reps}</b></> : null}
      </span>,
    );
  } else if (main.sets || main.reps) {
    parts.push(
      <b key="sr" className="num font-bold text-neutral-100">
        {main.sets && main.reps ? `${main.sets} × ${main.reps}` : (main.sets ?? main.reps)}
        {main.sets && !main.reps ? ' series' : ''}
      </b>,
    );
  }
  if (main.loadKg) {
    parts.push(
      <b key="kg" className="num text-sm font-extrabold text-brand-neon">
        {fmtKgValue(main.loadKg)} {main.complex ? 'kg' : loadUnitLabel(main.movementId, block)}
      </b>,
    );
  }
  if (pct !== null) parts.push(<span key="pct" className="text-xs text-neutral-500">{Math.round(pct * 100)} % de tu 1RM</span>);
  return (
    <>
      <p className={PREVIEW_NAME}>{main.complex?.name ?? nameOf(main.movementId)}</p>
      <p className={PREVIEW_FIG}>
        {parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <Dot />}
            {p}
          </Fragment>
        ))}
      </p>
      {extra && <p className="mt-0.5 truncate text-xs text-neutral-500">{extra}</p>}
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
            <p className={PREVIEW_NAME}>
              {groups.length > 1 && <span className="mr-1.5 text-xs font-medium text-neutral-500">Parte {part}</span>}
              {title}
            </p>
            <div className={PREVIEW_FIG}>
              {kind && (
                // Puede partirse en varias líneas: si el formato entero cae aquí ("4 sets cada 3 min for time, carga ascendente") no debe salirse de la fila.
                <span className="max-w-full text-[11px] font-extrabold uppercase tracking-[0.06em] text-brand-gold">{kind}</span>
              )}
            </div>
            {detail && <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p>}
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
    return <p className={PREVIEW_NAME}>{results.length} {results.length === 1 ? 'ejercicio' : 'ejercicios'}</p>;
  }
  return <p className={PREVIEW_NAME}>{results.map((e) => nameOf(e.movementId)).join(' · ')}</p>;
}
