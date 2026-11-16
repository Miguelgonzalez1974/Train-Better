import {
  L_FORE,
  L_SHANK,
  L_THIGH,
  L_TORSO,
  L_UPPER,
  RAD,
  at,
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
import { ARMS_DOWN, FLOOR, OH_STAND, dir, legTo, line, lift, loadShape, makeAnim, plus, twoLegPose } from './movementAnimationMore';

/**
 * Las animaciones de los accesorios (peso muerto rumano, remos, curls, abdominales, planchas, poleas…). Mismas piezas que el resto: cada una
 * elige su anclaje y da sus posturas. Los movimientos que de perfil no se distinguen de otro (el cossack de la sentadilla, la plancha
 * lateral de la plancha) comparten dibujo en `movementAnimations.ts`.
 */

const BENCH_TOP = 196;
const benchLines = (x1: number, x2: number): PropShape[] => [line(x1, BENCH_TOP, x2, BENCH_TOP), line(x1 + 12, BENCH_TOP, x1 + 12, FLOOR), line(x2 - 12, BENCH_TOP, x2 - 12, FLOOR)];

// ---------------------------------------------------------------------------------------------
// De pie: bisagras, remos, curls, elevaciones, poleas
// ---------------------------------------------------------------------------------------------

const rdlKf: Keyframes = [
  [0, ARMS_DOWN],
  [1.0, [12, 42, 70, 0, 0]],
  [1.3, [12, 42, 70, 0, 0]],
  [2.3, ARMS_DOWN],
  [2.6, ARMS_DOWN],
];
const ROW_BENT = [10, 70, 80, 0, 0];
const barbellRowKf: Keyframes = [
  [0, ROW_BENT],
  [0.7, [10, 70, 80, -65, -10]],
  [0.9, [10, 70, 80, -65, -10]],
  [1.6, ROW_BENT],
  [1.9, ROW_BENT],
];

function landmineRowPose(t: number): FigurePose {
  const p = standingBody([130, FLOOR], interpolate(barbellRowKf, t));
  return {
    ...p,
    dyn: [{ kind: 'line', x1: 40, y1: FLOOR - 4, x2: p.hand[0], y2: p.hand[1], role: 'lever' }, ...loadShape('bar', p.hand, 12)],
  };
}

const PULL_THROUGH_BACK: [number, number[]][] = [
  [0, [0, 0, 0, 40, 40]],
  [0.8, [10, 50, 55, -25, -25]],
  [1.0, [10, 50, 55, -25, -25]],
  [1.8, [0, 0, 0, 40, 40]],
  [2.0, [0, 0, 0, 40, 40]],
];
function bandPullThroughPose(t: number): FigurePose {
  const p = standingBody([140, FLOOR], interpolate(PULL_THROUGH_BACK, t));
  return { ...p, dyn: [{ kind: 'line', x1: 52, y1: 206, x2: p.hand[0], y2: p.hand[1], role: 'crank' }] };
}

const tricepsOverheadKf: Keyframes = [
  [0, [0, 0, 0, 180, 180]],
  [0.9, [0, 0, 0, 180, 350]],
  [1.1, [0, 0, 0, 180, 350]],
  [2.0, [0, 0, 0, 180, 180]],
  [2.3, [0, 0, 0, 180, 180]],
];

const pushdownKf: Keyframes = [
  [0, [0, 0, 0, 6, 100]],
  [0.7, [0, 0, 0, 6, 8]],
  [0.9, [0, 0, 0, 6, 8]],
  [1.6, [0, 0, 0, 6, 100]],
  [1.8, [0, 0, 0, 6, 100]],
];
function pushdownPose(t: number): FigurePose {
  const p = standingBody([120, FLOOR], interpolate(pushdownKf, t));
  return { ...p, dyn: [{ kind: 'line', x1: p.hand[0], y1: p.hand[1], x2: 168, y2: 14, role: 'crank' }] };
}

const facePullKf: Keyframes = [
  [0, [0, 0, 0, 90, 90]],
  [0.8, [0, 0, 0, 60, 170]],
  [1.1, [0, 0, 0, 60, 170]],
  [1.9, [0, 0, 0, 90, 90]],
  [2.2, [0, 0, 0, 90, 90]],
];
function facePullPose(t: number): FigurePose {
  const p = standingBody([120, FLOOR], interpolate(facePullKf, t));
  return { ...p, dyn: [{ kind: 'line', x1: p.hand[0], y1: p.hand[1], x2: 196, y2: 100, role: 'crank' }] };
}

const palofKf: Keyframes = [
  [0, [0, 0, 2, 50, 150]],
  [0.8, [0, 0, 2, 90, 90]],
  [1.8, [0, 0, 2, 90, 90]],
  [2.4, [0, 0, 2, 50, 150]],
  [2.6, [0, 0, 2, 50, 150]],
];

/** Elevación lateral: los brazos suben hacia los lados, así que de perfil solo se acortan y suben las manos. */
function lateralRaisePose(t: number): FigurePose {
  const a = interpolate(
    [
      [0, [0]],
      [1.0, [88]],
      [1.3, [88]],
      [2.3, [0]],
      [2.6, [0]],
    ],
    t,
  )[0];
  const base = standingBody([130, FLOOR], ARMS_DOWN);
  const shoulder = base.torso[1];
  const reach = (L_UPPER + L_FORE) * Math.cos(a * RAD);
  const hand: Point = [shoulder[0] + 4 * Math.sin(a * RAD), shoulder[1] + reach];
  const el: Point = [shoulder[0] + 2 * Math.sin(a * RAD), shoulder[1] + (L_UPPER * reach) / (L_UPPER + L_FORE)];
  return { ...base, arm: [shoulder, el, hand], hand, dyn: loadShape('db', hand) };
}

function calfRaisePose(t: number): FigurePose {
  const lift_ = interpolate(
    [
      [0, [0]],
      [0.6, [12]],
      [1.0, [12]],
      [1.6, [0]],
      [1.9, [0]],
    ],
    t,
  )[0];
  const p = standingBody([130, FLOOR - lift_], ARMS_DOWN);
  return { ...p, foot: [p.legs[0][0] - 6, p.legs[0][1], p.legs[0][0] + 18, FLOOR] };
}

const slamKf: Keyframes = [
  [0, OH_STAND],
  [0.35, [20, 55, 40, 130, 130]],
  [0.6, [30, 70, 60, 30, 40]],
  [0.8, [30, 70, 60, 30, 40]],
  [1.5, OH_STAND],
  [1.8, OH_STAND],
];

// ---------------------------------------------------------------------------------------------
// Sentados y tumbados en banco: z-press, jalón, hip thrust, french press
// ---------------------------------------------------------------------------------------------

/** Sentado en el suelo con las piernas estiradas y el tronco recto, presionando por encima de la cabeza. */
function zPressPose(t: number, load: 'bar' | 'db'): FigurePose {
  const p = interpolate(
    [
      [0, [75, 175]],
      [0.9, [180, 180]],
      [1.4, [180, 180]],
      [2.3, [75, 175]],
      [2.6, [75, 175]],
    ],
    t,
  );
  const hip: Point = [120, 232];
  const shoulder: Point = [hip[0], hip[1] - L_TORSO];
  const el = at(shoulder, L_UPPER, p[0]);
  const hand = at(el, L_FORE, p[1]);
  const knee: Point = [hip[0] + L_THIGH, hip[1]];
  const ankle: Point = [hip[0] + L_THIGH + L_SHANK, hip[1]];
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + 2, shoulder[1] - 22],
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 8],
    hand,
    dyn: loadShape(load, hand, 14),
  };
}

