import { BASE_ANIMATIONS, L_FORE, L_SHANK, L_THIGH, L_TORSO, L_UPPER, at, elbow, interpolate, plankPose, standingBody, type DynShape, type FigurePose, type Keyframes, type Point } from './movementAnimation';
import { FLOOR, dir, line, makeAnim, plus } from './movementAnimationMore';

/**
 * Las animaciones del calentamiento. Los que se hacen de lado a lado (saltos, pasos laterales, círculos de brazos) van de frente; el resto, de
 * perfil. Los circuitos (activación de hombro, activación de cadera) enseñan su ejercicio más reconocible.
 */

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const between = (a: Point, b: Point, k: number): Point => [mix(a[0], b[0], k), mix(a[1], b[1], k)];
const wave = (t: number, d: number) => Math.sin((t / d) * Math.PI * 2);
/** La mano, como mucho a un brazo de distancia del hombro. */
const reach = (shoulder: Point, hand: Point, max = L_UPPER + L_FORE - 0.4): Point => {
  const d = Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1]);
  return d <= max ? hand : between(shoulder, hand, max / d);
};

// ---------- De frente ----------

/** La segunda mano: de frente se ven las dos, y la segunda lleva el mismo punto que la primera. */
const dot = (p: Point): DynShape => ({ kind: 'circle', cx: p[0], cy: p[1], r: 7, role: 'ball' });
const strap = (a: Point, b: Point): DynShape => ({ kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], role: 'crank' });

interface Front {
  hip: Point;
  /** [pie, rodilla] de la izquierda y de la derecha de la pantalla. */
  left: [Point, Point];
  right: [Point, Point];
  /** [codo, mano] de cada brazo. */
  armLeft: [Point, Point];
  armRight: [Point, Point];
  dyn?: DynShape[];
}

/** Un cuerpo visto de frente: las dos piernas y los dos brazos van en el mismo trazo, del mismo color. */
export function front({ hip, left, right, armLeft, armRight, dyn = [] }: Front): FigurePose {
  const shoulder: Point = [hip[0], hip[1] - L_TORSO];
  const [lf, lk] = left;
  const [rf, rk] = right;
  return {
    legs: [lf, lk, hip, rk, rf, [rf[0] + 10, rf[1]]],
    torso: [hip, shoulder],
    arm: [shoulder, armLeft[0], armLeft[1], armLeft[0], shoulder, armRight[0], armRight[1]],
    head: [hip[0], shoulder[1] - 22],
    foot: [lf[0] - 10, lf[1], lf[0], lf[1]],
    hand: armLeft[1],
    dyn: [...dyn, dot(armRight[1])],
  };
}

/** Un brazo recto desde el hombro, a `angle` grados desde «hacia abajo»; positivo = hacia la derecha de la pantalla. */
export const straight = (shoulder: Point, angle: number, length = L_UPPER + L_FORE - 0.5): [Point, Point] => [at(shoulder, length * 0.52, angle), at(shoulder, length, angle)];

/** La rodilla de una pierna vista de frente: a una distancia fija del pie, hacia fuera. */
function kneeFrom(foot: Point, hip: Point, out: number, length: number): Point {
  const aim: Point = [(foot[0] + hip[0]) / 2 + out, (foot[1] + hip[1]) / 2];
  const d = Math.hypot(aim[0] - foot[0], aim[1] - foot[1]);
  return between(foot, aim, length / d);
}

function jumpingJackPose(t: number): FigurePose {
  const d = 1.2;
  const k = 0.5 - 0.5 * Math.cos((t / d) * Math.PI * 2);
  const jump = 9 * Math.abs(wave(t, d));
  const spread = mix(8, 40, k);
  const hip: Point = [150, FLOOR - Math.sqrt(97 ** 2 - spread ** 2) - jump];
  const shoulder: Point = [150, hip[1] - L_TORSO];
  const lf: Point = [150 - spread, FLOOR - jump];
  const rf: Point = [150 + spread, FLOOR - jump];
  const angle = mix(16, 162, k);
  return front({ hip, left: [lf, between(lf, hip, 0.5)], right: [rf, between(rf, hip, 0.5)], armLeft: straight(shoulder, -angle), armRight: straight(shoulder, angle) });
}

function armCirclesPose(t: number): FigurePose {
  const d = 2;
  const angle = 360 * (t / d);
  const hip: Point = [150, 141];
  const shoulder: Point = [150, hip[1] - L_TORSO];
  const lf: Point = [132, FLOOR];
  const rf: Point = [168, FLOOR];
  return front({ hip, left: [lf, between(lf, hip, 0.5)], right: [rf, between(rf, hip, 0.5)], armLeft: straight(shoulder, -angle), armRight: straight(shoulder, angle) });
}

