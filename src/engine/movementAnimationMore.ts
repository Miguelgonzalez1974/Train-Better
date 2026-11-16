import {
  BAR_X,
  BAR_Y,
  BMU_BAR,
  BMU_KF,
  BODY_LENGTH,
  BURPEE_CROUCH,
  BURPEE_PLANK_DOWN,
  BURPEE_PLANK_UP,
  BURPEE_SQUAT,
  BURPEE_STAND,
  DEADLIFT_KF,
  HANG,
  HS_HAND,
  HS_WALL,
  KIP_ARCH,
  L_FORE,
  L_SHANK,
  L_THIGH,
  L_TORSO,
  L_UPPER,
  RAD,
  THRUSTER_KF,
  at,
  bodyFromHands,
  ease,
  elbow,
  interpolate,
  mixPoses,
  plankPose,
  standingBody,
  type DynShape,
  type FigurePose,
  type Keyframes,
  type MovementAnimation,
  type Point,
  type PropShape,
} from './movementAnimation';

/**
 * Las animaciones del resto de movimientos (levantamientos, burpees, zancadas, saltos al cajón, abdominales, colgados, remo, esquí, cuerda,
 * acarreos, trineo…). Todas usan las piezas de `movementAnimation.ts`: cada una elige su anclaje y da sus posturas; el cuadro visible se
 * calcula solo a partir de lo que recorre el muñeco.
 */

type Load = 'bar' | 'db' | 'kb' | 'none';
export const FLOOR = 238;

/** La carga que lleva el muñeco, como pieza móvil (`none` = ninguna). */
export function loadShape(load: Load, at: Point, r = 18): DynShape[] {
  if (load === 'bar') return [{ kind: 'circle', cx: at[0], cy: at[1], r, role: 'plate' }];
  if (load === 'db') return [{ kind: 'circle', cx: at[0], cy: at[1], r: 9, role: 'plate' }];
  if (load === 'kb') return [{ kind: 'circle', cx: at[0], cy: at[1], r: 11, role: 'ball' }];
  return [];
}

function propPoints(props: PropShape[]): Point[] {
  return props.flatMap((p): Point[] => (p.kind === 'line' ? [[p.x1, p.y1], [p.x2, p.y2]] : [[p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]]));
}

/** El cuadro visible a partir de todo lo que recorre el muñeco (y el material fijo), con un margen. */
export function fitBox(pose: (t: number) => FigurePose, duration: number, props: PropShape[], withFloor: boolean): [number, number, number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const add = (p: Point, r = 0) => {
    minX = Math.min(minX, p[0] - r);
    maxX = Math.max(maxX, p[0] + r);
    minY = Math.min(minY, p[1] - r);
    maxY = Math.max(maxY, p[1] + r);
  };
  for (const p of propPoints(props)) add(p);
  if (withFloor) add([0, FLOOR + 2]);
  for (let i = 0; i <= 90; i++) {
    const pose_ = pose((duration * i) / 90);
    [...pose_.legs, ...pose_.torso, ...pose_.arm, ...(pose_.legs2 ?? []), ...(pose_.arm2 ?? [])].forEach((p) => add(p));
    add(pose_.head, 12);
    for (const d of pose_.dyn ?? []) {
      if (d.kind === 'circle') add([d.cx, d.cy], d.r + 2);
      else if (d.kind === 'polyline') d.points.forEach((p) => add(p));
      else if (d.role !== 'tick') {
        add([d.x1, d.y1]);
        add([d.x2, d.y2]);
      }
    }
  }
  const m = 10;
  return [Math.floor(minX - m), Math.floor(minY - m), Math.ceil(maxX - minX + 2 * m), Math.ceil(maxY - minY + 2 * m)];
}

/** Una animación con el cuadro calculado y, si hay suelo, la línea del suelo a todo lo ancho del cuadro. */
export function makeAnim(pose: (t: number) => FigurePose, duration: number, props: PropShape[] = [], floor = true): MovementAnimation {
  const box = fitBox(pose, duration, props, floor);
  const all: PropShape[] = floor ? [{ kind: 'line', x1: box[0], y1: FLOOR, x2: box[0] + box[2], y2: FLOOR, role: 'floor' }, ...props] : props;
  return { box, duration, props: all, pose };
}

export const line = (x1: number, y1: number, x2: number, y2: number, role: 'floor' | 'frame' | 'thin' = 'frame'): PropShape => ({ kind: 'line', x1, y1, x2, y2, role });

// ---------------------------------------------------------------------------------------------
// Levantamientos de pie (barra, mancuerna, kettlebell): cuerpo de pie con los pies fijos y la carga en la mano
// ---------------------------------------------------------------------------------------------

export const ARMS_DOWN = [0, 0, 0, 0, 0];
export const START = [32, 82, 42, 0, 0];
const MID = [16, 62, 38, 0, 0];
const EXT = [2, 6, -3, 80, 30];
export const RACK = [0, 0, 2, 75, 175];
const RACK_DEEP = [55, 105, 14, 75, 175];
const RACK_QUARTER = [20, 45, 8, 75, 175];
export const OH_STAND = [0, 0, 0, 180, 180];
const OH_DEEP = [55, 105, 22, 178, 180];
const OH_QUARTER = [22, 50, 8, 178, 180];
const HANG_KNEE = [8, 40, 50, 0, 0];
const HANG_ABOVE = [4, 25, 35, 0, 0];
const DIP = [14, 30, 2, 75, 175];

interface LiftOptions {
  load: Load;
  /** Radio del disco de la barra. */
  r?: number;
  /** Dónde va la carga si no es la mano (la barra a la espalda, por ejemplo). */
  loadAt?: (pose: FigurePose) => Point;
  ankle?: Point;
  props?: PropShape[];
}

export function lift(kf: Keyframes, duration: number, o: LiftOptions): MovementAnimation {
  const ankle = o.ankle ?? [130, FLOOR];
  const pose = (t: number): FigurePose => {
    const p = standingBody(ankle, interpolate(kf, t));
    return { ...p, dyn: loadShape(o.load, o.loadAt ? o.loadAt(p) : p.hand, o.r) };
  };
  return makeAnim(pose, duration, o.props);
}

