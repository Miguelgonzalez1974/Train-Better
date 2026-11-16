import {
  BAR_X,
  BAR_Y,
  HANG,
  HS_HAND,
  L_FORE,
  L_SHANK,
  L_THIGH,
  L_TORSO,
  L_UPPER,
  RING_HAND,
  bodyFromHands,
  elbow,
  interpolate,
  standingBody,
  type DynShape,
  type FigurePose,
  type Keyframes,
  type MovementAnimation,
  type Point,
  type PropShape,
} from './movementAnimation';
import {
  ARMS_DOWN,
  DIP,
  EXT,
  FLOOR,
  HANG_KNEE,
  MID,
  OH_DEEP,
  OH_STAND,
  RACK,
  RACK_DEEP,
  START,
  lift,
  line,
  loadShape,
  makeAnim,
  twoLegPose,
} from './movementAnimationMore';

/**
 * Las animaciones de las variantes de fuerza, halterofilia y skill: tirones, split jerk, press estricto, pino sin pared, pike y
 * colgados. Las variantes que de perfil se ven igual que otro movimiento comparten dibujo (ver `movementAnimations.ts`).
 */

// ---------------------------------------------------------------------------------------------
// Barra: tirones, shrugs, press y split jerk
// ---------------------------------------------------------------------------------------------

const PULL_KF = (top: number[]): Keyframes => [
  [0, START],
  [0.5, START],
  [1.1, MID],
  [1.4, top],
  [1.9, top],
  [2.6, START],
  [3.0, START],
];
const HIGH_PULL = [0, 0, 0, 100, 15];
const MUSCLE_SNATCH: Keyframes = [
  [0, ARMS_DOWN],
  [0.5, ARMS_DOWN],
  [1.0, EXT],
  [1.4, OH_STAND],
  [2.0, OH_STAND],
  [2.8, ARMS_DOWN],
  [3.1, ARMS_DOWN],
];
const MUSCLE_CLEAN: Keyframes = [
  [0, ARMS_DOWN],
  [0.5, ARMS_DOWN],
  [1.0, EXT],
  [1.4, RACK],
  [2.0, RACK],
  [2.8, ARMS_DOWN],
  [3.1, ARMS_DOWN],
];
const BLOCK_PULL: Keyframes = [
  [0, HANG_KNEE],
  [0.4, HANG_KNEE],
  [1.1, [4, 14, 14, 0, 0]],
  [1.7, ARMS_DOWN],
  [2.2, ARMS_DOWN],
  [3.0, HANG_KNEE],
  [3.3, HANG_KNEE],
];
const STRICT_PRESS: Keyframes = [
  [0, RACK],
  [0.4, RACK],
  [1.3, OH_STAND],
  [1.8, OH_STAND],
  [2.7, RACK],
  [3.0, RACK],
];
const SOTS: Keyframes = [
  [0, RACK_DEEP],
  [0.5, RACK_DEEP],
  [1.4, OH_DEEP],
  [1.9, OH_DEEP],
  [2.8, RACK_DEEP],
  [3.1, RACK_DEEP],
];
const JERK_DIP: Keyframes = [
  [0, RACK],
  [0.5, RACK],
  [0.9, DIP],
  [1.2, DIP],
  [1.7, RACK],
  [2.2, RACK],
];

/** Shrug: de pie con la barra a la cadera, los talones suben y los hombros se encogen. */
function shrugPose(t: number): FigurePose {
  const k = interpolate(
    [
      [0, [0]],
      [0.5, [9]],
      [0.9, [9]],
      [1.5, [0]],
      [1.8, [0]],
    ],
    t,
  )[0];
  const p = standingBody([130, FLOOR - k], ARMS_DOWN);
  return { ...p, foot: [p.legs[0][0] - 6, p.legs[0][1], p.legs[0][0] + 18, FLOOR], dyn: loadShape('bar', p.hand, 20) };
}