/** Abrazos: brazos abiertos y se cruzan por el pecho, una vez cada uno por encima. [codo izq x,y, mano izq x,y, codo der x,y, mano der x,y] */
const OPEN = [122, 88, 95, 91, 178, 88, 205, 91];
const HUG_A = [141, 112, 171, 99, 158, 105, 128, 108];
const HUG_B = [142, 105, 172, 108, 159, 112, 127, 98];
const HUG_KF: Keyframes = [
  [0, OPEN],
  [0.55, HUG_A],
  [0.75, HUG_A],
  [1.3, OPEN],
  [1.85, HUG_B],
  [2.05, HUG_B],
  [2.6, OPEN],
];
function armHugsPose(t: number): FigurePose {
  const v = interpolate(HUG_KF, t);
  const hip: Point = [150, 141];
  const lf: Point = [134, FLOOR];
  const rf: Point = [166, FLOOR];
  return front({
    hip,
    left: [lf, between(lf, hip, 0.5)],
    right: [rf, between(rf, hip, 0.5)],
    armLeft: [[v[0], v[1]], [v[2], v[3]]],
    armRight: [[v[4], v[5]], [v[6], v[7]]],
  });
}

/** El palo da la vuelta entera: delante de la cadera, por un lado, sobre la cabeza y por el otro. */
function aroundTheWorldPose(t: number): FigurePose {
  const d = 3.2;
  const angle = 360 * (t / d);
  const hip: Point = [150, 141];
  const shoulder: Point = [150, hip[1] - L_TORSO];
  const lf: Point = [130, FLOOR];
  const rf: Point = [170, FLOOR];
  const armLeft = straight(shoulder, angle - 34);
  const armRight = straight(shoulder, angle + 34);
  const a = armLeft[1];
  const b = armRight[1];
  const stick = strap(between(a, b, -0.22), between(a, b, 1.22));
  return front({ hip, left: [lf, between(lf, hip, 0.5)], right: [rf, between(rf, hip, 0.5)], armLeft, armRight, dyn: [stick] });
}

/** Activación de hombro con banda: se abre en cruz, vuelve, sube en Y y vuelve. [codo izq x,y, mano izq x,y] (el derecho, en espejo). */
const BAND_FRONT = [143, 95, 141, 104];
const BAND_T = [121, 89, 94, 88];
const BAND_Y = [132, 65, 114, 43];
const BAND_KF: Keyframes = [
  [0, BAND_FRONT],
  [0.7, BAND_T],
  [1.0, BAND_T],
  [1.6, BAND_FRONT],
  [2.3, BAND_Y],
  [2.6, BAND_Y],
  [3.2, BAND_FRONT],
];
function shoulderBandPose(t: number): FigurePose {
  const [ex, ey, hx, hy] = interpolate(BAND_KF, t);
  const hip: Point = [150, 141];
  const lf: Point = [132, FLOOR];
  const rf: Point = [168, FLOOR];
  return front({
    hip,
    left: [lf, between(lf, hip, 0.5)],
    right: [rf, between(rf, hip, 0.5)],
    armLeft: [[ex, ey], [hx, hy]],
    armRight: [[300 - ex, ey], [300 - hx, hy]],
    dyn: [strap([hx, hy], [300 - hx, hy])],
  });
}

/** Pasos laterales en media sentadilla: [pie izq x, y, pie der x, y, centro]. Un pie abre, el otro lo sigue, y vuelta. */
const stepKf = (width: number, travel: number, d: number): Keyframes => {
  const l = 150 - width / 2 - travel / 2;
  const r = l + width;
  const c = (l + r) / 2;
  const u = d / 8;
  return [
    [0, [l, FLOOR, r, FLOOR, c]],
    [u, [l, FLOOR, r + travel / 2, FLOOR - 9, c + travel * 0.2]],
    [2 * u, [l, FLOOR, r + travel, FLOOR, c + travel * 0.5]],
    [3 * u, [l + travel / 2, FLOOR - 9, r + travel, FLOOR, c + travel * 0.8]],
    [4 * u, [l + travel, FLOOR, r + travel, FLOOR, c + travel]],
    [5 * u, [l + travel / 2, FLOOR - 9, r + travel, FLOOR, c + travel * 0.8]],
    [6 * u, [l, FLOOR, r + travel, FLOOR, c + travel * 0.5]],
    [7 * u, [l, FLOOR, r + travel / 2, FLOOR - 9, c + travel * 0.2]],
    [8 * u, [l, FLOOR, r, FLOOR, c]],
  ];
};

