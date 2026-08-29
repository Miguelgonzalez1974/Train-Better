import { getMovementById } from './index';
import type { Movement } from './types';

/**
 * Arboles de regresion de gimnasticos: para cada habilidad objetivo, la escalera ordenada de
 * escalones desde el mas facil hasta el movimiento objetivo. Todos los `movementId` resuelven a un
 * Movement real del catalogo (la tarjeta de skill renderiza `getMovementById` y descarta la entrada
 * si no resuelve). Un objetivo de tipo `mejorar-gimnasticos` cuyo movimiento coincide con un
 * `targetMovementId` de aqui hace que el motor programe el escalon que toca segun lo avanzado que
 * va el objetivo (ver `buildSkillBlock`).
 */

export interface SkillProgressionStep {
  /** id de un Movement real del catalogo (skill o wod). */
  movementId: string;
  /** En que fijarse en este escalon. */
  cue: string;
}

export interface SkillProgression {
  /** id del Movement objetivo — es el `movementId` que guarda el objetivo del atleta. */
  targetMovementId: string;
  /** Nombre legible del objetivo (para las notas). */
  targetName: string;
  /** De mas facil a mas dificil; el ultimo escalon es (casi siempre) el propio movimiento objetivo. */
  steps: SkillProgressionStep[];
}

export const SKILL_PROGRESSIONS: SkillProgression[] = [
  {
    targetMovementId: 'strict-pull-up',
    targetName: 'Dominada estricta',
    steps: [
      { movementId: 'dead-hang', cue: 'Cuelga activo 20-40s: escápulas abajo, costillas dentro, cuerpo hueco.' },
      { movementId: 'scapular-pull-up', cue: 'Solo el tramo escapular: sube y baja el pecho sin doblar los codos, 8-12 reps.' },
      { movementId: 'banded-pull-up', cue: 'Con banda, rango completo y bajada controlada (2-3s), 4-6 reps.' },
      { movementId: 'negative-pull-up', cue: 'Salta arriba y baja lo más lento posible (5s+), 4-5 reps.' },
      { movementId: 'strict-pull-up', cue: 'Reps estrictas, barbilla sobre la barra, sin balanceo. Suma una rep cada semana.' },
    ],
  },
  {
    targetMovementId: 'kipping-pull-up',
    targetName: 'Dominada kipping',
    steps: [
      { movementId: 'strict-pull-up', cue: 'Base de fuerza: sin 3-5 estrictas, el kipping solo tapa el hueco.' },
      { movementId: 'kipping-swing-drill', cue: 'Balanceo hueco/arco desde dead hang, hombros activos, sin tirar todavía.' },
      { movementId: 'kipping-pull-up', cue: 'Une el kip con el tirón: cierra cadera, barbilla pasa la barra, empuja para volver al arco.' },
    ],
  },
  {
    targetMovementId: 'chest-to-bar-pull-up',
    targetName: 'Pecho a barra',
    steps: [
      { movementId: 'kipping-pull-up', cue: 'Kipping consistente en series de 8-10 antes de subir el listón.' },
      { movementId: 'kipping-swing-drill', cue: 'Kip más agresivo: más cierre de cadera para ganar altura.' },
      { movementId: 'chest-to-bar-pull-up', cue: 'Contacto de pecho en la barra en cada rep — tira alto y temprano.' },
    ],
  },
  {
    targetMovementId: 'toes-to-bar',
    targetName: 'Toes to bar',
    steps: [
      { movementId: 'hollow-hold', cue: 'Hueco 20-40s: lumbar pegada al suelo — es la base de un T2B eficiente.' },
      { movementId: 'kipping-swing-drill', cue: 'Balanceo hueco/arco en la barra, hombros activos.' },
      { movementId: 'knees-to-elbow', cue: 'Rodillas a los codos con el kip, cierra cadera con fuerza.' },
      { movementId: 'toes-to-bar', cue: 'Extiende las rodillas al final: los pies tocan la barra juntos.' },
    ],
  },
  {
    targetMovementId: 'bar-muscle-up',
    targetName: 'Muscle-up en barra',
    steps: [
      { movementId: 'chest-to-bar-pull-up', cue: 'C2B explosivo llegando al esternón — sin eso no hay transición.' },
      { movementId: 'muscle-up-transition-drill', cue: 'Transición aislada con pies apoyados: gira rápido las muñecas sobre la barra.' },
      { movementId: 'banded-muscle-up', cue: 'MU completo con banda: tira alto y mete el cuerpo pronto.' },
      { movementId: 'bar-muscle-up', cue: 'Tirón alto + transición rápida + press de salida. Series cortas y frescas.' },
    ],
  },
  {
    targetMovementId: 'ring-muscle-up',
    targetName: 'Muscle-up en anillas',
    steps: [
      { movementId: 'false-grip-hang', cue: 'Cuelga en false grip 20-30s: muñeca por encima de la anilla desde el inicio.' },
      { movementId: 'ring-support-hold', cue: 'Soporte en anillas 20-30s, anillas giradas hacia fuera, hombros abajo.' },
      { movementId: 'muscle-up-transition-drill', cue: 'Transición con pies apoyados o banda, cierra el pecho rápido a las anillas.' },
      { movementId: 'banded-muscle-up', cue: 'MU de anillas con banda: false grip todo el rato, transición explosiva.' },
      { movementId: 'ring-muscle-up', cue: 'False grip + tirón al pecho + transición + dip de salida.' },
    ],
  },
  {
    targetMovementId: 'handstand-push-up',
    targetName: 'Handstand push-up',
    steps: [
      { movementId: 'pike-push-up', cue: 'Flexión en pica, caderas altas, cabeza por delante de las manos.' },
      { movementId: 'box-pike-push-up', cue: 'Pies en cajón, casi vertical: baja la cabeza a un almohadón, empuja fuerte.' },
      { movementId: 'hspu-negative', cue: 'En pino contra pared, baja controlado (5s+) a la cabeza y sal andando.' },
      { movementId: 'kipping-hspu', cue: 'Añade el kip de piernas para pasar el punto de estancamiento.' },
      { movementId: 'handstand-push-up', cue: 'Estrictas contra pared: rango completo, línea de cuerpo apretada.' },
    ],
  },
  {
    targetMovementId: 'handstand-walk',
    targetName: 'Handstand walk',
    steps: [
      { movementId: 'handstand-hold', cue: 'Pino en pared 30-60s con cuerpo hueco, sin arquear la lumbar.' },
      { movementId: 'hs-shoulder-taps', cue: 'En pino de cara a la pared, toca hombros alternos sin perder el equilibrio.' },
      { movementId: 'handstand-walk-progression', cue: 'Transferencias de peso y pasos cortos, con o sin pared.' },
      { movementId: 'handstand-walk', cue: 'Caminar libre: mira a las manos, pasos pequeños, corrige con los dedos.' },
    ],
  },
  {
    targetMovementId: 'pistol-squat',
    targetName: 'Pistol (sentadilla a una pierna)',
    steps: [
      { movementId: 'box-pistol-squat', cue: 'Baja a un cajón alto a una pierna y sube sin impulso; baja el cajón con el tiempo.' },
      { movementId: 'pistol-squat-progression', cue: 'Pistol asistido (banda o rig): rango completo y control abajo.' },
      { movementId: 'pistol-squat', cue: 'Pistol libre: talón pegado, pierna libre extendida, sin rebote abajo.' },
    ],
  },
  {
    targetMovementId: 'double-under',
    targetName: 'Double under',
    steps: [
      { movementId: 'single-under', cue: 'Singles relajados desde las muñecas, salto bajo y constante, 50-100 sin fallo.' },
      { movementId: 'double-under-practice', cue: 'Un doble cada 5-10 singles: un giro extra de muñeca, no saltar más alto.' },
      { movementId: 'double-under', cue: 'Dobles seguidos: muñecas rápidas, tronco quieto, ritmo antes que velocidad.' },
    ],
  },
  {
    targetMovementId: 'rope-climb',
    targetName: 'Trepa de cuerda',
    steps: [
      { movementId: 'rope-climb-technique', cue: 'Enganche de pies (J-hook / S-wrap) desde el suelo, de pie y sentado.' },
      { movementId: 'seated-rope-climb', cue: 'Sentado en el suelo, tira hasta ponerte de pie usando el enganche de pies.' },
      { movementId: 'rope-climb', cue: 'Trepa completa: pies primero, brazos guían, baja controlando con los pies.' },
    ],
  },
];