const PULLDOWN_HIP: Point = [140, 204];
function latPulldownPose(t: number): FigurePose {
  const p = interpolate(
    [
      [0, [178, 178]],
      [0.9, [-22, 140]],
      [1.2, [-22, 140]],
      [2.1, [178, 178]],
      [2.4, [178, 178]],
    ],
    t,
  );
  const lean = -8;
  const shoulder: Point = [PULLDOWN_HIP[0] + L_TORSO * Math.sin(lean * RAD), PULLDOWN_HIP[1] - L_TORSO * Math.cos(lean * RAD)];
  const el = at(shoulder, L_UPPER, p[0]);
  const hand = at(el, L_FORE, p[1]);
  const foot: Point = [196, FLOOR];
  const leg = legTo(PULLDOWN_HIP, foot);
  return {
    legs: leg.legs,
    foot: leg.foot,
    torso: [PULLDOWN_HIP, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + Math.sin(lean * RAD) * 22 + 2, shoulder[1] - Math.cos(lean * RAD) * 22],
    hand,
    dyn: [{ kind: 'line', x1: hand[0], y1: hand[1], x2: 152, y2: 4, role: 'crank' }],
  };
}

function hipThrustPose(t: number): FigurePose {
  const phi = interpolate(
    [
      [0, [26]],
      [0.9, [-6]],
      [1.3, [-6]],
      [2.2, [26]],
      [2.5, [26]],
    ],
    t,
  )[0];
  const shoulder: Point = [96, 184];
  const hip = plus(shoulder, [Math.cos(phi * RAD), Math.sin(phi * RAD)], L_TORSO);
  const foot: Point = [196, FLOOR];
  const leg = legTo(hip, foot);
  const bar: Point = [hip[0], hip[1] - 9];
  return {
    legs: [leg.legs[0], elbow(hip, foot, L_THIGH, L_SHANK, 'up'), hip],
    foot: leg.foot,
    torso: [hip, shoulder],
    arm: [shoulder, elbow(bar, shoulder, L_FORE, L_UPPER, 'down'), bar],
    head: [shoulder[0] - 22, shoulder[1] - 6],
    hand: bar,
    dyn: loadShape('bar', bar, 14),
  };
}