const cleanKf = (catchPose: number[]): Keyframes => [
  [0, START],
  [0.5, START],
  [1.1, MID],
  [1.35, EXT],
  [1.7, catchPose],
  [2.3, RACK],
  [2.8, RACK],
  [3.4, ARMS_DOWN],
  [4.0, START],
  [4.3, START],
];
const hangCleanKf = (from: number[], catchPose: number[] = RACK_QUARTER): Keyframes => [
  [0, from],
  [0.4, from],
  [0.9, EXT],
  [1.3, catchPose],
  [1.9, RACK],
  [2.4, RACK],
  [3.0, from],
  [3.3, from],
];
const snatchKf: Keyframes = [
  [0, START],
  [0.4, START],
  [0.95, MID],
  [1.2, EXT],
  [1.5, OH_DEEP],
  [2.2, OH_STAND],
  [2.7, OH_STAND],
  [3.4, ARMS_DOWN],
  [4.0, START],
  [4.3, START],
];
const hangSnatchKf = (from: number[], catchPose: number[] = OH_QUARTER): Keyframes => [
  [0, from],
  [0.4, from],
  [0.85, EXT],
  [1.2, catchPose],
  [1.9, OH_STAND],
  [2.4, OH_STAND],
  [3.1, from],
  [3.4, from],
];
const dbSnatchKf: Keyframes = [
  [0, START],
  [0.4, START],
  [0.9, MID],
  [1.1, EXT],
  [1.4, OH_QUARTER],
  [1.9, OH_STAND],
  [2.4, OH_STAND],
  [3.0, ARMS_DOWN],
  [3.6, START],
  [3.9, START],
];
const pushPressKf: Keyframes = [
  [0, RACK],
  [0.4, RACK],
  [0.65, DIP],
  [0.95, [2, 3, 0, 150, 178]],
  [1.3, OH_STAND],
  [1.8, OH_STAND],
  [2.4, RACK],
  [2.8, RACK],
];
const pushJerkKf: Keyframes = [
  [0, RACK],
  [0.4, RACK],
  [0.65, DIP],
  [0.95, [6, 10, 0, 130, 178]],
  [1.2, OH_QUARTER],
  [1.6, OH_STAND],
  [2.1, OH_STAND],
  [2.7, RACK],
  [3.1, RACK],
];
const cleanAndJerkKf = (catchPose: number[]): Keyframes => [
  [0, START],
  [0.4, START],
  [0.9, MID],
  [1.15, EXT],
  [1.45, catchPose],
  [1.9, RACK],
  [2.2, RACK],
  [2.45, DIP],
  [2.7, [6, 10, 0, 130, 178]],
  [2.95, OH_QUARTER],
  [3.3, OH_STAND],
  [3.8, OH_STAND],
  [4.4, RACK],
  [5.0, START],
  [5.3, START],
];
const clusterKf: Keyframes = [
  [0, START],
  [0.5, START],
  [1.1, MID],
  [1.35, EXT],
  [1.7, RACK_DEEP],
  [2.0, RACK_DEEP],
  [2.45, [4, 4, 0, 115, 178]],
  [2.85, OH_STAND],
  [3.3, OH_STAND],
  [4.0, RACK],
  [4.6, START],
  [4.9, START],
];
const frontSquatKf: Keyframes = [
  [0, RACK],
  [0.9, RACK_DEEP],
  [1.2, RACK_DEEP],
  [2.1, RACK],
  [2.5, RACK],
];
const overheadSquatKf: Keyframes = [
  [0, OH_STAND],
  [1.0, OH_DEEP],
  [1.3, OH_DEEP],
  [2.3, OH_STAND],
  [2.7, OH_STAND],
];
// Barra a la espalda: los codos atrás y la barra sobre el hombro.
const BS_STAND = [0, 0, 2, -100, -160];
const backSquatKf: Keyframes = [
  [0, BS_STAND],
  [0.9, [50, 100, 22, -100, -160]],
  [1.2, [50, 100, 22, -100, -160]],
  [2.1, BS_STAND],
  [2.5, BS_STAND],
];
const goodMorningKf: Keyframes = [
  [0, BS_STAND],
  [1.0, [4, 50, 70, -100, -160]],
  [1.3, [4, 50, 70, -100, -160]],
  [2.3, BS_STAND],
  [2.7, BS_STAND],
];
const onBack = (p: FigurePose): Point => [p.torso[1][0] - 5, p.torso[1][1] - 3];
const airSquatKf: Keyframes = [
  [0, ARMS_DOWN],
  [0.9, [55, 105, 26, 85, 85]],
  [1.1, [55, 105, 26, 85, 85]],
  [2.0, ARMS_DOWN],
  [2.3, ARMS_DOWN],
];
const sdhpKf: Keyframes = [
  [0, START],
  [0.4, START],
  [1.0, [0, 0, 0, 100, 15]],
  [1.6, START],
  [2.0, START],
];
const GOBLET = [0, 0, 2, 20, 115];
const gobletKf: Keyframes = [
  [0, GOBLET],
  [0.9, [55, 105, 12, 20, 115]],
  [1.2, [55, 105, 12, 20, 115]],
  [2.1, GOBLET],
  [2.5, GOBLET],
];
const KB_BACK = [10, 50, 50, -25, -25];
const swingKf = (up: number[]): Keyframes => [
  [0, KB_BACK],
  [0.55, up],
  [0.7, up],
  [1.3, KB_BACK],
];
const BICEP: Keyframes = [
  [0, ARMS_DOWN],
  [0.8, [0, 0, 0, 0, 150]],
  [1.0, [0, 0, 0, 0, 150]],
  [1.8, ARMS_DOWN],
  [2.0, ARMS_DOWN],
];
const ROW_HINGE = [8, 55, 72, 0, 0];
const singleRowKf: Keyframes = [
  [0, ROW_HINGE],
  [0.7, [8, 55, 72, -75, -5]],
  [0.9, [8, 55, 72, -75, -5]],
  [1.6, ROW_HINGE],
  [1.9, ROW_HINGE],
];

const DB_THRUSTER = THRUSTER_KF;

// ---------------------------------------------------------------------------------------------
// Burpees (y sus variantes): se encadenan de pie, plancha, pecho al suelo y salto, interpolando punto a punto
// ---------------------------------------------------------------------------------------------

