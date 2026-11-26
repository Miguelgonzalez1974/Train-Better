import { L_FORE, L_SHANK, L_THIGH, L_TORSO, L_UPPER, at, elbow, interpolate, standingBody, type DynShape, type FigurePose, type Keyframes, type Point, type PropShape } from './movementAnimation';
import { between, hold, mix, reach } from './movementAnimationCooldown';
import { front, straight } from './movementAnimationWarmup';
import { FLOOR, dir, line, makeAnim, plus } from './movementAnimationMore';

/**
 * Segunda tanda de estiramientos y movilidad (calentamiento y vuelta a la calma). Los que de perfil se veían como un nudo van vistos desde
 * arriba, sobre la esterilla.
 */

const STRETCH = 4.4;
const wave = (t: number, d: number) => Math.sin((t / d) * Math.PI * 2);
const knee = (foot: Point, hip: Point, side: 'up' | 'back' | 'front') => elbow(foot, hip, L_SHANK, L_THIGH, side);
/** La mano y el codo de un brazo que llega a `target`. */
const armTo = (shoulder: Point, target: Point, side: 'up' | 'down' | 'back' | 'front'): Point[] => {
  const hand = reach(shoulder, target);
  return [shoulder, elbow(shoulder, hand, L_UPPER, L_FORE, side), hand];
};

// ---------- Desde arriba ----------

/** La esterilla vista desde arriba: lo que dice que el muñeco está tumbado. */
const MAT: PropShape[] = [line(70, 34, 230, 34, 'thin'), line(230, 34, 230, 240, 'thin'), line(230, 240, 70, 240, 'thin'), line(70, 240, 70, 34, 'thin')];
const TOP_SHOULDER: Point = [150, 84];
const TOP_HIP: Point = [150, 136];
const TOP_HEAD: Point = [150, 60];
const dot = (p: Point): DynShape => ({ kind: 'circle', cx: p[0], cy: p[1], r: 7, role: 'ball' });

/** Los dos brazos vistos desde arriba, en el mismo trazo; la segunda mano lleva su punto. */
function topArms(leftElbow: Point, leftHand: Point, rightElbow: Point, rightHand: Point) {
  return {
    arm: [TOP_SHOULDER, leftElbow, leftHand, leftElbow, TOP_SHOULDER, rightElbow, rightHand],
    hand: leftHand,
    dyn: [dot(rightHand)],
  };
}

/** Una pierna: [tobillo x, y, rodilla x, y]. */
const legPoints = (v: number[]): Point[] => [[v[0], v[1]], [v[2], v[3]], TOP_HIP];
const footOf = (leg: Point[], dx: number, dy: number): [number, number, number, number] => [leg[0][0], leg[0][1], leg[0][0] + dx, leg[0][1] + dy];

/** Una pierna que gira desde la cadera: [ángulo del muslo, ángulo de la pierna], medidos desde «hacia los pies de la esterilla». */
const swingLeg = ([thigh, shank]: number[]): Point[] => {
  const k = at(TOP_HIP, 49, thigh);
  return [at(k, 47, shank), k, TOP_HIP];
};
const REST_LEFT = [-10, -6];
const REST_RIGHT = [10, 6];

/** Escorpión: boca abajo con los brazos en cruz, una pierna cruza por encima hacia la mano contraria; luego la otra. */
function scorpionPose(t: number): FigurePose {
  const d = 4;
  const s = wave(t, d);
  const k = (v: number) => Math.min(1, Math.max(0, v) * 1.15);
  const leg = (rest: number[], cross: number[], v: number) => swingLeg(rest.map((a, i) => mix(a, cross[i], k(v))));
  const left = leg(REST_LEFT, [52, 124], s);
  const right = leg(REST_RIGHT, [-52, -124], -s);
  return {
    legs: left,
    legs2: right,
    foot: footOf(left, mix(-3, 8, k(s)), mix(10, -7, k(s))),
    foot2: footOf(right, mix(3, -8, k(-s)), mix(10, -7, k(-s))),
    torso: [TOP_HIP, TOP_SHOULDER],
    head: TOP_HEAD,
    ...topArms([122, 84], [95, 84], [178, 84], [205, 84]),
  };
}