function frenchPressPose(t: number): FigurePose {
  const theta = interpolate(
    [
      [0, [0]],
      [0.9, [105]],
      [1.2, [105]],
      [2.1, [0]],
      [2.4, [0]],
    ],
    t,
  )[0];
  const shoulder: Point = [100, 186];
  const hip: Point = [152, 186];
  const foot: Point = [205, FLOOR];
  const leg = legTo(hip, foot);
  const el: Point = [shoulder[0], shoulder[1] - L_UPPER];
  const hand: Point = [el[0] - L_FORE * Math.sin(theta * RAD), el[1] - L_FORE * Math.cos(theta * RAD)];
  return {
    legs: [leg.legs[0], elbow(hip, foot, L_THIGH, L_SHANK, 'up'), hip],
    foot: leg.foot,
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] - 22, shoulder[1] - 4],
    hand,
    dyn: loadShape('bar', hand, 12),
  };
}

// ---------------------------------------------------------------------------------------------
// Dos piernas: zancadas con apoyo, sentadillas a una pierna y saltos
// ---------------------------------------------------------------------------------------------

const bulgarianKf: Keyframes = [
  [0, [150, 150, 190, FLOOR, 95, 193, 0, 0, 0]],
  [1.0, [150, 186, 190, FLOOR, 95, 193, 0, 0, 0]],
  [1.4, [150, 186, 190, FLOOR, 95, 193, 0, 0, 0]],
  [2.4, [150, 150, 190, FLOOR, 95, 193, 0, 0, 0]],
  [2.7, [150, 150, 190, FLOOR, 95, 193, 0, 0, 0]],
];

const bowlerKf: Keyframes = [
  [0, [150, 140, 150, FLOOR, 118, 226, 0, 0, 0]],
  [1.0, [150, 186, 150, FLOOR, 98, 222, 30, 40, 40]],
  [1.4, [150, 186, 150, FLOOR, 98, 222, 30, 40, 40]],
  [2.4, [150, 140, 150, FLOOR, 118, 226, 0, 0, 0]],
  [2.7, [150, 140, 150, FLOOR, 118, 226, 0, 0, 0]],
];

const jumpingLungeKf: Keyframes = [
  [0, [150, 186, 205, FLOOR, 112, 232, 0, 0, 0]],
  [0.35, [150, 118, 170, 196, 140, 206, 0, 20, 20]],
  [0.7, [150, 186, 112, 232, 205, FLOOR, 0, 0, 0]],
  [1.05, [150, 118, 140, 206, 170, 196, 0, 20, 20]],
  [1.4, [150, 186, 205, FLOOR, 112, 232, 0, 0, 0]],
];

