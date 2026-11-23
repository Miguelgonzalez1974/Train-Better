import { Fragment, useEffect, useState } from 'react';
import { NotebookPen, Brain } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult } from '../../data/athlete/types';
import { SessionBlockCard, type RpeFeedback } from './SessionBlockCard';
import { BlockPreview } from './BlockPreview';
import { buildTaskSections, SessionTaskView } from './SessionTaskView';
import type { MovementProgressData } from './LoadStat';
import { EmphasisTag } from './ProfileEmphasis';
import { WodDoneLine } from './WodDoneLine';
import { WorkDoneList } from './WorkDoneList';
import type { WorkDoneLine } from './workDoneLines';
import type { WodDoneInfo } from '../../engine/wodDone';
import type { ClockScope } from '../../lib/clockState';

export const BLOCK_ORDER: Block[] = ['warmup', 'strength', 'wod', 'oly', 'accessory', 'skill', 'cooldown'];

interface DaySessionBlocksProps {
  session: DailySession;
  editable?: boolean;
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
  onAddEntry?: (newEntry: SessionBlockResult, afterIndex: number) => void;
  onRemoveEntry?: (index: number) => void;
  /** Datos del atleta para el popup de progresión del movimiento (tocar la carga de una serie de fuerza/oly). */
  progress?: MovementProgressData;
  /** Percepción de esfuerzo de fuerza/oly ya registrada hoy al anotar la sesión, por índice global de
   * `session.blocks` — `SessionBlockCard` la pinta debajo del levantamiento al que pertenece. */
  setFeedbackByIndex?: Map<number, RpeFeedback>;
  onRateSet?: (index: number, rpe: number) => void;
  /** Al cambiar de día, abrir el bloque principal (fuerza, oly o WOD) y dejar el resto plegado. Una sesión ya hecha entra toda plegada. */
  autoOpenMain?: boolean;
  /** Qué reloj abre el «Crono» del WOD: el de hoy (por defecto) o el de la vista previa de otro día (`WeekStrip`). */
  clockScope?: ClockScope;
  /** El resultado de cada parte del WOD si la sesión ya está hecha: se enseña como una línea al pie de la tarjeta del WOD. */
  wodDone?: Partial<Record<1 | 2, WodDoneInfo>>;
  /** Lo hecho de verdad en fuerza y oly (series anotadas), bajo cada bloque: en una sesión en marcha o ya cerrada. */
  workDone?: Partial<Record<'strength' | 'oly', WorkDoneLine[]>>;
  /** Lo anotado de un día propio («Clase de CrossFit», «Running»…): esfuerzo y minutos, para que se vea que quedaron guardados. */
  logged?: { rpe: number; durationMin: number } | null;
}

