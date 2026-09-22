import { useEffect, useState } from 'react';
import { NotebookPen, Brain } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult } from '../../data/athlete/types';
import { SessionBlockCard, type RpeFeedback } from './SessionBlockCard';
import { buildTaskSections, SessionTaskView } from './SessionTaskView';
import type { MovementProgressData } from './LoadStat';

export const BLOCK_ORDER: Block[] = ['warmup', 'strength', 'wod', 'oly', 'accessory', 'skill', 'cooldown'];

interface DaySessionBlocksProps {
  session: DailySession;
  editable?: boolean;
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
  onAddEntry?: (newEntry: SessionBlockResult, afterIndex: number) => void;
  onRemoveEntry?: (index: number) => void;
  /** Datos del atleta para el popup de progresión del movimiento (tocar la carga de una serie de fuerza/oly). */
  progress?: MovementProgressData;
  /** Percepción de esfuerzo de fuerza/oly ya registrada hoy en modo entreno, por índice global de
   * `session.blocks` — `SessionBlockCard` la pinta debajo del levantamiento al que pertenece. */
  setFeedbackByIndex?: Map<number, RpeFeedback>;
  onRateSet?: (index: number, rpe: number) => void;
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
}: DaySessionBlocksProps) {
  // "Sesión" (los bloques de siempre) vs "Task" (el porqué de cada parte del entreno, todo junto y en
  // orden) — se reinicia a "Sesión" al cambiar de día para no quedarse en Task de un día anterior.
  const [tab, setTab] = useState<'session' | 'task'>('session');
  useEffect(() => setTab('session'), [session.date]);

  if (session.source === 'custom') {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold">
          <NotebookPen size={14} strokeWidth={2.25} />
          Tu sesión
        </div>
        {session.customTitle && <p className="text-base font-semibold text-white">{session.customTitle}</p>}
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
    <div className="card flex flex-col p-4">
      {!editable && taskSections.length > 0 && (
        <div className="mb-3 flex gap-0.5 rounded-lg bg-white/5 p-0.5">
          <button
            onClick={() => setTab('session')}
            className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              tab === 'session' ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Sesión
          </button>
          <button
            onClick={() => setTab('task')}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              tab === 'task' ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Brain size={12} strokeWidth={2.5} />
            Task
          </button>
        </div>
      )}
      {showingTask ? (
        <SessionTaskView sections={taskSections} />
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