/** Salto de longitud: el cuerpo se agacha, salta y cae; el suelo pasa hacia atrás durante el vuelo. */
function broadJumpPose(t: number): FigurePose {
  const k = interpolate(
    [
      [0, [0, 0, 0, 0, 0, 0]],
      [0.5, [25, 45, 35, -50, -50, 0]],
      [0.8, [4, 4, 4, 120, 120, 0]],
      [1.1, [30, 70, 10, 60, 60, 0.5]],
      [1.4, [22, 40, 30, 20, 20, 1]],
      [1.8, [0, 0, 0, 0, 0, 1]],
      [2.4, [0, 0, 0, 0, 0, 1]],
    ],
    t,
  );
  const lifted = Math.sin(Math.min(1, Math.max(0, (t - 0.7) / 0.7)) * Math.PI) * 38;
  const p = standingBody([150, FLOOR - lifted], k.slice(0, 5));
  const travel = 120 * Math.min(1, Math.max(0, (t - 0.7) / 0.7));
  const ticks: DynShape[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (((i * 60 - travel * 0.9) % 180) + 180) % 180;
    ticks.push({ kind: 'line', x1: 60 + x, y1: FLOOR + 6, x2: 82 + x, y2: FLOOR + 6, role: 'tick' });
  }
  return { ...p, dyn: ticks };
}

// ---------------------------------------------------------------------------------------------
// Suelo y colgados: planchas, rueda, abdominales
// ---------------------------------------------------------------------------------------------

/** Plancha sobre los antebrazos, con una respiración mínima. */
function forearmPlankPose(t: number): FigurePose {
  const ankle: Point = [60, 234];
  const shoulderY = 206 + 1.2 * Math.sin((t / 2.4) * Math.PI * 2);
  const dy = ankle[1] - shoulderY;
  const shoulder: Point = [ankle[0] + Math.sqrt(150 * 150 - dy * dy), shoulderY];
  const along = (len: number): Point => [ankle[0] + ((shoulder[0] - ankle[0]) * len) / 150, ankle[1] + ((shoulder[1] - ankle[1]) * len) / 150];
  const elbowPt: Point = [shoulder[0], shoulderY + L_UPPER];
  const hand: Point = [shoulder[0] + L_FORE, shoulderY + L_UPPER];
  const ang = Math.atan2(dy, shoulder[0] - ankle[0]);
  return {
    legs: [ankle, along(L_SHANK), along(L_SHANK + L_THIGH)],
    torso: [along(L_SHANK + L_THIGH), shoulder],
    arm: [shoulder, elbowPt, hand],
    head: [shoulder[0] + 22 * Math.cos(ang + 0.3), shoulder[1] - 22 * Math.sin(ang + 0.3)],
    foot: [ankle[0], ankle[1], ankle[0] + 7, FLOOR],
    hand,
  };
}

/** Rueda abdominal: de rodillas, el cuerpo se estira hacia delante rodando la rueda y vuelve. */
function abWheelPose(t: number): FigurePose {
  const p = interpolate(
    [
      [0, [5, 65]],
      [1.1, [35, 88]],
      [1.5, [35, 88]],
      [2.6, [5, 65]],
      [2.9, [5, 65]],
    ],
    t,
  );
  const knee: Point = [110, 236];
  const hip: Point = [knee[0] + L_THIGH * Math.sin(p[0] * RAD), knee[1] - L_THIGH * Math.cos(p[0] * RAD)];
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(p[1] * RAD), hip[1] - L_TORSO * Math.cos(p[1] * RAD)];
  const axle = 218;
  const reach = Math.min(L_UPPER + L_FORE - 0.5, Math.max(8, axle - shoulder[1]));
  const d = Math.acos(Math.min(1, reach / (L_UPPER + L_FORE)));
  const hand: Point = [shoulder[0] + (L_UPPER + L_FORE) * Math.sin(d), axle];
  const ankle: Point = [knee[0] - L_SHANK, 236];
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2], hand],
    head: [shoulder[0] + Math.sin(p[1] * RAD) * 22 + 2, shoulder[1] - Math.cos(p[1] * RAD) * 22],
    foot: [ankle[0] - 6, ankle[1], ankle[0] + 4, ankle[1]],
    hand,
    dyn: [{ kind: 'circle', cx: hand[0], cy: hand[1], r: 18, role: 'plate' }],
  };
}

const HIP_FLOOR: Point = [150, 230];

