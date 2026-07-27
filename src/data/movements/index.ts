import type { Block, Movement } from './types';
import { strengthMovements } from './strength';
import { olyMovements } from './oly';
import { wodMovements } from './wod';
import { accessoryMovements } from './accessory';
import { skillMovements } from './skill';
import { warmupMovements } from './warmup';
import { cooldownMovements } from './cooldown';

export * from './types';
export { benchmarkWorkouts } from './benchmarkWods';

export const allMovements: Movement[] = [
  ...strengthMovements,
  ...olyMovements,
  ...wodMovements,
  ...accessoryMovements,
  ...skillMovements,
  ...warmupMovements,
  ...cooldownMovements,
];

const movementsById = new Map(allMovements.map((m) => [m.id, m]));

export function getMovementById(id: string): Movement | undefined {
  return movementsById.get(id);
}

export function getMovementsByBlock(block: Block): Movement[] {
  return allMovements.filter((m) => m.blocks.includes(block));
}

export function getMovementsByTag(tag: string): Movement[] {
  return allMovements.filter((m) => m.tags.includes(tag));
}

export function getProgressionChain(id: string): Movement[] {
  const chain: Movement[] = [];
  let current = getMovementById(id);
  while (current) {
    chain.unshift(current);
    current = current.progressionOf ? getMovementById(current.progressionOf) : undefined;
  }
  return chain;
}

export {
  strengthMovements,
  olyMovements,
  wodMovements,
  accessoryMovements,
  skillMovements,
  warmupMovements,
  cooldownMovements,
};