/** Pasa a un orden «de pie» (tobillo → rodilla → cadera, cadera → hombro, hombro → codo → mano) una postura colgada. */
function standingOrder(p: FigurePose): FigurePose {
  return { ...p, legs: [...p.legs].reverse(), torso: [...p.torso].reverse(), arm: [...p.arm].reverse() };
}

const BURPEE_JUMP = standingBody([170, 196], [0, 0, 0, 170, 176]);

const burpeeBase: [number, FigurePose][] = [
  [0, BURPEE_STAND],
  [0.4, BURPEE_SQUAT],
  [0.7, BURPEE_PLANK_UP],
  [1.1, BURPEE_PLANK_DOWN],
  [1.5, BURPEE_PLANK_UP],
  [1.8, BURPEE_SQUAT],
  [2.1, BURPEE_STAND],
];

function poseThrough(kf: [number, FigurePose][], t: number): FigurePose {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, a] = kf[i];
    const [t1, b] = kf[i + 1];
    if (t >= t0 && t <= t1) return mixPoses(a, b, ease((t - t0) / (t1 - t0)));
  }
  return kf[kf.length - 1][1];
}

function burpeeAnim(kf: [number, FigurePose][], props: PropShape[] = [], load: Load = 'none'): MovementAnimation {
  const duration = kf[kf.length - 1][0];
  const pose = (t: number): FigurePose => {
    const p = poseThrough(kf, t);
    return load === 'none' ? p : { ...p, dyn: loadShape(load, p.hand) };
  };
  return makeAnim(pose, duration, props);
}

const burpeeKf: [number, FigurePose][] = [...burpeeBase, [2.45, BURPEE_JUMP], [2.8, BURPEE_CROUCH], [3.1, BURPEE_STAND]];

const HANG_STAND_BAR: Point = [170, BAR_Y];
const burpeePullUpKf: [number, FigurePose][] = [
  ...burpeeBase,
  [2.35, standingOrder(bodyFromHands(HANG_STAND_BAR, [170, 91.5, 0, 0, 0], 'down'))],
  [2.9, standingOrder(bodyFromHands(HANG_STAND_BAR, [158, 40, 12, 10, -8], 'down'))],
  [3.2, standingOrder(bodyFromHands(HANG_STAND_BAR, [158, 40, 12, 10, -8], 'down'))],
  [3.8, standingOrder(bodyFromHands(HANG_STAND_BAR, [170, 91.5, 0, 0, 0], 'down'))],
  [4.1, BURPEE_STAND],
];

const devilsPressKf: [number, FigurePose][] = [
  ...burpeeBase,
  [2.4, standingBody([170, FLOOR], [14, 40, 30, 50, 60])],
  [2.9, standingBody([170, FLOOR], [0, 0, 0, 178, 180])],
  [3.4, standingBody([170, FLOOR], [0, 0, 0, 178, 180])],
  [4.0, BURPEE_STAND],
];

const BOX_TOP = 190;
export const boxProps = (x1: number, x2: number): PropShape[] => [line(x1, BOX_TOP, x2, BOX_TOP), line(x1, BOX_TOP, x1, FLOOR), line(x2, BOX_TOP, x2, FLOOR)];
const crouch = (x: number, y = FLOOR) => standingBody([x, y], [20, 40, 20, 0, 0]);
const stand = (x: number, y = FLOOR) => standingBody([x, y], [0, 0, 0, 0, 0]);
const air = (x: number, y: number) => standingBody([x, y], [35, 75, 2, 25, 20]);

const boxJumpKf: [number, FigurePose][] = [
  [0, stand(100)],
  [0.5, standingBody([100, FLOOR], [25, 45, 35, -50, -50])],
  [0.85, air(150, 176)],
  [1.1, standingBody([172, BOX_TOP], [30, 55, 20, 75, 75])],
  [1.5, stand(174, BOX_TOP)],
  [2.0, stand(174, BOX_TOP)],
  [2.3, air(135, 196)],
  [2.65, crouch(100)],
  [3.0, stand(100)],
];
const boxJumpOverKf: [number, FigurePose][] = [
  [0, stand(100)],
  [0.5, standingBody([100, FLOOR], [25, 45, 35, -50, -50])],
  [0.85, air(150, 176)],
  [1.1, standingBody([172, BOX_TOP], [30, 55, 20, 75, 75])],
  [1.4, crouch(174, BOX_TOP)],
  [1.75, air(222, 176)],
  [2.05, crouch(262)],
  [2.35, stand(262)],
  [2.65, crouch(262)],
  [3.0, air(222, 176)],
  [3.3, crouch(172, BOX_TOP)],
  [3.6, crouch(174, BOX_TOP)],
  [3.95, air(135, 196)],
  [4.25, crouch(100)],
  [4.55, stand(100)],
];
const burpeeBoxJumpOverKf: [number, FigurePose][] = [
  ...burpeeBase,
  [2.4, crouch(170)],
  [2.75, air(222, 172)],
  [3.05, standingBody([262, BOX_TOP], [30, 55, 20, 75, 75])],
  [3.4, stand(264, BOX_TOP)],
  [3.7, crouch(264, BOX_TOP)],
  [4.0, air(222, 196)],
  [4.3, crouch(170)],
  [4.55, BURPEE_STAND],
];

// ---------------------------------------------------------------------------------------------
// Dos piernas libres: zancadas, subidas al cajón, marcha, trineo
// ---------------------------------------------------------------------------------------------

/** Pierna con la cadera en `hip` y el pie en `foot`: la rodilla dobla hacia delante. */
export function legTo(hip: Point, foot: Point): { legs: Point[]; foot: [number, number, number, number] } {
  return { legs: [foot, elbow(hip, foot, L_THIGH, L_SHANK, 'front'), hip], foot: [foot[0] - 3, foot[1], foot[0] + 14, foot[1]] };
}