function lateralSteps(width: number, travel: number, d: number, hipY: number, band: boolean) {
  const kf = stepKf(width, travel, d);
  return (t: number): FigurePose => {
    const [lx, ly, rx, ry, cx] = interpolate(kf, t);
    const hip: Point = [cx, hipY];
    const shoulder: Point = [cx, hipY - L_TORSO];
    const lf: Point = [lx, ly];
    const rf: Point = [rx, ry];
    const lk = kneeFrom(lf, hip, -14, 44);
    const rk = kneeFrom(rf, hip, 14, 44);
    // Manos juntas delante del pecho.
    const hands: Point = [cx, shoulder[1] + 16];
    return front({
      hip,
      left: [lf, lk],
      right: [rf, rk],
      armLeft: [[cx - 20, shoulder[1] + 22], [hands[0] - 3, hands[1]]],
      armRight: [[cx + 20, shoulder[1] + 22], [hands[0] + 3, hands[1]]],
      dyn: band ? [strap(lk, rk)] : [],
    });
  };
}

// ---------- De perfil ----------

/** Carrera en el sitio: la pierna que sube dobla el muslo (`knees`) y la rodilla (`heel`). */
function onTheSpot(knees: number, heel: number, d: number) {
  return (t: number): FigurePose => {
    const s = wave(t, d);
    const near = Math.max(0, s);
    const far = Math.max(0, -s);
    const hip: Point = [140, 139 - 4 * Math.abs(s)];
    const ground = 139 - hip[1];
    const leg = (up: number) => {
      const thigh = knees * up;
      const knee = at(hip, L_THIGH, thigh);
      const ankle = at(knee, L_SHANK, thigh - heel * up);
      // El pie de apoyo, plano; al levantarse, la punta cae.
      const toe: Point = [ankle[0] + 13 - 6 * up, ankle[1] + 9 * up - ground * (1 - up)];
      return { legs: [ankle, knee, hip] as Point[], foot: [ankle[0], ankle[1], toe[0], Math.min(FLOOR, toe[1])] as [number, number, number, number] };
    };
    const a = leg(near);
    const b = leg(far);
    const shoulder: Point = at(hip, L_TORSO, 176);
    const armOf = (angle: number): Point[] => {
      const el = at(shoulder, L_UPPER, angle);
      return [shoulder, el, at(el, L_FORE, angle + 80)];
    };
    const arm = armOf(-38 * s);
    return {
      legs: a.legs,
      foot: a.foot,
      legs2: b.legs,
      foot2: b.foot,
      torso: [hip, shoulder],
      arm,
      arm2: armOf(38 * s),
      head: [shoulder[0] + 4, shoulder[1] - 22],
      hand: arm[2],
    };
  };
}

/** Correr hacia atrás: la zancada de correr al revés, con el suelo pasando hacia delante. */
const RUN = BASE_ANIMATIONS.run;
const backwardRunPose = (t: number): FigurePose => RUN.pose((RUN.duration - (t % RUN.duration)) % RUN.duration);

/** Plancha con las rodillas al pecho, una y otra. */
function mountainClimberPose(t: number): FigurePose {
  const s = wave(t, 0.9);
  const plank = plankPose([80, 234], [220, 238], 180.5);
  const [ankle, knee, hip] = plank.legs;
  const leg = (k: number): Point[] => [between(ankle, [160, 232], k), between(knee, [205, 225], k), hip];
  const near = leg(Math.max(0, s));
  const far = leg(Math.max(0, -s));
  const foot = (p: Point[]): [number, number, number, number] => [p[0][0], p[0][1], p[0][0] + 7, FLOOR];
  return { ...plank, legs: near, foot: foot(near), legs2: far, foot2: foot(far) };
}

/** Sit-up hasta pica: tumbado con los brazos atrás, sube y se dobla hacia los pies. [ángulo del tronco, ángulo de los brazos] */
const PIKE_KF: Keyframes = [
  [0, [178, 179]],
  [0.4, [178, 179]],
  [1.1, [92, 80]],
  [1.7, [40, -20]],
  [2.1, [40, -20]],
  [2.7, [92, 80]],
  [3.4, [178, 179]],
];
function sitUpPikePose(t: number): FigurePose {
  const [torso, arms] = interpolate(PIKE_KF, t);
  const hip: Point = [140, 229];
  const shoulder = plus(hip, dir(torso), L_TORSO);
  const hand = plus(shoulder, dir(arms), L_UPPER + L_FORE - 0.5);
  const handOnFloor: Point = [hand[0], Math.min(235, hand[1])];
  const ankle: Point = [237.8, 232];
  return {
    legs: [ankle, between(ankle, hip, L_SHANK / (L_THIGH + L_SHANK)), hip],
    torso: [hip, shoulder],
    arm: [shoulder, between(shoulder, handOnFloor, 0.52), handOnFloor],
    head: plus(shoulder, dir(Math.min(torso, 168)), 21),
    foot: [ankle[0], ankle[1], ankle[0] + 3, ankle[1] - 15],
    hand: handOnFloor,
  };
}

