import type { KeyboardEvent } from 'react';
import type { SoreLevelNum, SoreZoneId } from '../../data/athlete/types';
import { SORE_ZONE_LABEL } from '../../engine/morningCheckIn';

/** Dónde cae cada zona sobre la silueta (viewBox 160 × 250). */
const ZONES: { id: SoreZoneId; x: number; y: number }[] = [
  { id: 'cuello', x: 80, y: 46 },
  { id: 'hombro-i', x: 47, y: 60 },
  { id: 'hombro-d', x: 113, y: 60 },
  { id: 'codo-i', x: 36, y: 106 },
  { id: 'codo-d', x: 124, y: 106 },
  { id: 'lumbar', x: 80, y: 118 },
  { id: 'cadera-i', x: 64, y: 150 },
  { id: 'cadera-d', x: 96, y: 150 },
  { id: 'muslo-i', x: 64, y: 186 },
  { id: 'muslo-d', x: 96, y: 186 },
  { id: 'gemelo-i', x: 64, y: 224 },
  { id: 'gemelo-d', x: 96, y: 224 },
];

export const SORE_COLOR: Record<SoreLevelNum, string> = { 1: 'rgb(var(--c-state-mid))', 2: 'rgb(var(--c-state-hot))' };
const LEVEL_WORD: Record<SoreLevelNum | 0, string> = { 0: 'sin agujetas', 1: 'agujetas leves', 2: 'agujetas fuertes' };

const BODY_FILL = 'rgb(var(--c-white) / 0.07)';
const BODY_STROKE = 'rgb(var(--c-white) / 0.12)';

/**
 * Silueta para marcar agujetas: tocar una zona la pasa de "sin agujetas" a leves, de leves a fuertes y de fuertes a nada.
 * Cada zona es un botón accesible (se lee con su nombre y su nivel).
 */
export function BodyMap({ zones, onCycle }: { zones: Partial<Record<SoreZoneId, SoreLevelNum>>; onCycle: (id: SoreZoneId) => void }) {
  const onKey = (e: KeyboardEvent<SVGCircleElement>, id: SoreZoneId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCycle(id);
    }
  };
  return (
    <svg viewBox="0 0 160 250" width="124" height="194" role="group" aria-label="Silueta: toca un músculo con agujetas">
      <circle cx="80" cy="26" r="15" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="72" y="38" width="16" height="14" rx="4" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="50" y="50" width="60" height="92" rx="16" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="28" y="54" width="20" height="82" rx="10" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="112" y="54" width="20" height="82" rx="10" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="52" y="140" width="25" height="106" rx="12" fill={BODY_FILL} stroke={BODY_STROKE} />
      <rect x="83" y="140" width="25" height="106" rx="12" fill={BODY_FILL} stroke={BODY_STROKE} />
      {ZONES.map(({ id, x, y }) => {
        const level = zones[id] ?? 0;
        return (
          <circle
            key={id}
            cx={x}
            cy={y}
            r={14}
            role="button"
            tabIndex={0}
            aria-label={`${SORE_ZONE_LABEL[id]}: ${LEVEL_WORD[level]}`}
            onClick={() => onCycle(id)}
            onKeyDown={(e) => onKey(e, id)}
            fill={level ? SORE_COLOR[level] : 'rgb(var(--c-white) / 0.06)'}
            stroke={level ? 'rgb(var(--c-white) / 0.5)' : 'rgb(var(--c-white) / 0.3)'}
            strokeWidth={1.4}
            className="cursor-pointer outline-none transition-colors duration-200 focus-visible:stroke-white"
          />
        );
      })}
    </svg>
  );
}