/** [cadera x, cadera y, pie cercano x, y, pie lejano x, y, inclinación del tronco, brazo, antebrazo] */
export function twoLegPose(p: number[], extra: (pose: FigurePose) => DynShape[] = () => []): FigurePose {
  const hip: Point = [p[0], p[1]];
  const near = legTo(hip, [p[2], p[3]]);
  const far = legTo(hip, [p[4], p[5]]);
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(p[6] * RAD), hip[1] - L_TORSO * Math.cos(p[6] * RAD)];
  const el = at(shoulder, L_UPPER, p[7]);
  const hand = at(el, L_FORE, p[8]);
  const pose: FigurePose = {
    legs: near.legs,
    foot: near.foot,
    legs2: far.legs,
    foot2: far.foot,
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + Math.sin(p[6] * RAD) * 22 + 2, shoulder[1] - Math.cos(p[6] * RAD) * 22],
    hand,
  };
  return { ...pose, dyn: extra(pose) };
}

const LUNGE_STAND = [150, 140, 150, FLOOR, 150, FLOOR, 0, 0, 0];
const lungeKf = (arms: [number, number]): Keyframes => [
  [0, [...LUNGE_STAND.slice(0, 7), ...arms]],
  [0.5, [150, 140, 205, 218, 150, FLOOR, 0, ...arms]],
  [0.8, [150, 142, 205, FLOOR, 150, FLOOR, 0, ...arms]],
  [1.3, [150, 186, 205, FLOOR, 112, 232, 0, ...arms]],
  [1.7, [150, 186, 205, FLOOR, 112, 232, 0, ...arms]],
  [2.3, [150, 142, 205, FLOOR, 150, FLOOR, 0, ...arms]],
  [2.8, [150, 140, 150, FLOOR, 150, FLOOR, 0, ...arms]],
  [3.0, [150, 140, 150, FLOOR, 150, FLOOR, 0, ...arms]],
];
const reverseLungeKf: Keyframes = [
  [0, LUNGE_STAND],
  [0.5, [150, 140, 150, FLOOR, 97, 218, 0, 0, 0]],
  [0.8, [150, 142, 150, FLOOR, 97, FLOOR, 0, 0, 0]],
  [1.3, [150, 186, 160, FLOOR, 97, 232, 0, 0, 0]],
  [1.7, [150, 186, 160, FLOOR, 97, 232, 0, 0, 0]],
  [2.3, [150, 142, 150, FLOOR, 97, FLOOR, 0, 0, 0]],
  [2.8, LUNGE_STAND],
  [3.0, LUNGE_STAND],
];
const STEP_BOX_TOP = 192;
const stepUpKf: Keyframes = [
  [0, [120, 140, 120, FLOOR, 120, FLOOR, 0, 0, 0]],
  [0.5, [128, 141, 185, STEP_BOX_TOP, 120, FLOOR, 4, 0, 0]],
  [1.1, [185, 95, 185, STEP_BOX_TOP, 182, STEP_BOX_TOP, 0, 0, 0]],
  [1.6, [185, 95, 185, STEP_BOX_TOP, 182, STEP_BOX_TOP, 0, 0, 0]],
  [2.2, [150, 120, 185, STEP_BOX_TOP, 138, 215, 2, 0, 0]],
  [2.8, [120, 140, 120, FLOOR, 120, FLOOR, 0, 0, 0]],
  [3.0, [120, 140, 120, FLOOR, 120, FLOOR, 0, 0, 0]],
];

function lungeAnim(kf: Keyframes, duration: number, load: Load = 'none', props: PropShape[] = []): MovementAnimation {
  return makeAnim((t) => twoLegPose(interpolate(kf, t), (p) => loadShape(load, p.hand, 14)), duration, props);
}

/** Rayitas en el suelo que pasan hacia atrás, para dar sensación de avance. */
export function groundTicks(t: number, duration: number, from: number, span: number): DynShape[] {
  const out: DynShape[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (((i * (span / 3) - span * (t / duration)) % span) + span) % span;
    out.push({ kind: 'line', x1: from + x, y1: FLOOR + 6, x2: from + x + 22, y2: FLOOR + 6, role: 'tick' });
  }
  return out;
}

/** Marcha: pasos cortos con las dos piernas a contrafase. */
function walkPose(t: number, duration: number, mode: 'farmers' | 'waiters' | 'overhead' | 'sandbag' | 'yoke'): FigurePose {
  const phase = (360 * t) / duration;
  const hx = 140;
  const hip: Point = [hx, 140 + 2 * Math.cos(2 * phase * RAD)];
  const foot = (deg: number): Point => [hx + 24 * Math.sin(deg * RAD), FLOOR - 12 * Math.max(0, Math.cos(deg * RAD))];
  const arms: [number, number] = mode === 'overhead' || mode === 'waiters' ? [180, 180] : mode === 'sandbag' ? [70, 110] : [0, 0];
  const p = twoLegPose([hx, hip[1], ...foot(phase), ...foot(phase + 180), 2, ...arms]);
  const shoulder = p.torso[1];
  let dyn: DynShape[];
  if (mode === 'farmers') dyn = [{ kind: 'circle', cx: p.hand[0], cy: p.hand[1] + 6, r: 12, role: 'plate' }];
  else if (mode === 'waiters') dyn = [{ kind: 'circle', cx: p.hand[0], cy: p.hand[1] - 8, r: 11, role: 'ball' }];
  else if (mode === 'overhead') dyn = [{ kind: 'circle', cx: p.hand[0], cy: p.hand[1], r: 14, role: 'plate' }];
  else if (mode === 'sandbag') dyn = [{ kind: 'circle', cx: shoulder[0] + 22, cy: shoulder[1] + 16, r: 17, role: 'ball' }];
  else dyn = [{ kind: 'circle', cx: shoulder[0] - 4, cy: shoulder[1] - 2, r: 18, role: 'plate' }];
  return { ...p, dyn: [...groundTicks(t, duration, 60, 180), ...dyn] };
}

const walkAnim = (mode: Parameters<typeof walkPose>[2]): MovementAnimation => makeAnim((t) => walkPose(t, 1.2, mode), 1.2, []);