/** Agrupa session.blocks por BLOCK_ORDER y renderiza una SessionBlockCard por bloque presente ese dia. */
export function DaySessionBlocks({
  session,
  editable,
  onUpdateEntry,
  onAddEntry,
  onRemoveEntry,
  progress,
  setFeedbackByIndex,
  onRateSet,
  autoOpenMain = false,
  clockScope,
  wodDone,
  workDone,
  logged,
}: DaySessionBlocksProps) {
  // "Sesión" (los bloques de siempre) vs "Task" (el porqué de cada parte del entreno, todo junto y en
  // orden) — se reinicia a "Sesión" al cambiar de día para no quedarse en Task de un día anterior.
  const [tab, setTab] = useState<'session' | 'task'>('session');
  // Todo plegado por defecto: un bloque abierto a la vez (al abrir otro se cierra el anterior), o todos con "Abrir todo".
  const [openBlocks, setOpenBlocks] = useState<Set<Block>>(new Set());
  const mainBlock = ((['strength', 'oly', 'wod'] as Block[]).find((b) => session.blocks.some((x) => x.block === b)));
  useEffect(() => {
    setTab('session');
    setOpenBlocks(new Set(autoOpenMain && mainBlock ? [mainBlock] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.date]);

  if (session.source === 'custom') {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold">
          <NotebookPen size={14} strokeWidth={2.25} />
          Tu sesión
        </div>
        {session.customTitle && <p className="text-base font-semibold text-white">{session.customTitle}</p>}
        {logged && (
          <p className="text-sm font-semibold text-white" data-testid="custom-logged">
            Esfuerzo {logged.rpe} de 10 · {logged.durationMin} min
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-neutral-300">{session.customNote}</p>
      </div>
    );
  }

  const blocksWithResults = BLOCK_ORDER.map((block) => {
    const withIndex = session.blocks.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.block === block);
    return { block, results: withIndex.map((w) => w.entry), entryIndices: withIndex.map((w) => w.index) };
  }).filter((group) => group.results.length > 0);

  // Task no tiene sentido en edición (ahí se necesitan los bloques para poder tocarlos) ni si hoy no
  // hay ninguna nota de las que se sacaron de la tarjeta — en ese caso ni se muestra el interruptor.
  const taskSections = editable ? [] : buildTaskSections(session);
  const showingTask = tab === 'task' && taskSections.length > 0;

  return (
    <div className="flex flex-col">
      {!editable && taskSections.length > 0 && (
        <div className="mb-3 flex gap-0.5 rounded-lg bg-white/5 p-0.5">
          <button
            onClick={() => setTab('session')}
            className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              tab === 'session' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            Sesión
          </button>
          <button
            onClick={() => setTab('task')}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              tab === 'task' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            <Brain size={12} strokeWidth={2.5} />
            Notas
          </button>
        </div>
      )}
      {showingTask ? (
        <SessionTaskView sections={taskSections} />
      ) : !editable ? (
        <div className="flex flex-col">
          <button
            onClick={() => setOpenBlocks(openBlocks.size === blocksWithResults.length ? new Set() : new Set(blocksWithResults.map((g) => g.block)))}
            className="mb-2 ml-auto block text-[11px] font-medium text-neutral-500 transition-colors duration-200 hover:text-neutral-300"
          >
            {openBlocks.size === blocksWithResults.length ? 'Cerrar todo' : 'Abrir todo'}
          </button>
          {blocksWithResults.map(({ block, results, entryIndices }) => (
            <Fragment key={block}>
            <SessionBlockCard
              block={block}
              results={results}
              entryIndices={entryIndices}
              isLast={false}
              progress={progress}
              setFeedbackByIndex={setFeedbackByIndex}
              onRateSet={onRateSet}
              onUpdateEntry={onUpdateEntry}
              clockScope={clockScope}
              indexMode={{
                preview: <BlockPreview block={block} results={results} progress={progress} />,
                open: openBlocks.has(block),
                onToggle: () =>
                  setOpenBlocks((prev) => {
                    if (prev.has(block)) {
                      const next = new Set(prev);
                      next.delete(block);
                      return next;
                    }
                    return new Set([block]);
                  }),
              }}
            />
            {(block === 'strength' || block === 'oly' || block === 'wod' || block === 'accessory') && session.profileEmphasis?.blocks[block] && (
              <EmphasisTag label={session.profileEmphasis.blocks[block]!.label} why={session.profileEmphasis.blocks[block]!.why} />
            )}
            {(block === 'strength' || block === 'oly') && workDone?.[block] && workDone[block]!.length > 0 && <WorkDoneList lines={workDone[block]!} />}
            {block === 'wod' &&
              wodDone &&
              ([1, 2] as const).filter((p) => wodDone[p]).map((p, _i, shown) => <WodDoneLine key={p} info={wodDone[p]!} label={shown.length > 1 ? `Parte ${p}` : undefined} />)}
            </Fragment>
          ))}
        </div>
      ) : (
        blocksWithResults.map(({ block, results, entryIndices }, index) => (
          <SessionBlockCard
            key={block}
            block={block}
            results={results}
            entryIndices={entryIndices}
            isLast={index === blocksWithResults.length - 1}
            editable={editable}
            onUpdateEntry={onUpdateEntry}
            onAddEntry={onAddEntry}
            onRemoveEntry={onRemoveEntry}
            progress={progress}
            setFeedbackByIndex={setFeedbackByIndex}
            onRateSet={onRateSet}
          />
        ))
      )}
    </div>
  );
}