/** Split jerk: la barra sube con el impulso y los pies se abren en tijera por debajo de ella. */
const SJ_RACK = [150, 140, 150, FLOOR, 150, FLOOR, 2, 75, 175];
const splitJerkKf: Keyframes = [
  [0, SJ_RACK],
  [0.4, SJ_RACK],
  [0.7, [150, 154, 150, FLOOR, 150, FLOOR, 2, 75, 175]],
  [1.0, [150, 130, 150, FLOOR, 150, FLOOR, 0, 150, 178]],
  [1.25, [150, 170, 206, FLOOR, 98, 232, 0, 180, 180]],
  [1.8, [150, 170, 206, FLOOR, 98, 232, 0, 180, 180]],
  [2.4, [150, 140, 150, FLOOR, 150, FLOOR, 0, 180, 180]],
  [3.0, [150, 140, 150, FLOOR, 150, FLOOR, 0, 180, 180]],
  [3.6, SJ_RACK],
  [3.9, SJ_RACK],
];

// ---------------------------------------------------------------------------------------------
// Pino sin pared y pike
// ---------------------------------------------------------------------------------------------

function freeHandstandPose(t: number): FigurePose {
  const sway = Math.sin((t / 2.6) * Math.PI * 2);
  const shoulder: Point = [150 + 2.5 * sway, 180.5];
  const a = 0.05 * sway;
  const up = (from: Point, len: number): Point => [from[0] + len * Math.sin(a), from[1] - len * Math.cos(a)];
  const hip = up(shoulder, L_TORSO);
  const knee = up(hip, L_THIGH);
  const ankle = up(knee, L_SHANK);
  const hand: Point = [HS_HAND[0], HS_HAND[1]];
  return {
    legs: [hip, knee, ankle],
    torso: [shoulder, hip],
    arm: [hand, elbow(hand, shoulder, L_FORE, L_UPPER, 'back'), shoulder],
    head: [shoulder[0] + 1, shoulder[1] + 22],
    foot: [ankle[0], ankle[1], ankle[0] + 7, ankle[1] - 2],
    hand,
  };
}

/** Pike: pies y manos en el suelo (o los pies en un cajón) y las caderas arriba; el hombro baja y sube. */
function pikePose(feet: Point, hands: Point, shoulder: Point): FigurePose {
  const leg = L_THIGH + L_SHANK;
  const d = Math.hypot(shoulder[0] - feet[0], shoulder[1] - feet[1]);
  const a = (leg * leg - L_TORSO * L_TORSO + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, leg * leg - a * a));
  const ux = (shoulder[0] - feet[0]) / d;
  const uy = (shoulder[1] - feet[1]) / d;
  const px = feet[0] + ux * a;
  const py = feet[1] + uy * a;
  const c1: Point = [px - uy * h, py + ux * h];
  const c2: Point = [px + uy * h, py - ux * h];
  const hip = c1[1] <= c2[1] ? c1 : c2;
  const knee: Point = [feet[0] + ((hip[0] - feet[0]) * L_SHANK) / leg, feet[1] + ((hip[1] - feet[1]) * L_SHANK) / leg];
  const dirx = (shoulder[0] - hip[0]) / L_TORSO;
  const diry = (shoulder[1] - hip[1]) / L_TORSO;
  return {
    legs: [feet, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(hands, shoulder, L_FORE, L_UPPER, 'back'), hands],
    head: [shoulder[0] + dirx * 22, shoulder[1] + diry * 22 + 4],
    foot: [feet[0], feet[1], feet[0] + 7, feet[1] + (FLOOR - feet[1] > 0 ? 3 : 0)],
    hand: hands,
  };
}
const PIKE_FEET: Point = [60, 236];
const PIKE_HANDS: Point = [160, FLOOR];
const pikeHold = (t: number) => pikePose(PIKE_FEET, PIKE_HANDS, [150, 182 + 0.8 * Math.sin((t / 2.4) * Math.PI * 2)]);
const pikePushKf: Keyframes = [
  [0, [182]],
  [1.0, [216]],
  [1.3, [216]],
  [2.2, [182]],
  [2.5, [182]],
];
const pikePush = (feet: Point) => (t: number) => pikePose(feet, PIKE_HANDS, [150 + 8 * ((interpolate(pikePushKf, t)[0] - 182) / 34), interpolate(pikePushKf, t)[0]]);