/** Glúteo tumbado: el tobillo cruzado sobre la otra rodilla (la figura de un 4) y las manos acercan las piernas al pecho. */
function lyingGlutePose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const support = legPoints([mix(178, 182, k), mix(224, 196, k), mix(181, 184, k), mix(176, 150, k)]);
  const crossed = legPoints([mix(172, 174, k), mix(172, 148, k), mix(116, 112, k), mix(166, 138, k)]);
  const hl: Point = [mix(126, 158, k), mix(136, 134, k)];
  const hr: Point = [mix(174, 186, k), mix(136, 134, k)];
  return {
    legs: crossed,
    legs2: support,
    foot: footOf(crossed, 12, -3),
    foot2: footOf(support, 4, 11),
    torso: [TOP_HIP, TOP_SHOULDER],
    head: TOP_HEAD,
    ...topArms(between(TOP_SHOULDER, hl, 0.52), hl, between(TOP_SHOULDER, hr, 0.52), hr),
  };
}

/** Mariposa tumbado: las plantas juntas y las rodillas cayendo a los lados. */
function recliningButterflyPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const lf: Point = [147, mix(206, 198, k)];
  const rf: Point = [153, lf[1]];
  const lk: Point = [mix(122, 105, k), mix(166, 164, k)];
  const rk: Point = [300 - lk[0], lk[1]];
  const arms = topArms([128, 102], [108, 120], [172, 102], [192, 120]);
  return { legs: [lf, lk, TOP_HIP, rk, rf], foot: [141, lf[1] + 5, 159, rf[1] + 5], torso: [TOP_HIP, TOP_SHOULDER], head: TOP_HEAD, ...arms };
}

// ---------- De frente ----------

/** Sumo de lado a lado: los pies muy separados y el peso pasa de una pierna a la otra. */
function sumoRockPose(t: number): FigurePose {
  const s = wave(t, 4);
  const hip: Point = [150 + 27 * s, 176 + 8 * Math.abs(s)];
  const lf: Point = [98, FLOOR];
  const rf: Point = [202, FLOOR];
  const shoulder: Point = [hip[0], hip[1] - L_TORSO];
  const hands: Point = [hip[0], shoulder[1] + 18];
  return front({
    hip,
    left: [lf, knee(lf, hip, 'back')],
    right: [rf, knee(rf, hip, 'front')],
    armLeft: [[hip[0] - 20, shoulder[1] + 24], [hands[0] - 3, hands[1]]],
    armRight: [[hip[0] + 20, shoulder[1] + 24], [hands[0] + 3, hands[1]]],
  });
}

