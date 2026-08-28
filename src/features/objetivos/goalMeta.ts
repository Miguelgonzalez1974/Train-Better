import { TrendingUp, Dumbbell, PersonStanding, Zap, Trophy, HeartPulse, type LucideIcon } from 'lucide-react';
import { strengthMovements, olyMovements } from '../../data/movements';
import { SKILL_PROGRESSION_TARGETS } from '../../data/movements/skillProgressions';
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
    // Habilidad objetivo — el motor programa el escalon de la progresion que toca (skillProgressions.ts).
    movementGroups: [{ label: 'Habilidad objetivo', movements: SKILL_PROGRESSION_TARGETS }],
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

/**
 * Un color propio por tipo de objetivo — mismo criterio que `STRENGTH_METHOD_COLOR`: de un vistazo
 * se distingue cada objetivo en la lista sin leer el texto, y sin ningun tono rojo/rosa (reservado
 * en toda la app para dolor y avisos de peligro). "Preparar competición" comparte indigo con el
 * ciclo de halterofilia a proposito — ambos son, literalmente, preparacion de competicion.
 */
export const GOAL_TYPE_COLOR: Record<GoalType, string> = {
  'subir-pr': '#d4af37',
  'elevar-fuerza': '#38bdf8',
  'mejorar-gimnasticos': '#a78bfa',
  'mejorar-potencia': '#fbbf24',
  'preparar-competicion': '#6366f1',
  'elevar-resistencia': '#2dd4bf',
};