/** Tumbado boca arriba con el tronco y las piernas levantadas: cuánto sube cada uno (grados sobre el suelo) y hacia dónde van los brazos. */
function supinePose(torsoUp: number, legsUp: number, armDir: number): FigurePose {
  const shoulder = plus(HIP_FLOOR, dir(180 - torsoUp), L_TORSO);
  const knee = plus(HIP_FLOOR, dir(legsUp), L_THIGH);
  const ankle = plus(HIP_FLOOR, dir(legsUp), L_THIGH + L_SHANK);
  const hand = plus(shoulder, dir(armDir), L_UPPER + L_FORE);
  return {
    legs: [ankle, knee, HIP_FLOOR],
    torso: [HIP_FLOOR, shoulder],
    arm: [shoulder, plus(shoulder, dir(armDir), L_UPPER), hand],
    head: plus(shoulder, dir(180 - torsoUp), 22),
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 4],
    hand,
  };
}

const hollowRock = (t: number): FigurePose => {
  const rock = 9 * Math.sin((t / 1.6) * Math.PI * 2);
  return supinePose(24 + rock, 24 - rock, 172);
};
const supermanPose = (t: number): FigurePose => {
  const up = 18 + 3 * Math.sin((t / 2.4) * Math.PI * 2);
  const p = supinePose(up, up, 172);
  return { ...p, head: plus(p.torso[1], dir(180 - up + 20), 22) };
};
const flutterPose = (t: number): FigurePose => {
  const a = Math.sin((t / 0.8) * Math.PI * 2);
  const p = supinePose(10, 28 + 9 * a, 175);
  const other = 28 - 9 * a;
  const knee2 = plus(HIP_FLOOR, dir(other), L_THIGH);
  const ankle2 = plus(HIP_FLOOR, dir(other), L_THIGH + L_SHANK);
  return { ...p, legs2: [ankle2, knee2, HIP_FLOOR], foot2: [ankle2[0], ankle2[1], ankle2[0] + 6, ankle2[1] - 4] };
};
const lyingLegRaisePose = (t: number): FigurePose => {
  const up = interpolate(
    [
      [0, [6]],
      [0.9, [88]],
      [1.1, [88]],
      [2.0, [6]],
      [2.3, [6]],
    ],
    t,
  )[0];
  const p = supinePose(8, up, 188);
  return p;
};

function deadBugPose(t: number): FigurePose {
  const phase = Math.sin((t / 2.4) * Math.PI * 2);
  const ext = (v: number) => Math.min(1, Math.max(0, 0.5 + 0.5 * v));
  const nearLeg = ext(phase);
  const farLeg = ext(-phase);
  const legAt = (k: number): { knee: Point; ankle: Point } => {
    const knee = plus(HIP_FLOOR, dir(90 - 72 * k), L_THIGH);
    return { knee, ankle: plus(knee, dir(18 * k), L_SHANK) };
  };
  const near = legAt(nearLeg);
  const far = legAt(farLeg);
  const shoulder = plus(HIP_FLOOR, dir(176), L_TORSO);
  const armAt = (k: number): Point[] => {
    const d = 90 + 80 * k;
    return [shoulder, plus(shoulder, dir(d), L_UPPER), plus(shoulder, dir(d), L_UPPER + L_FORE)];
  };
  const arm = armAt(1 - nearLeg);
  return {
    legs: [near.ankle, near.knee, HIP_FLOOR],
    legs2: [far.ankle, far.knee, HIP_FLOOR],
    torso: [HIP_FLOOR, shoulder],
    arm,
    arm2: armAt(1 - farLeg),
    head: plus(shoulder, dir(176), 22),
    foot: [near.ankle[0], near.ankle[1], near.ankle[0] + 6, near.ankle[1] - 4],
    foot2: [far.ankle[0], far.ankle[1], far.ankle[0] + 6, far.ankle[1] - 4],
    hand: arm[2],
  };
}

/** Giro ruso: sentado en V con el balón; de perfil el balón va y viene de un lado a otro. */
function russianTwistPose(t: number): FigurePose {
  const side = Math.sin((t / 1.6) * Math.PI * 2);
  const hip: Point = [140, 228];
  const shoulder = plus(hip, dir(180 - 55), L_TORSO);
  const knee = plus(hip, dir(38), L_THIGH);
  const ankle = plus(hip, dir(38), L_THIGH + L_SHANK);
  const hand: Point = [shoulder[0] + 34 + 10 * side, shoulder[1] + 26 - 8 * Math.abs(side)];
  const el: Point = [(shoulder[0] + hand[0]) / 2 + 2, (shoulder[1] + hand[1]) / 2 + 8];
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: plus(shoulder, dir(180 - 55), 22),
    foot: [ankle[0], ankle[1], ankle[0] + 6, ankle[1] - 6],
    hand,
    dyn: loadShape('kb', hand, 13),
  };
}