/** Piernas abiertas sentado: el tronco va hacia un pie, al centro y hacia el otro. [hombro x, y, mano 1 x, y, mano 2 x, y] */
const SIT_UP_TALL = [150, 175, 133, 214, 167, 214];
const SIT_CENTER = [150, 185, 138, 232, 162, 232];
const SIT_LEFT = [113, 192, 72, 226, 96, 232];
const SIT_RIGHT = [187, 192, 204, 232, 228, 226];
const STRADDLE_KF: Keyframes = [
  [0, SIT_UP_TALL],
  [1.0, SIT_LEFT],
  [1.8, SIT_LEFT],
  [2.8, SIT_CENTER],
  [3.4, SIT_CENTER],
  [4.4, SIT_RIGHT],
  [5.2, SIT_RIGHT],
  [6.2, SIT_UP_TALL],
];
function straddlePose(t: number): FigurePose {
  const v = interpolate(STRADDLE_KF, t);
  const hip: Point = [150, 226];
  const shoulder: Point = [v[0], v[1]];
  const h1: Point = [v[2], v[3]];
  const h2: Point = [v[4], v[5]];
  const e1 = elbow(shoulder, reach(shoulder, h1), L_UPPER, L_FORE, 'back');
  const e2 = elbow(shoulder, reach(shoulder, h2), L_UPPER, L_FORE, 'front');
  const lean = (shoulder[0] - 150) / 37;
  return {
    legs: [[60, 235], [105, 231], hip, [195, 231], [240, 235]],
    foot: [60, 235, 56, 224],
    torso: [hip, shoulder],
    arm: [shoulder, e1, reach(shoulder, h1), e1, shoulder, e2, reach(shoulder, h2)],
    head: [shoulder[0] + 9 * lean, shoulder[1] - 21],
    hand: reach(shoulder, h1),
    dyn: [dot(reach(shoulder, h2)), { kind: 'line', x1: 240, y1: 235, x2: 244, y2: 224, role: 'crank' }],
  };
}

/** Balanceo de pierna de lado a lado, con una mano en la pared. */
function lateralSwingPose(t: number): FigurePose {
  const s = wave(t, 1.8);
  const hip: Point = [150, 140];
  const shoulder: Point = [150, hip[1] - L_TORSO];
  const rf: Point = [160, FLOOR];
  const angle = s > 0 ? 24 * s : 46 * s;
  const lf = at(hip, 94, angle);
  const support = armTo(shoulder, [197, 104], 'down');
  return front({
    hip,
    left: [lf, between(lf, hip, 0.5)],
    right: [rf, between(rf, hip, 0.5)],
    armLeft: straight(shoulder, -48),
    armRight: [support[1], support[2]],
  });
}

// ---------- De perfil ----------

/** Sit-up hasta las piernas abiertas: como la pica, con una pierna delante y otra al fondo. [ángulo del tronco, ángulo de los brazos] */
const STRADDLE_SITUP_KF: Keyframes = [
  [0, [178, 179]],
  [0.4, [178, 179]],
  [1.1, [92, 80]],
  [1.7, [38, -8]],
  [2.1, [38, -8]],
  [2.7, [92, 80]],
  [3.4, [178, 179]],
];
function sitUpStraddlePose(t: number): FigurePose {
  const [torso, arms] = interpolate(STRADDLE_SITUP_KF, t);
  const hip: Point = [140, 214];
  const shoulder = plus(hip, dir(torso), L_TORSO);
  const raw = plus(shoulder, dir(arms), L_UPPER + L_FORE - 0.5);
  const hand: Point = [raw[0], Math.min(226, raw[1])];
  const leg = (angle: number): Point[] => {
    const ankle = plus(hip, dir(angle), L_THIGH + L_SHANK - 0.2);
    return [ankle, between(ankle, hip, L_SHANK / (L_THIGH + L_SHANK)), hip];
  };
  const near = leg(-15);
  const far = leg(17);
  return {
    legs: near,
    legs2: far,
    foot: [near[0][0], near[0][1], near[0][0] + 6, near[0][1] - 13],
    foot2: [far[0][0], far[0][1], far[0][0] - 3, far[0][1] - 14],
    torso: [hip, shoulder],
    arm: [shoulder, between(shoulder, hand, 0.52), hand],
    head: plus(shoulder, dir(Math.min(torso, 168)), 21),
    hand,
  };
}

/** Movilidad torácica en cuadrupedia: la mano en la nuca y el codo sube hacia el techo. */
function thoracicRotationPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hip: Point = [128, 186];
  const shoulder: Point = [180, 186];
  const el: Point = [mix(188, 174, k), mix(209, 159, k)];
  const hand: Point = [mix(197, 192, k), mix(190, 176, k)];
  return {
    legs: [[80.1, 234], [128, 236], hip],
    foot: [80.1, 234, 68, 237],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    arm2: [shoulder, [184, 211], [184, 236]],
    legs2: [[92, 234], [140, 236], hip],
    head: [shoulder[0] + 20, mix(184, 175, k)],
    hand,
  };
}