const BY_TARGET = new Map(SKILL_PROGRESSIONS.map((p) => [p.targetMovementId, p]));

/** Progresion cuyo objetivo es `movementId`, o undefined si ese movimiento no tiene arbol. */
export function getSkillProgressionFor(movementId: string): SkillProgression | undefined {
  return BY_TARGET.get(movementId);
}

/**
 * Escalon de la progresion segun `progress` (0-1, del propio objetivo): 0 -> el mas facil, cerca
 * de la fecha del objetivo -> el movimiento objetivo. El atleta ajusta el ritmo cambiando la fecha.
 *
 * `floorLevel` (0-1, opcional): nivel de partida que el atleta declara — el escalon nunca baja de
 * ahi aunque el progreso por fecha diga menos. `driver` indica cual de los dos manda hoy.
 */
export function skillProgressionStepAt(
  progression: SkillProgression,
  progress: number,
  floorLevel = 0,
): { step: SkillProgressionStep; index: number; total: number; driver: 'progress' | 'level' } {
  const total = progression.steps.length;
  const fromProgress = Math.floor(progress * total);
  const fromFloor = Math.floor(Math.min(1, Math.max(0, floorLevel)) * total);
  const index = Math.min(total - 1, Math.max(0, fromProgress, fromFloor));
  return { step: progression.steps[index], index, total, driver: fromFloor > fromProgress ? 'level' : 'progress' };
}

/** Movimientos objetivo (para el selector de "Mejorar gimnásticos" en Objetivos). */
export const SKILL_PROGRESSION_TARGETS: Movement[] = SKILL_PROGRESSIONS.map((p) => getMovementById(p.targetMovementId)).filter(
  (m): m is Movement => m !== undefined,
);