// ---------------------------------------------------------------------------------------------
// Colgados: balanceo, dominada activa y apoyo en anillas
// ---------------------------------------------------------------------------------------------

const SWING_ARCH = [146, 91.5, -12, -18, -30];
const SWING_HOLLOW = [158, 91.5, 16, 32, 26];
const swingKf: Keyframes = [
  [0, HANG],
  [0.6, SWING_ARCH],
  [1.2, SWING_HOLLOW],
  [1.8, SWING_ARCH],
  [2.4, HANG],
];
const hangPose = (shrug: number) => (t: number) => bodyFromHands([BAR_X, BAR_Y], [150, 91.5 - shrug * (0.5 - 0.5 * Math.cos((t / 2.4) * Math.PI * 2)), 0, 0, 0], 'down');
const SUPPORT_HAND: Point = RING_HAND;
const ringSupportHold = (t: number): FigurePose => bodyFromHands(SUPPORT_HAND, [150, 46.5 + 0.8 * Math.sin((t / 2.4) * Math.PI * 2), -4 + Math.sin((t / 2.4) * Math.PI * 2), -6, -30], 'back');

const barProps: PropShape[] = [line(62, BAR_Y, 250, BAR_Y)];
const ringProps: PropShape[] = [line(90, 10, 210, 10), line(150, 10, 150, SUPPORT_HAND[1] - 11, 'thin'), { kind: 'circle', cx: SUPPORT_HAND[0], cy: SUPPORT_HAND[1], r: 11, role: 'ring' }];
const pikeBox: PropShape[] = [line(30, 190, 92, 190), line(30, 190, 30, FLOOR), line(92, 190, 92, FLOOR)];

export const LIFT_ANIMATIONS: Record<string, MovementAnimation> = {
  // Barra
  'snatch-pull': lift(PULL_KF(EXT), 3.0, { load: 'bar', r: 22 }),
  'clean-pull': lift(PULL_KF(EXT), 3.0, { load: 'bar', r: 22 }),
  'snatch-high-pull': lift(PULL_KF(HIGH_PULL), 3.0, { load: 'bar', r: 22 }),
  'clean-high-pull': lift(PULL_KF(HIGH_PULL), 3.0, { load: 'bar', r: 22 }),
  'muscle-snatch': lift(MUSCLE_SNATCH, 3.1, { load: 'bar', r: 20 }),
  'muscle-clean': lift(MUSCLE_CLEAN, 3.1, { load: 'bar', r: 20 }),
  'block-pull': lift(BLOCK_PULL, 3.3, { load: 'bar', r: 22 }),
  'strict-press': lift(STRICT_PRESS, 3.0, { load: 'bar', r: 16 }),
  'sots-press': lift(SOTS, 3.1, { load: 'bar', r: 15 }),
  'jerk-dip-drill': lift(JERK_DIP, 2.2, { load: 'bar', r: 16 }),
  'snatch-shrug': makeAnim(shrugPose, 1.8),
  'clean-shrug': makeAnim(shrugPose, 1.8),
  'split-jerk': makeAnim((t) => twoLegPose(interpolate(splitJerkKf, t), (p): DynShape[] => loadShape('bar', p.hand, 15)), 3.9),
  // Skill
  'freestanding-handstand': makeAnim(freeHandstandPose, 2.6),
  'handstand-hold': makeAnim(freeHandstandPose, 2.6),
  'pike-hold': makeAnim(pikeHold, 2.4),
  'pike-push-up': makeAnim(pikePush(PIKE_FEET), 2.5),
  'box-pike-push-up': makeAnim(pikePush([60, 190]), 2.5, pikeBox),
  'kipping-swing-drill': makeAnim((t) => bodyFromHands([BAR_X, BAR_Y], interpolate(swingKf, t), 'down'), 2.4, barProps, false),
  'dead-hang': makeAnim(hangPose(4), 2.4, barProps, false),
  'scapular-pull-up': makeAnim(hangPose(14), 2.4, barProps, false),
  'ring-support-hold': makeAnim(ringSupportHold, 2.4, ringProps, false),
};