/** Flexión de pie: el tronco cae hacia las piernas y las manos van al suelo. */
function forwardBendPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  return standingBody([130, FLOOR], [mix(0, 5, k), mix(0, 2, k), mix(35, 158, k), mix(8, 12, k), mix(14, 56, k)]);
}

/** Rodillo en el glúteo: sentado encima, un tobillo cruzado sobre la otra rodilla, y va y viene. */
function gluteRollPose(t: number): FigurePose {
  const s = 8 * wave(t, 3.2);
  const hip: Point = [150 + s, 213];
  const hand: Point = [101, 236];
  const shoulder = at(hip, L_TORSO, 234);
  const footFar: Point = [212, 236];
  const kneeFar = knee(footFar, hip, 'up');
  const crossedAnkle: Point = [kneeFar[0] - 3, kneeFar[1] - 4];
  const crossedKnee = knee(crossedAnkle, hip, 'up');
  return {
    legs: [crossedAnkle, crossedKnee, hip],
    legs2: [footFar, kneeFar, hip],
    foot: [crossedAnkle[0], crossedAnkle[1], crossedAnkle[0] + 12, crossedAnkle[1] + 4],
    foot2: [footFar[0], footFar[1], footFar[0] + 13, FLOOR],
    torso: [hip, shoulder],
    arm: armTo(shoulder, hand, 'back'),
    head: [shoulder[0] - 6, shoulder[1] - 22],
    hand: reach(shoulder, hand),
    dyn: [{ kind: 'circle', cx: 150, cy: 227, r: 10, role: 'plate' }],
  };
}

/** Rodillo en la zona lumbar: tumbado, rodillas dobladas, unos centímetros arriba y abajo. */
function lowerBackRollPose(t: number): FigurePose {
  const s = 9 * wave(t, 3.2);
  const hip: Point = [164 + s, 213];
  const shoulder: Point = [hip[0] - 51.2, 204];
  const foot: Point = [222, 236];
  const hand: Point = [shoulder[0] - 17, shoulder[1] - 11];
  return {
    legs: [foot, knee(foot, hip, 'up'), hip],
    foot: [foot[0], foot[1], foot[0] + 13, FLOOR],
    torso: [hip, shoulder],
    arm: [shoulder, [shoulder[0] + 2, shoulder[1] - 25], hand],
    head: [shoulder[0] - 21, shoulder[1] - 2],
    hand,
    dyn: [{ kind: 'circle', cx: 140, cy: 226, r: 11, role: 'plate' }],
  };
}

/** Zancada del hombre araña: una mano en el suelo junto al pie y la otra gira hacia el techo. */
function spidermanPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hip: Point = [138, 202];
  const front_: Point = [190, 236];
  const back: Point = [46, 232];
  const shoulder = at(hip, L_TORSO, 108);
  const support: Point[] = armTo(shoulder, [196, 236], 'back');
  const [el, hand] = straight(shoulder, mix(8, 182, k));
  return {
    legs: [front_, knee(front_, hip, 'up'), hip],
    legs2: [back, between(back, hip, 0.49), hip],
    foot: [front_[0], front_[1], front_[0] + 13, FLOOR],
    foot2: [back[0], back[1], back[0] - 4, FLOOR],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    arm2: support,
    head: [shoulder[0] + 21, shoulder[1] - 5],
    hand,
  };
}

/** Columna torácica con la barra: de rodillas, los codos sobre la barra y el pecho se hunde. */
function barThoracicPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hip: Point = [130, 186];
  const shoulder = at(hip, L_TORSO, mix(112, 84, k));
  const el: Point = [206, 172];
  const hand: Point = [214, 152];
  return {
    legs: [[82.1, 234], [130, 236], hip],
    foot: [82.1, 234, 70, 237],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + 17, shoulder[1] + mix(4, 12, k)],
    hand,
  };
}