/**
 * Gusano con flexión: de pie, las manos caminan hasta la plancha, una flexión, y los pies vuelven hacia las manos (el suelo pasa).
 * [altura del tobillo, ángulo de las piernas, ángulo del tronco, mano x, mano y]
 */
const W_STAND = [238, 90, 180, 84, 146];
const W_FOLD = [238, 94, 40, 116, 236];
const W_PIKE = [235, 70, 31, 170, 237];
const W_PLANK = [234, 20.9, 111, 220, 238];
const W_LOW = [234, 3.8, 94, 220, 238];
const WORM_KF: Keyframes = [
  [0, W_STAND],
  [0.3, W_STAND],
  [0.9, W_FOLD],
  [1.5, W_PIKE],
  [2.1, W_PLANK],
  [2.7, W_LOW],
  [3.3, W_PLANK],
  [3.9, W_PIKE],
  [4.5, W_FOLD],
  [5.1, W_STAND],
];
/** Lo que avanzan las manos: lo mismo que luego avanzan los pies. */
const WORM_ADVANCE = 104;
function inchwormPose(t: number): FigurePose {
  const [ankleY, legAngle, torsoAngle, handX, handY] = interpolate(WORM_KF, t);
  const ankle: Point = [80, ankleY];
  const hip = plus(ankle, dir(legAngle), L_THIGH + L_SHANK - 0.2);
  const shoulder = at(hip, L_TORSO, torsoAngle);
  const hand = reach(shoulder, [handX, handY]);
  // En la vuelta el que avanza es el atleta: las marcas del suelo pasan hacia atrás.
  const v = Math.min(1, Math.max(0, (t - 3.3) / 1.2));
  const shift = WORM_ADVANCE * v * v * (3 - 2 * v);
  const ticks: DynShape[] = Array.from({ length: 5 }, (_, n) => {
    const x = 50 + ((((n * 52 - shift) % 260) + 260) % 260);
    return { kind: 'line', x1: x, y1: 245, x2: x + 16, y2: 245, role: 'tick' };
  });
  return {
    legs: [ankle, between(ankle, hip, L_SHANK / (L_THIGH + L_SHANK)), hip],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(shoulder, hand, L_UPPER, L_FORE, 'back'), hand],
    head: at(shoulder, 22, torsoAngle),
    foot: [ankle[0] - 4, ankle[1], ankle[0] + 7 + (ankleY - 234) * 2.75, FLOOR],
    hand,
    dyn: ticks,
  };
}

/** Pasar el palo (o la banda) de delante a atrás con los brazos rectos. */
function passThroughPose(t: number): FigurePose {
  const k = interpolate(
    [
      [0, [0]],
      [0.3, [0]],
      [1.5, [1]],
      [1.8, [1]],
      [3.0, [0]],
      [3.2, [0]],
    ],
    t,
  )[0];
  const body = standingBody([150, FLOOR], [0, 0, 3, 0, 0]);
  const shoulder = body.torso[1];
  const angle = mix(24, 336, k);
  const [el, hand] = straight(shoulder, angle);
  return { ...body, arm: [shoulder, el, hand], hand, dyn: [{ kind: 'circle', cx: hand[0], cy: hand[1], r: 10, role: 'plate' }] };
}

export const WARMUP_ANIMATIONS = {
  'crossover-symmetry': makeAnim(shoulderBandPose, 3.2),
  'hip-halo': makeAnim(lateralSteps(52, 34, 3.2, 163, true), 3.2),
  'jumping-jacks': makeAnim(jumpingJackPose, 1.2),
  'butt-kicks': makeAnim(onTheSpot(8, 148, 0.8), 0.8),
  'arm-hugs': makeAnim(armHugsPose, 2.6),
  'inchworm-push-up': makeAnim(inchwormPose, 5.1),
  'backward-sprint': makeAnim(backwardRunPose, RUN.duration, [line(108, 40, 170, 40, 'thin'), line(108, 40, 120, 32, 'thin'), line(108, 40, 120, 48, 'thin')]),
  'pvc-around-the-world': makeAnim(aroundTheWorldPose, 3.2),
  'arm-circles': makeAnim(armCirclesPose, 2),
  'side-shuffle': makeAnim(lateralSteps(46, 70, 2, 158, false), 2),
  'sit-up-to-pike': makeAnim(sitUpPikePose, 3.4),
  'high-knees': makeAnim(onTheSpot(92, 100, 0.8), 0.8),
  'mountain-climbers': makeAnim(mountainClimberPose, 0.9),
  'band-shoulder-dislocate': makeAnim(passThroughPose, 3.2),
};