// Trineo: el cuerpo inclinado empuja con los brazos estirados sobre el trineo y las piernas a contrafase.
const SLED_HAND: Point = [206, 122];
function sledPose(t: number): FigurePose {
  const duration = 1.2;
  const phase = (360 * t) / duration;
  const hip: Point = [120, 142 + 2 * Math.cos(2 * phase * RAD)];
  const lean = 52;
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(lean * RAD), hip[1] - L_TORSO * Math.cos(lean * RAD)];
  const foot = (deg: number): Point => [hip[0] - 14 + 26 * Math.sin(deg * RAD), FLOOR - 10 * Math.max(0, Math.cos(deg * RAD))];
  const near = legTo(hip, foot(phase));
  const far = legTo(hip, foot(phase + 180));
  const el = elbow(SLED_HAND, shoulder, L_FORE, L_UPPER, 'down');
  return {
    legs: near.legs,
    foot: near.foot,
    legs2: far.legs,
    foot2: far.foot,
    torso: [hip, shoulder],
    arm: [shoulder, el, SLED_HAND],
    head: [shoulder[0] + Math.sin(lean * RAD) * 22 + 6, shoulder[1] - Math.cos(lean * RAD) * 22],
    hand: SLED_HAND,
    dyn: groundTicks(t, duration, 40, 210),
  };
}

// ---------------------------------------------------------------------------------------------
// Suelo y máquinas: abdominales, GHD, V-up, L-sit, planchas, banco
// ---------------------------------------------------------------------------------------------

export const dir = (deg: number): Point => [Math.cos(deg * RAD), -Math.sin(deg * RAD)];
export const plus = (a: Point, d: Point, k: number): Point => [a[0] + d[0] * k, a[1] + d[1] * k];

/** Abdominal en el suelo: tronco que se levanta (θ) y brazos desde arriba de la cabeza hasta los pies (ψ). */
function abmatPose(p: number[]): FigurePose {
  const hip: Point = [150, 230];
  const shoulder = plus(hip, dir(180 - p[0]), L_TORSO);
  const hand = plus(shoulder, dir(p[1]), L_UPPER + L_FORE);
  const el = plus(shoulder, dir(p[1]), L_UPPER);
  const ankle: Point = [108, 236];
  return {
    legs: [ankle, elbow(hip, ankle, L_THIGH, L_SHANK, 'up'), hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: plus(shoulder, dir(180 - p[0]), 22),
    foot: [ankle[0] - 8, ankle[1], ankle[0] + 6, ankle[1]],
    hand,
  };
}
const ABMAT: Keyframes = [
  [0, [6, 175]],
  [0.9, [100, -10]],
  [1.1, [100, -10]],
  [2.0, [6, 175]],
  [2.2, [6, 175]],
];

/** GHD: la cadera sobre la almohadilla y los pies fijos; el tronco gira alrededor de la cadera. */
const GHD_HIP: Point = [150, 150];
function ghdPose(p: number[]): FigurePose {
  const shoulder = plus(GHD_HIP, dir(p[0]), L_TORSO);
  const hand = plus(shoulder, dir(p[1]), L_UPPER + L_FORE);
  const el = plus(shoulder, dir(p[1]), L_UPPER);
  const knee: Point = [GHD_HIP[0] + L_THIGH, GHD_HIP[1]];
  const ankle: Point = [GHD_HIP[0] + L_THIGH + L_SHANK, GHD_HIP[1]];
  return {
    legs: [ankle, knee, GHD_HIP],
    torso: [GHD_HIP, shoulder],
    arm: [shoulder, el, hand],
    head: plus(shoulder, dir(p[0]), 22),
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 10],
    hand,
  };
}
const ghdProps: PropShape[] = [line(134, 160, 172, 160), line(150, 160, 150, FLOOR), line(238, 120, 238, 172), line(238, 172, 238, FLOOR), line(120, FLOOR, 262, FLOOR)];
const GHD_SITUP: Keyframes = [
  [0, [215, 215]],
  [0.9, [35, -25]],
  [1.1, [35, -25]],
  [2.0, [215, 215]],
  [2.3, [215, 215]],
];
const GHD_EXT: Keyframes = [
  [0, [268, 268]],
  [0.9, [182, 182]],
  [1.1, [182, 182]],
  [2.0, [268, 268]],
  [2.3, [268, 268]],
];

const VUP_HIP: Point = [150, 230];
function vUpPose(p: number[]): FigurePose {
  const shoulder = plus(VUP_HIP, dir(180 - p[0]), L_TORSO);
  const hand = plus(shoulder, dir(p[2]), L_UPPER + L_FORE);
  const knee = plus(VUP_HIP, dir(p[1]), L_THIGH);
  const ankle = plus(VUP_HIP, dir(p[1]), L_THIGH + L_SHANK);
  return {
    legs: [ankle, knee, VUP_HIP],
    torso: [VUP_HIP, shoulder],
    arm: [shoulder, plus(shoulder, dir(p[2]), L_UPPER), hand],
    head: plus(shoulder, dir(180 - p[0]), 22),
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 4],
    hand,
  };
}
const VUP: Keyframes = [
  [0, [6, 6, 175]],
  [0.9, [58, 58, 26]],
  [1.1, [58, 58, 26]],
  [2.0, [6, 6, 175]],
  [2.2, [6, 6, 175]],
];

const L_HAND: Point = [150, FLOOR];
function lSitPose(t: number): FigurePose {
  const k = interpolate(
    [
      [0, [-35]],
      [0.7, [3]],
      [1.8, [3]],
      [2.4, [-35]],
      [2.6, [-35]],
    ],
    t,
  )[0];
  const shoulder: Point = [150, 180.5];
  const hip: Point = [150, 232.5];
  const knee = plus(hip, dir(k), L_THIGH);
  const ankle = plus(hip, dir(k), L_THIGH + L_SHANK);
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, [150, 209], L_HAND],
    head: [shoulder[0] + 2, shoulder[1] - 22],
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 8],
    hand: L_HAND,
  };
}

const BENCH_HIP: Point = [152, 186];
function benchPose(t: number, kf: Keyframes, load: Load): FigurePose {
  const p = interpolate(kf, t);
  const shoulder: Point = [100, 186];
  const hand: Point = [p[0], p[1]];
  const foot: Point = [205, FLOOR];
  return {
    legs: [foot, elbow(BENCH_HIP, foot, L_THIGH, L_SHANK, 'up'), BENCH_HIP],
    torso: [BENCH_HIP, shoulder],
    arm: [shoulder, elbow(hand, shoulder, L_FORE, L_UPPER, 'front'), hand],
    head: [shoulder[0] - 22, shoulder[1] - 4],
    foot: [foot[0] - 4, foot[1], foot[0] + 12, foot[1]],
    hand,
    dyn: loadShape(load, hand, 16),
  };
}
const BENCH_KF: Keyframes = [
  [0, [100, 128]],
  [0.9, [108, 172]],
  [1.1, [108, 172]],
  [2.0, [100, 128]],
  [2.3, [100, 128]],
];
export const benchProps: PropShape[] = [line(80, 196, 178, 196), line(92, 196, 92, FLOOR), line(168, 196, 168, FLOOR)];

