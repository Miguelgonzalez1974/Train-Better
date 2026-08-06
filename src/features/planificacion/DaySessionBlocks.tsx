import { NotebookPen } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult } from '../../data/athlete/types';
import { SessionBlockCard } from './SessionBlockCard';

export const BLOCK_ORDER: Block[] = ['warmup', 'strength', 'wod', 'oly', 'accessory', 'skill', 'cooldown'];

interface DaySessionBlocksProps {
  session: DailySession;
  editable?: boolean;
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
}

/** Agrupa session.blocks por BLOCK_ORDER y renderiza una SessionBlockCard por bloque presente ese dia. */
export function DaySessionBlocks({ session, editable, onUpdateEntry }: DaySessionBlocksProps) {
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

  return (
    <div className="card flex flex-col p-4">
      {blocksWithResults.map(({ block, results, entryIndices }, index) => (
        <SessionBlockCard
          key={block}
          block={block}
          results={results}
          entryIndices={entryIndices}
          isLast={index === blocksWithResults.length - 1}
          editable={editable}
          onUpdateEntry={onUpdateEntry}
        />
      ))}
    </div>
  );
}
