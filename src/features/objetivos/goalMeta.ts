import { TrendingUp, Dumbbell, PersonStanding, Zap, Trophy, HeartPulse, type LucideIcon } from 'lucide-react';
import { strengthMovements, olyMovements, skillMovements } from '../../data/movements';
import type { Movement } from '../../data/movements/types';
import type { GoalType } from '../../data/athlete/types';

export interface GoalTypeMeta {
  label: string;
  Icon: LucideIcon;
  needsMovement: boolean;
  movementGroups: { label: string; movements: Movement[] }[];
}

export const GOAL_TYPE_META: Record<GoalType, GoalTypeMeta> = {
  'subir-pr': {
    label: 'Subir PR',
    Icon: TrendingUp,
    needsMovement: true,
    movementGroups: [
      { label: 'Fuerza', movements: strengthMovements },
      { label: 'Oly', movements: olyMovements },
    ],
  },
  'elevar-fuerza': {
    label: 'Elevar fuerza',
    Icon: Dumbbell,
    needsMovement: true,
    movementGroups: [{ label: 'Fuerza', movements: strengthMovements }],
  },
  'mejorar-gimnasticos': {
    label: 'Mejorar gimnásticos',
    Icon: PersonStanding,
    needsMovement: true,
    movementGroups: [{ label: 'Skill', movements: skillMovements }],
  },
  'mejorar-potencia': {
    label: 'Mejorar potencia',
    Icon: Zap,
    needsMovement: true,
    movementGroups: [{ label: 'Oly', movements: olyMovements }],
  },
  'preparar-competicion': {
    label: 'Preparar competición',
    Icon: Trophy,
    needsMovement: false,
    movementGroups: [],
  },
  'elevar-resistencia': {
    label: 'Elevar resistencia',
    Icon: HeartPulse,
    needsMovement: false,
    movementGroups: [],
  },
};

export const GOAL_TYPES = Object.keys(GOAL_TYPE_META) as GoalType[];