const PLANK_ANKLE: Point = [65, 234];
const PLANK_HAND: Point = [205, 238];

// ---------------------------------------------------------------------------------------------
// Colgados y cuerda
// ---------------------------------------------------------------------------------------------

const STRICT_TOP = [128, 40, 8, 6, -4];
const STRICT_KF: Keyframes = [
  [0, HANG],
  [1.1, STRICT_TOP],
  [1.5, STRICT_TOP],
  [2.7, HANG],
  [3.0, HANG],
];
const K2E_TUCK = [150, 91.5, 40, 150, 10];
const K2E_KF: Keyframes = [
  [0, HANG],
  [0.5, KIP_ARCH],
  [1.0, [158, 91.5, 18, 35, 32]],
  [1.5, K2E_TUCK],
  [1.8, K2E_TUCK],
  [2.6, HANG],
  [2.9, HANG],
];

const ROPE_X = 150;
const ROPE_HAND: Point = [ROPE_X, 40];
const ropePose =
  (reach: number[], pull: number[], pinch: number[], duration: number) =>
  (t: number): FigurePose => {
    const kf: Keyframes = [
      [0, reach],
      [duration * 0.4, pull],
      [duration * 0.65, pinch],
      [duration, reach],
    ];
    const pose = bodyFromHands(ROPE_HAND, interpolate(kf, t), 'down');
    // Las marcas de la cuerda bajan mientras el cuerpo sube.
    const ticks: DynShape[] = [];
    for (let i = 0; i < 6; i++) {
      const y = ((i * 44 + 44 * (t / duration)) % 264) - 8;
      ticks.push({ kind: 'line', x1: ROPE_X - 7, y1: y, x2: ROPE_X + 7, y2: y, role: 'tick' });
    }
    return { ...pose, dyn: ticks };
  };

// ---------------------------------------------------------------------------------------------
// Otros: esquí, pistol, pino, pared, banco de remo
// ---------------------------------------------------------------------------------------------

const SKI_TOP = [0, 0, 0, 150, 160];
const SKI_BOTTOM = [20, 50, 55, -10, -10];
const SKI_KF: Keyframes = [
  [0, SKI_TOP],
  [0.8, SKI_BOTTOM],
  [1.0, SKI_BOTTOM],
  [1.6, SKI_TOP],
  [1.8, SKI_TOP],
];
const SKI_TOP_ANCHOR: Point = [238, 24];

const WALL_X = 212;
function wallWalkPose(t: number): FigurePose {
  const ay = interpolate(
    [
      [0, [234]],
      [1.8, [34]],
      [2.3, [34]],
      [4.0, [234]],
    ],
    t,
  )[0];
  const sy = 180.5;
  const dy = ay - sy;
  const sx = WALL_X - Math.sqrt(Math.max(1, BODY_LENGTH * BODY_LENGTH - dy * dy));
  const ankle: Point = [WALL_X, ay];
  const shoulder: Point = [sx, sy];
  const along = (len: number): Point => [ankle[0] + ((shoulder[0] - ankle[0]) * len) / BODY_LENGTH, ankle[1] + ((shoulder[1] - ankle[1]) * len) / BODY_LENGTH];
  const hand: Point = [sx, FLOOR];
  const unit: Point = [(shoulder[0] - ankle[0]) / BODY_LENGTH, (shoulder[1] - ankle[1]) / BODY_LENGTH];
  return {
    legs: [ankle, along(L_SHANK), along(L_SHANK + L_THIGH)],
    torso: [along(L_SHANK + L_THIGH), shoulder],
    arm: [shoulder, elbow(hand, shoulder, L_FORE, L_UPPER, 'back'), hand],
    head: [shoulder[0] + unit[0] * 22, shoulder[1] + unit[1] * 22 + 6],
    foot: [ankle[0], ankle[1], ankle[0] - 7, ankle[1] - 2],
    hand,
  };
}

function handstandWalkPose(t: number): FigurePose {
  const duration = 1.6;
  const phase = (360 * t) / duration;
  const shoulder: Point = [150 + 4 * Math.sin(phase * RAD), 182];
  const handAt = (deg: number): Point => [shoulder[0] + 7 * Math.sin(deg * RAD), FLOOR - 8 * Math.max(0, Math.cos(deg * RAD))];
  const a = Math.sin(phase * RAD) * 0.06;
  const up = (from: Point, len: number): Point => [from[0] + len * Math.sin(a), from[1] - len * Math.cos(a)];
  const hip = up(shoulder, L_TORSO);
  const knee = up(hip, L_THIGH);
  const ankle = up(knee, L_SHANK);
  const near = handAt(phase);
  const far = handAt(phase + 180);
  return {
    legs: [hip, knee, ankle],
    torso: [shoulder, hip],
    arm: [near, elbow(near, shoulder, L_FORE, L_UPPER, 'back'), shoulder],
    arm2: [far, elbow(far, shoulder, L_FORE, L_UPPER, 'back'), shoulder],
    head: [shoulder[0] + 1, shoulder[1] + 22],
    foot: [ankle[0], ankle[1], ankle[0] + 7, ankle[1] - 2],
    hand: near,
    dyn: groundTicks(t, duration, 70, 180),
  };
}

