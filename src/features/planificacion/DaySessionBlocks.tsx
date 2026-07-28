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