const hangingLegRaiseKf: Keyframes = [
  [0, [150, 91.5, 0, 0, 0]],
  [0.9, [150, 91.5, 12, 92, 92]],
  [1.3, [150, 91.5, 12, 92, 92]],
  [2.3, [150, 91.5, 0, 0, 0]],
  [2.6, [150, 91.5, 0, 0, 0]],
];

// ---------------------------------------------------------------------------------------------
// El registro de este archivo
// ---------------------------------------------------------------------------------------------

const BAR_Y_HANG = 34;

export const ACCESSORY_ANIMATIONS: Record<string, MovementAnimation> = {
  'romanian-deadlift': lift(rdlKf, 2.6, { load: 'bar', r: 18 }),
  'pendlay-row': lift(barbellRowKf, 1.9, { load: 'bar', r: 14 }),
  'landmine-row': makeAnim(landmineRowPose, 1.9),
  'band-pull-through': makeAnim(bandPullThroughPose, 2.0, [line(52, 200, 52, 212)]),
  'overhead-triceps-extension': lift(tricepsOverheadKf, 2.3, { load: 'db' }),
  'tricep-pushdown': makeAnim(pushdownPose, 1.8, [line(168, 10, 168, 24), line(160, 10, 176, 10)]),
  'face-pull': makeAnim(facePullPose, 2.2, [line(196, 90, 196, 110)]),
  'pallof-press': lift(palofKf, 2.6, { load: 'none' }),
  'lateral-raise': makeAnim(lateralRaisePose, 2.6),
  'calf-raise': makeAnim(calfRaisePose, 1.9),
  'ball-slam': lift(slamKf, 1.8, { load: 'kb', r: 13 }),
  'z-press': makeAnim((t) => zPressPose(t, 'bar'), 2.6),
  'dumbbell-z-press': makeAnim((t) => zPressPose(t, 'db'), 2.6),
  'lat-pulldown': makeAnim(latPulldownPose, 2.4, [line(118, 214, 168, 214), line(150, 214, 150, 236), line(142, 190, 170, 190, 'thin'), line(152, 4, 152, 20)]),
  'hip-thrust': makeAnim(hipThrustPose, 2.5, [line(76, BENCH_TOP - 6, 118, BENCH_TOP - 6), line(88, BENCH_TOP - 6, 88, FLOOR), line(108, BENCH_TOP - 6, 108, FLOOR)]),
  'french-press': makeAnim(frenchPressPose, 2.4, benchLines(80, 178)),
  'bulgarian-split-squat': makeAnim(
    (t) => twoLegPose(interpolate(bulgarianKf, t), (p) => loadShape('db', p.hand, 9)),
    2.7,
    [line(70, 188, 108, 188), line(76, 188, 76, FLOOR), line(102, 188, 102, FLOOR)],
  ),
  'bowlers-squat': makeAnim((t) => twoLegPose(interpolate(bowlerKf, t), (p) => loadShape('kb', p.hand, 11)), 2.7),
  'jumping-lunge': makeAnim((t) => twoLegPose(interpolate(jumpingLungeKf, t)), 1.4),
  'broad-jump': makeAnim(broadJumpPose, 2.4),
  plank: makeAnim(forearmPlankPose, 2.4),
  'ab-wheel-rollout': makeAnim(abWheelPose, 2.9),
  'hollow-rock': makeAnim(hollowRock, 1.6),
  'superman-hold': makeAnim(supermanPose, 2.4),
  'flutter-kick': makeAnim(flutterPose, 0.8),
  'lying-leg-raise': makeAnim(lyingLegRaisePose, 2.3),
  'dead-bug': makeAnim(deadBugPose, 2.4),
  'russian-twist': makeAnim(russianTwistPose, 1.6),
  'hanging-leg-raise': makeAnim((t) => bodyFromHands([150, BAR_Y_HANG], interpolate(hangingLegRaiseKf, t), 'down'), 2.6, [line(62, BAR_Y_HANG, 250, BAR_Y_HANG)], false),
};