function handstandShoulderTapPose(t: number): FigurePose {
  const base = handstandPoseAt();
  const k = interpolate(
    [
      [0, [0]],
      [0.6, [1]],
      [0.9, [1]],
      [1.5, [0]],
      [1.8, [0]],
    ],
    t,
  )[0];
  const shoulder = base.arm[2];
  const target: Point = [HS_HAND[0] + (shoulder[0] + 12 - HS_HAND[0]) * k, HS_HAND[1] - (HS_HAND[1] - shoulder[1] - 8) * k];
  return { ...base, arm: [target, elbow(target, shoulder, L_FORE, L_UPPER, 'back'), shoulder], hand: target };
}
function handstandPoseAt(): FigurePose {
  const shoulder: Point = [152, 180.5];
  const a = Math.asin((HS_WALL - shoulder[0]) / BODY_LENGTH);
  const up = (from: Point, len: number): Point => [from[0] + len * Math.sin(a), from[1] - len * Math.cos(a)];
  const hip = up(shoulder, L_TORSO);
  const knee = up(hip, L_THIGH);
  const ankle = up(knee, L_SHANK);
  return {
    legs: [hip, knee, ankle],
    torso: [shoulder, hip],
    arm: [HS_HAND, elbow(HS_HAND, shoulder, L_FORE, L_UPPER, 'back'), shoulder],
    head: [shoulder[0] - 22 * Math.sin(a) + 2, shoulder[1] + 22 * Math.cos(a)],
    foot: [ankle[0], ankle[1], ankle[0] + 7, ankle[1] - 2],
    hand: HS_HAND,
  };
}

function bearCrawlPose(t: number): FigurePose {
  const duration = 1.4;
  const phase = (360 * t) / duration;
  const shoulder: Point = [195, 182];
  const hip: Point = [143.5, 174.8];
  const handAt = (deg: number): Point => [shoulder[0] + 7 * Math.sin(deg * RAD), FLOOR - 10 * Math.max(0, Math.cos(deg * RAD))];
  const footAt = (deg: number): Point => [96 + 14 * Math.sin(deg * RAD), 234 - 12 * Math.max(0, Math.cos(deg * RAD))];
  const near = legTo(hip, footAt(phase + 180));
  const far = legTo(hip, footAt(phase));
  const hNear = handAt(phase);
  const hFar = handAt(phase + 180);
  return {
    legs: near.legs,
    foot: near.foot,
    legs2: far.legs,
    foot2: far.foot,
    torso: [hip, shoulder],
    arm: [shoulder, elbow(hNear, shoulder, L_FORE, L_UPPER, 'back'), hNear],
    arm2: [shoulder, elbow(hFar, shoulder, L_FORE, L_UPPER, 'back'), hFar],
    head: [shoulder[0] + 18, shoulder[1] - 12],
    hand: hNear,
    dyn: groundTicks(t, duration, 60, 180),
  };
}

const ringProps = (hand: Point): PropShape[] => [line(hand[0] - 40, 0, hand[0] + 40, 0), line(hand[0], 0, hand[0], hand[1] - 11, 'thin'), { kind: 'circle', cx: hand[0], cy: hand[1], r: 11, role: 'ring' }];

// ---------------------------------------------------------------------------------------------
// El registro de las animaciones de este archivo
// ---------------------------------------------------------------------------------------------