/** Rodilla al pecho: tumbado, una pierna estirada y la otra viene hacia el pecho con las manos. */
function kneeToChestPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const shoulder: Point = [100, 228];
  const hip: Point = [151.96, 230];
  const bent = plus(hip, dir(mix(40, 122, k)), L_THIGH);
  const ankle = plus(bent, dir(mix(-48, -12, k)), L_SHANK);
  const straightAnkle: Point = [249.6, 234];
  const hands = reach(shoulder, [bent[0] + 2, bent[1] + 4]);
  return {
    legs: [ankle, bent, hip],
    legs2: [straightAnkle, between(straightAnkle, hip, 0.49), hip],
    foot: [ankle[0], ankle[1], ankle[0] + 12, ankle[1] + 3],
    foot2: [straightAnkle[0], straightAnkle[1], straightAnkle[0] + 3, straightAnkle[1] - 14],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(shoulder, hands, L_UPPER, L_FORE, 'down'), hands],
    head: [shoulder[0] - 21, shoulder[1] - 4],
    hand: hands,
  };
}

/** Flexor de cadera: rodilla de atrás en el suelo y la cadera empuja hacia delante. */
function hipFlexorPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const backKnee: Point = [112, 235];
  const hip = plus(backKnee, dir(mix(98, 52, k)), L_THIGH);
  const footFront: Point = [200, 236];
  const kneeFront = knee(footFront, hip, 'up');
  const shoulder = at(hip, L_TORSO, mix(172, 184, k));
  const backAnkle: Point = [64, 234];
  const hands = reach(shoulder, [kneeFront[0] - 6, kneeFront[1] - 2]);
  return {
    legs: [footFront, kneeFront, hip],
    legs2: [backAnkle, backKnee, hip],
    foot: [footFront[0], footFront[1], footFront[0] + 14, FLOOR],
    foot2: [backAnkle[0], backAnkle[1], backAnkle[0] - 13, 237],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(shoulder, hands, L_UPPER, L_FORE, 'down'), hands],
    head: [shoulder[0] + 2, shoulder[1] - 22],
    hand: hands,
  };
}

export const STRETCH_ANIMATIONS = {
  scorpions: makeAnim(scorpionPose, 4, MAT, false),
  'sumo-squat-rocking-stretch': makeAnim(sumoRockPose, 4),
  'reclining-butterfly': makeAnim(recliningButterflyPose, STRETCH, MAT, false),
  'sit-up-to-straddle': makeAnim(sitUpStraddlePose, 3.4, [], false),
  'thoracic-mobility-stretch': makeAnim(thoracicRotationPose, STRETCH),
  'lying-glute-stretch': makeAnim(lyingGlutePose, STRETCH, MAT, false),
  'standing-forward-bend': makeAnim(forwardBendPose, STRETCH),
  'foam-roll-glutes': makeAnim(gluteRollPose, 3.2),
  'straddle-stretch': makeAnim(straddlePose, 6.2),
  'foam-roll-lower-back': makeAnim(lowerBackRollPose, 3.2),
  'spiderman-lunge': makeAnim(spidermanPose, STRETCH),
  'lateral-leg-swings': makeAnim(lateralSwingPose, 1.8, [line(204, 56, 204, FLOOR)]),
  'thoracic-spine-bb-stretch': makeAnim(barThoracicPose, STRETCH, [{ kind: 'circle', cx: 208, cy: 181, r: 7, role: 'ring' }, line(212, 187, 218, FLOOR)]),
  'lying-knee-to-chest': makeAnim(kneeToChestPose, STRETCH),
  'hip-flexor-stretch': makeAnim(hipFlexorPose, STRETCH),
};