export const MORE_ANIMATIONS: Record<string, MovementAnimation> = {
  // Levantamientos
  'air-squat': lift(airSquatKf, 2.3, { load: 'none' }),
  'front-squat': lift(frontSquatKf, 2.5, { load: 'bar', r: 16 }),
  'back-squat': lift(backSquatKf, 2.5, { load: 'bar', r: 16, loadAt: onBack }),
  'overhead-squat': lift(overheadSquatKf, 2.7, { load: 'bar', r: 15 }),
  'good-morning': lift(goodMorningKf, 2.7, { load: 'bar', r: 16, loadAt: onBack }),
  clean: lift(cleanKf(RACK_DEEP), 4.3, { load: 'bar', r: 24 }),
  'power-clean': lift(cleanKf(RACK_QUARTER), 4.3, { load: 'bar', r: 24 }),
  'hang-clean': lift(hangCleanKf(HANG_KNEE), 3.3, { load: 'bar', r: 22 }),
  'hang-power-clean': lift(hangCleanKf(HANG_KNEE), 3.3, { load: 'bar', r: 22 }),
  'hang-squat-clean': lift(hangCleanKf(HANG_KNEE, RACK_DEEP), 3.3, { load: 'bar', r: 22 }),
  'power-clean-and-jerk': lift(cleanAndJerkKf(RACK_QUARTER), 5.3, { load: 'bar', r: 22 }),
  'hang-clean-above-knee': lift(hangCleanKf(HANG_ABOVE), 3.3, { load: 'bar', r: 22 }),
  'dumbbell-hang-clean': lift(hangCleanKf(HANG_KNEE), 3.3, { load: 'db' }),
  'sandbag-clean': lift(cleanKf(RACK_QUARTER), 4.3, { load: 'kb' }),
  'clean-and-jerk': lift(cleanAndJerkKf(RACK_DEEP), 5.3, { load: 'bar', r: 22 }),
  'dumbbell-clean-and-jerk': lift(cleanAndJerkKf(RACK_QUARTER), 5.3, { load: 'db' }),
  cluster: lift(clusterKf, 4.9, { load: 'bar', r: 22 }),
  snatch: lift(snatchKf, 4.3, { load: 'bar', r: 22 }),
  'hang-snatch': lift(hangSnatchKf(HANG_KNEE), 3.4, { load: 'bar', r: 22 }),
  'hang-power-snatch': lift(hangSnatchKf(HANG_KNEE), 3.4, { load: 'bar', r: 22 }),
  'hang-squat-snatch': lift(hangSnatchKf(HANG_KNEE, OH_DEEP), 3.4, { load: 'bar', r: 22 }),
  'hang-snatch-above-knee': lift(hangSnatchKf(HANG_ABOVE), 3.4, { load: 'bar', r: 22 }),
  'dumbbell-snatch': lift(dbSnatchKf, 3.9, { load: 'db' }),
  'dumbbell-power-snatch': lift(dbSnatchKf, 3.9, { load: 'db' }),
  'kettlebell-snatch': lift(dbSnatchKf, 3.9, { load: 'kb' }),
  'push-press': lift(pushPressKf, 2.8, { load: 'bar', r: 16 }),
  'push-jerk': lift(pushJerkKf, 3.1, { load: 'bar', r: 16 }),
  'dumbbell-push-jerk': lift(pushJerkKf, 3.1, { load: 'db' }),
  'dumbbell-thruster': lift(DB_THRUSTER, 3.6, { load: 'db' }),
  'dumbbell-deadlift': lift(DEADLIFT_KF, 4.2, { load: 'db' }),
  'sumo-deadlift-high-pull': lift(sdhpKf, 2.0, { load: 'bar', r: 22 }),
  'kettlebell-swing-russian': lift(swingKf([0, 0, 0, 90, 90]), 1.3, { load: 'kb' }),
  'kettlebell-swing-american': lift(swingKf([0, 0, 0, 175, 178]), 1.3, { load: 'kb' }),
  'kettlebell-goblet-squat': lift(gobletKf, 2.5, { load: 'kb' }),
  'bicep-curl': lift(BICEP, 2.0, { load: 'db' }),
  'single-arm-dumbbell-row': lift(singleRowKf, 1.9, { load: 'db' }),
  // Burpees
  burpee: burpeeAnim(burpeeKf),
  'burpee-to-target': burpeeAnim(burpeeKf, [line(150, 62, 190, 62, 'thin')]),
  'burpee-pull-up': burpeeAnim(burpeePullUpKf, [line(100, BAR_Y, 240, BAR_Y)]),
  'devils-press': burpeeAnim(devilsPressKf, [], 'db'),
  'burpee-box-jump-over': burpeeAnim(burpeeBoxJumpOverKf, boxProps(236, 292)),
  // Saltos, zancadas y pasos
  'box-jump': burpeeAnim(boxJumpKf, boxProps(142, 214)),
  'box-jump-over': burpeeAnim(boxJumpOverKf, boxProps(142, 214)),
  'walking-lunge': lungeAnim(lungeKf([0, 0]), 3.0),
  'wall-walk-alt': lungeAnim(lungeKf([180, 180]), 3.0, 'bar'),
  'reverse-lunge': lungeAnim(reverseLungeKf, 3.0),
  'step-up': lungeAnim(stepUpKf, 3.0, 'none', [line(162, STEP_BOX_TOP, 226, STEP_BOX_TOP), line(162, STEP_BOX_TOP, 162, FLOOR), line(226, STEP_BOX_TOP, 226, FLOOR)]),
  // Suelo y máquinas
  'abmat-situp': makeAnim((t) => abmatPose(interpolate(ABMAT, t)), 2.2),
  'ghd-situp': makeAnim((t) => ghdPose(interpolate(GHD_SITUP, t)), 2.3, ghdProps, false),
  'ghd-hip-extension': makeAnim((t) => ghdPose(interpolate(GHD_EXT, t)), 2.3, ghdProps, false),
  'v-up': makeAnim((t) => vUpPose(interpolate(VUP, t)), 2.2),
  'l-sit': makeAnim(lSitPose, 2.6),
  'weighted-plank': makeAnim(
    (t) => {
      const p = plankPose(PLANK_ANKLE, PLANK_HAND, 182 + 1.2 * Math.sin((t / 2.4) * Math.PI * 2));
      return { ...p, dyn: loadShape('bar', [p.legs[2][0] + 6, p.legs[2][1] - 14], 14) };
    },
    2.4,
  ),
  'bear-crawl': makeAnim(bearCrawlPose, 1.4),
  'bench-press': makeAnim((t) => benchPose(t, BENCH_KF, 'bar'), 2.3, benchProps),
  'dumbbell-bench-press': makeAnim((t) => benchPose(t, BENCH_KF, 'db'), 2.3, benchProps),
  // Colgados, cuerda y anillas
  'strict-pull-up': makeAnim((t) => bodyFromHands([BAR_X, BAR_Y], interpolate(STRICT_KF, t), 'down'), 3.0, [line(62, BAR_Y, 250, BAR_Y)], false),
  'knees-to-elbow': makeAnim((t) => bodyFromHands([BAR_X, BAR_Y], interpolate(K2E_KF, t), 'down'), 2.9, [line(62, BAR_Y, 250, BAR_Y)], false),
  'ring-muscle-up': makeAnim((t) => bodyFromHands(BMU_BAR, interpolate(BMU_KF, t), 'back'), 5.1, ringProps(BMU_BAR), false),
  'rope-climb': makeAnim(ropePose([150, 97.5, 0, 40, -15], [146, 62, 8, 70, -20], [146, 64, 8, 38, 12], 2.0), 2.0, [line(ROPE_X, -8, ROPE_X, 256, 'thin')], false),
  'legless-rope-climb': makeAnim(ropePose([150, 97.5, 6, 62, 58], [146, 62, 14, 66, 62], [146, 64, 12, 64, 60], 2.4), 2.4, [line(ROPE_X, -8, ROPE_X, 256, 'thin')], false),
  'ring-row': makeAnim((t) => plankPose([32, 234], [180, 150], interpolate([[0, [207.5]], [0.9, [165]], [1.1, [165]], [2.0, [207.5]], [2.3, [207.5]]], t)[0]), 2.3, ringProps([180, 150])),
  // Máquinas y desplazamientos
  'ski-erg': makeAnim(
    (t) => {
      const p = standingBody([140, FLOOR], interpolate(SKI_KF, t));
      return { ...p, dyn: [{ kind: 'line', x1: p.hand[0], y1: p.hand[1], x2: SKI_TOP_ANCHOR[0], y2: SKI_TOP_ANCHOR[1], role: 'lever' }] };
    },
    1.8,
    [line(246, 20, 246, FLOOR), line(226, 20, 256, 20), line(236, 30, 256, 30, 'thin')],
  ),
  'sled-push': makeAnim(sledPose, 1.2, [line(206, 118, 206, 228), line(196, 232, 262, 232), line(206, 118, 220, 118)], true),
  'farmers-carry': walkAnim('farmers'),
  'suitcase-carry': walkAnim('farmers'),
  'waiters-carry': walkAnim('waiters'),
  'overhead-carry': walkAnim('overhead'),
  'sandbag-carry': walkAnim('sandbag'),
  'yoke-walk': walkAnim('yoke'),
  'wall-walk': makeAnim(wallWalkPose, 4.0, [line(WALL_X + 3, 10, WALL_X + 3, FLOOR)]),
  'handstand-walk': makeAnim(handstandWalkPose, 1.6),
  'hs-shoulder-taps': makeAnim(handstandShoulderTapPose, 1.8, [line(HS_WALL, 10, HS_WALL, FLOOR)]),
};

export type { MovementAnimation };
