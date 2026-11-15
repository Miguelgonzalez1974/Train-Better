/**
 * Animaciones de movimientos: un muñeco de palitos de perfil que repite el gesto en bucle, como apoyo rápido de visión junto al movimiento
 * del WOD (no enseña técnica). Todo se calcula aquí, puro: cada movimiento es una lista de posturas (ángulos o posiciones de las
 * articulaciones) con su tiempo, y `poseAt` da el esqueleto en cualquier instante del bucle. El dibujo (SVG) vive en
 * `features/planificacion/MovementFigure.tsx`.
 *
 * Cada animación sigue UN anclaje, que es lo que fija el resto del cuerpo: de pie con los pies fijos (sentadillas, peso muerto), sentado
 * (remo, bicicleta), colgado de la barra (manos arriba fijas) o apoyado en las anillas (manos fijas); correr y la comba no anclan nada
 * y el cuerpo se mueve libre. Añadir un movimiento es añadir sus posturas a `ANIMATIONS`.
 */

export type Point = [number, number];

/** Piezas que se mueven con el cuerpo (el disco de la barra, el balón, la comba, los radios del ventilador…), ya listas para dibujar. */
export type DynShape =
  | { kind: 'circle'; cx: number; cy: number; r: number; role: 'plate' | 'ball' }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; role: 'spoke' | 'lever' | 'crank' | 'tick' }
  | { kind: 'polyline'; points: Point[]; role: 'rope' };

/** El esqueleto de un instante, en las coordenadas del `box` de su animación (x a la derecha, y hacia abajo). */
export interface FigurePose {
  /** Cadera → rodilla → tobillo (en el remo empieza en el tobillo anclado). */
  legs: Point[];
  torso: Point[];
  /** Hombro → codo → mano, o mano → codo → hombro: siempre acaba o empieza en la mano. */
  arm: Point[];
  head: Point;
  foot: [number, number, number, number];
  /** La mano, donde va el agarre. */
  hand: Point;
  /** La pierna y el brazo del otro lado (se dibujan más tenues): solo donde se ven los dos, como al correr o pedalear. */
  legs2?: Point[];
  arm2?: Point[];
  foot2?: [number, number, number, number];
  /** Piezas que se mueven con el cuerpo (el asiento y el cable del remo). */
  seat?: [number, number, number, number];
  cable?: [number, number, number, number];
  /** Material que se mueve: siempre las mismas piezas y en el mismo orden en todos los instantes de una animación. */
  dyn?: DynShape[];
}

/** Elementos fijos del material (barra, raíl, anillas…), ya listos para dibujar. */
export type PropShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; role: 'floor' | 'frame' | 'thin' }
  | { kind: 'circle'; cx: number; cy: number; r: number; role: 'frame' | 'ring' };

export interface MovementAnimation {
  /** Cuadro visible: «x y ancho alto». */
  box: [number, number, number, number];
  /** Segundos que dura una vuelta. */
  duration: number;
  props: PropShape[];
  pose: (t: number) => FigurePose;
}

const RAD = Math.PI / 180;
const L_UPPER = 30;
const L_FORE = 28;
const L_THIGH = 50;
const L_SHANK = 48;
const L_TORSO = 52;

type Keyframes = [number, number[]][];

const ease = (x: number) => x * x * (3 - 2 * x);

/** Interpola (con suavizado) entre las posturas de una lista con tiempos; fuera de rango, la primera o la última. */
export function interpolate(keyframes: Keyframes, t: number): number[] {
  if (t <= keyframes[0][0]) return keyframes[0][1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const [t0, a] = keyframes[i];
    const [t1, b] = keyframes[i + 1];
    if (t >= t0 && t <= t1) {
      const k = ease(t1 === t0 ? 1 : (t - t0) / (t1 - t0));
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return keyframes[keyframes.length - 1][1];
}

/**
 * Codo de un brazo de dos tramos entre `from` y `to` (cinemática inversa). `pick` dice hacia dónde dobla: `down` (el codo más bajo) o
 * `back` (el codo más atrás, a la izquierda). Si `to` queda más lejos de lo que alcanza el brazo, se estira del todo.
 */
export function elbow(from: Point, to: Point, l1: number, l2: number, pick: 'down' | 'back' | 'front'): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d0 = Math.hypot(dx, dy);
  const ux = d0 > 0.001 ? dx / d0 : 0;
  const uy = d0 > 0.001 ? dy / d0 : 1;
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1), l1 + l2 - 0.3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const px = from[0] + ux * a;
  const py = from[1] + uy * a;
  const c1: Point = [px - uy * h, py + ux * h];
  const c2: Point = [px + uy * h, py - ux * h];
  if (pick === 'down') return c1[1] >= c2[1] ? c1 : c2;
  if (pick === 'front') return c1[0] >= c2[0] ? c1 : c2;
  return c1[0] <= c2[0] ? c1 : c2;
}

/** El punto a `length` de `origin` en la dirección `angleDeg` medida desde «recto hacia abajo» (positivo = hacia la derecha). */
const at = (origin: Point, length: number, angleDeg: number): Point => [origin[0] + length * Math.sin(angleDeg * RAD), origin[1] + length * Math.cos(angleDeg * RAD)];

// --- Row (remo ergómetro): sentado, pies fijos en el estribo. Params: [rodilla, muslo, torso, brazo, antebrazo] en grados. ---
const ROW_CATCH = [10, 104, 25, 70, 70];
const ROW_DRIVE = [-70, 70, 22, 70, 70];
const ROW_FINISH = [-70, 70, -25, -25, 80];
const ROW_KF: Keyframes = [
  [0, ROW_CATCH],
  [0.9, ROW_DRIVE],
  [1.4, ROW_FINISH],
  [1.6, ROW_FINISH],
  [2.1, [-70, 70, -8, 70, 70]],
  [2.6, [-70, 70, 25, 70, 70]],
  [3.4, ROW_CATCH],
];
const ROW_FLYWHEEL: Point = [243, 148];

function rowPose(t: number): FigurePose {
  const p = interpolate(ROW_KF, t);
  const ankle: Point = [195, 175];
  const knee: Point = [ankle[0] + L_SHANK * Math.sin(p[0] * RAD), ankle[1] - L_SHANK * Math.cos(p[0] * RAD)];
  const hip: Point = [knee[0] - L_THIGH * Math.sin(p[1] * RAD), knee[1] - L_THIGH * Math.cos(p[1] * RAD)];
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(p[2] * RAD), hip[1] - L_TORSO * Math.cos(p[2] * RAD)];
  const el = at(shoulder, L_UPPER, p[3]);
  const hand = at(el, L_FORE, p[4]);
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + Math.sin(p[2] * RAD) * 22 + 2, shoulder[1] - Math.cos(p[2] * RAD) * 22],
    foot: [ankle[0] - 8, ankle[1], ankle[0] + 18, ankle[1]],
    hand,
    seat: [hip[0] - 14, hip[1] + 9, hip[0] + 10, hip[1] + 9],
    cable: [hand[0], hand[1], ROW_FLYWHEEL[0], ROW_FLYWHEEL[1]],
  };
}

// --- Colgado de una barra recta arriba. Params: [hombro x, hombro y, torso, muslo, pierna] (hombro en coordenadas, resto en grados). ---
const BAR_Y = 34;
const BAR_X = 150;
// Con los brazos casi del todo estirados (el hombro a ~57 de la mano): así el codo apenas se dobla colgado.
const HANG = [150, 91.5, 0, 0, 0];
const KIP_ARCH = [146, 91.5, -12, -18, -30];
const KIP_HOLLOW = [158, 91.5, 16, 32, 26];
const PULL_MID = [134, 62, 14, 24, 0];
const PULL_TOP = [128, 40, 12, 10, -8];
const KIPPING_KF: Keyframes = [
  [0, HANG],
  [0.5, KIP_ARCH],
  [1.1, KIP_HOLLOW],
  [1.7, PULL_MID],
  [2.3, PULL_TOP],
  [2.6, PULL_TOP],
  [3.6, HANG],
  [3.8, HANG],
];

/** Cuerpo que cuelga o se apoya con las manos fijas: el hombro va donde dice la postura y el brazo se dobla para llegar a la mano. */
function bodyFromHands(hand: Point, p: number[], bend: 'down' | 'back'): FigurePose {
  const shoulder: Point = [p[0], p[1]];
  const el = elbow(hand, shoulder, L_FORE, L_UPPER, bend);
  const hip = at(shoulder, L_TORSO, p[2]);
  const knee = at(hip, L_THIGH, p[3]);
  const ankle = at(knee, L_SHANK, p[4]);
  return {
    legs: [hip, knee, ankle],
    torso: [shoulder, hip],
    arm: [hand, el, shoulder],
    head: [shoulder[0] - Math.sin(p[2] * RAD) * 20 + 2, shoulder[1] - Math.cos(p[2] * RAD) * 20],
    foot: [ankle[0], ankle[1], ankle[0] + 12, ankle[1] + 3],
    hand,
  };
}

// --- Fondos en anillas, de lado: manos fijas en las anillas, el cuerpo sube y baja. ---
const RING_HAND: Point = [150, 104];
const DIP_SUPPORT = [150, 46.5, -4, -6, -30];
const DIP_BOTTOM = [146, 112, -22, -8, -40];
const DIP_KF: Keyframes = [
  [0, DIP_SUPPORT],
  [1.2, DIP_BOTTOM],
  [1.6, DIP_BOTTOM],
  [2.8, DIP_SUPPORT],
  [3.2, DIP_SUPPORT],
];

// --- Toes-to-bar: colgado como la dominada, pero los pies suben hasta tocar la barra (el cuerpo se dobla por la cadera). ---
const TTB_HOLLOW = [158, 91.5, 18, 35, 32];
// Hombro a 57,5 de la barra: tronco (52) + piernas (98) cierran el triángulo con los pies en la barra.
const TTB_TOES = [150, 91.5, 52, 204.7, 204.7];
const TTB_KF: Keyframes = [
  [0, HANG],
  [0.5, KIP_ARCH],
  [1.0, TTB_HOLLOW],
  [1.6, TTB_TOES],
  [1.9, TTB_TOES],
  [2.7, HANG],
  [3.0, HANG],
];

/** Cuerpo de pie con los pies fijos en `ankle`, de abajo arriba: [rodilla, muslo, torso, brazo, antebrazo] en grados (hacia delante = positivo). */
function standingBody(ankle: Point, p: number[]): FigurePose {
  const knee: Point = [ankle[0] + L_SHANK * Math.sin(p[0] * RAD), ankle[1] - L_SHANK * Math.cos(p[0] * RAD)];
  const hip: Point = [knee[0] - L_THIGH * Math.sin(p[1] * RAD), knee[1] - L_THIGH * Math.cos(p[1] * RAD)];
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(p[2] * RAD), hip[1] - L_TORSO * Math.cos(p[2] * RAD)];
  const el = at(shoulder, L_UPPER, p[3]);
  const hand = at(el, L_FORE, p[4]);
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + Math.sin(p[2] * RAD) * 22 + 2, shoulder[1] - Math.cos(p[2] * RAD) * 22],
    foot: [ankle[0] - 6, ankle[1], ankle[0] + 18, ankle[1]],
    hand,
  };
}

// --- Thruster: sentadilla frontal y empuje por encima de la cabeza en un solo gesto. ---
const TH_RACK = [0, 0, 2, 75, 175];
const TH_BOTTOM = [38, 78, 22, 75, 175];
const TH_DRIVE = [4, 4, 0, 115, 178];
const TH_LOCK = [0, 0, 0, 180, 180];
const THRUSTER_KF: Keyframes = [
  [0, TH_RACK],
  [0.8, TH_BOTTOM],
  [1.0, TH_BOTTOM],
  [1.5, TH_DRIVE],
  [1.9, TH_LOCK],
  [2.4, TH_LOCK],
  [3.3, TH_RACK],
  [3.6, TH_RACK],
];

function thrusterPose(t: number): FigurePose {
  const pose = standingBody([130, 238], interpolate(THRUSTER_KF, t));
  return { ...pose, dyn: [{ kind: 'circle', cx: pose.hand[0], cy: pose.hand[1], r: 15, role: 'plate' }] };
}

// --- Wall ball: sentadilla con el balón al pecho y lanzamiento a la marca de la pared; el balón vuelve y se recoge. ---
const WB_HOLD = [0, 0, 2, 75, 175];
const WB_BOTTOM = [38, 78, 22, 75, 175];
const WB_RELEASE = [4, 4, 0, 130, 160];
const WB_UP = [0, 0, 0, 150, 150];
const WB_CATCH = [0, 0, 0, 100, 140];
const WALL_BALL_KF: Keyframes = [
  [0, WB_HOLD],
  [0.7, WB_BOTTOM],
  [0.9, WB_BOTTOM],
  [1.3, WB_RELEASE],
  [1.8, WB_UP],
  [2.3, WB_CATCH],
  [2.8, WB_HOLD],
  [3.0, WB_HOLD],
];
const WB_ANKLE: Point = [105, 238];
const WB_TARGET: Point = [236, 58];
const WB_RELEASE_T = 1.3;
const WB_PEAK_T = 1.75;
const WB_CATCH_T = 2.3;

const ballAtHand = (t: number): Point => {
  const hand = standingBody(WB_ANKLE, interpolate(WALL_BALL_KF, t)).hand;
  return [hand[0] + 8, hand[1] - 6];
};

function wallBallPose(t: number): FigurePose {
  const pose = standingBody(WB_ANKLE, interpolate(WALL_BALL_KF, t));
  let ball: Point;
  if (t < WB_RELEASE_T || t >= WB_CATCH_T) ball = ballAtHand(t);
  else if (t < WB_PEAK_T) {
    const u = (t - WB_RELEASE_T) / (WB_PEAK_T - WB_RELEASE_T);
    const k = 1 - (1 - u) * (1 - u);
    const from = ballAtHand(WB_RELEASE_T);
    ball = [from[0] + (WB_TARGET[0] - from[0]) * k, from[1] + (WB_TARGET[1] - from[1]) * k];
  } else {
    const u = (t - WB_PEAK_T) / (WB_CATCH_T - WB_PEAK_T);
    const k = u * u;
    const to = ballAtHand(WB_CATCH_T);
    ball = [WB_TARGET[0] + (to[0] - WB_TARGET[0]) * k, WB_TARGET[1] + (to[1] - WB_TARGET[1]) * k];
  }
  return { ...pose, dyn: [{ kind: 'circle', cx: ball[0], cy: ball[1], r: 12, role: 'ball' }] };
}

// --- Peso muerto: barra en el suelo que sube con los brazos estirados hasta ponerse de pie, y vuelve. ---
const DL_START = [32, 82, 42, 0, 0];
const DL_MID = [16, 62, 38, 0, 0];
const DL_LOCK = [0, 0, 0, 0, 0];
const DEADLIFT_KF: Keyframes = [
  [0, DL_START],
  [0.4, DL_START],
  [1.3, DL_MID],
  [1.9, DL_LOCK],
  [2.3, DL_LOCK],
  [3.2, DL_MID],
  [3.9, DL_START],
  [4.2, DL_START],
];

function deadliftPose(t: number): FigurePose {
  const pose = standingBody([130, 238], interpolate(DEADLIFT_KF, t));
  return { ...pose, dyn: [{ kind: 'circle', cx: pose.hand[0], cy: pose.hand[1], r: 26, role: 'plate' }] };
}

// --- Double under: salto con la comba pasando dos veces por vuelta. Params: [altura del salto, flexión, giro de la comba en grados]. ---
const DU_KF: Keyframes = [
  [0, [0, 12, 0]],
  [0.15, [0, 18, 90]],
  [0.35, [14, 0, 360]],
  [0.55, [3, 10, 630]],
  [0.7, [0, 12, 720]],
];
const DU_ROPE_CENTER: Point = [162, 150];
const DU_ROPE_RADIUS = 94;

function doubleUnderPose(t: number): FigurePose {
  const [lift, bend, spin] = interpolate(DU_KF, t);
  const rad = spin * RAD;
  // Las muñecas dibujan un circulito con la comba.
  const pose = standingBody([150, 238 - lift], [bend * 0.6, bend * 0.9, 2, 8 + 10 * Math.sin(rad), 75 + 18 * Math.cos(rad)]);
  const points: Point[] = [];
  for (let a = 0; a <= 235; a += 15) {
    const ang = (spin + a) * RAD;
    points.push([DU_ROPE_CENTER[0] + DU_ROPE_RADIUS * Math.cos(ang), DU_ROPE_CENTER[1] + DU_ROPE_RADIUS * Math.sin(ang)]);
  }
  return { ...pose, dyn: [{ kind: 'polyline', points, role: 'rope' }] };
}

// --- Correr: sin anclaje; las piernas y los brazos van a contrafase y el suelo pasa hacia atrás. ---
const RUN_DURATION = 0.8;
const RUN_HIP_X = 140;

/** Una pierna de la zancada en la fase `phase` (grados): el muslo oscila y la rodilla se dobla más al recuperar. */
function runLeg(hip: Point, phase: number): { legs: Point[]; foot: [number, number, number, number] } {
  const ps = phase * RAD;
  const thigh = 38 * Math.sin(ps);
  const flex = 15 + 70 * (0.5 + 0.5 * Math.cos((phase + 40) * RAD));
  const knee = at(hip, L_THIGH, thigh);
  const ankle = at(knee, L_SHANK, thigh - flex);
  return { legs: [hip, knee, ankle], foot: [ankle[0], ankle[1], ankle[0] + 12, ankle[1] + 2] };
}

function runPose(t: number): FigurePose {
  const phase = (360 * t) / RUN_DURATION;
  const hip: Point = [RUN_HIP_X, 134 + 3 * Math.cos(2 * phase * RAD)];
  const near = runLeg(hip, phase);
  const far = runLeg(hip, phase + 180);
  const lean = 8;
  const shoulder: Point = [hip[0] + L_TORSO * Math.sin(lean * RAD), hip[1] - L_TORSO * Math.cos(lean * RAD)];
  const swing = -40 * Math.sin(phase * RAD);
  const armOf = (d: number): Point[] => {
    const el = at(shoulder, L_UPPER, d);
    return [shoulder, el, at(el, L_FORE, d + 75)];
  };
  const arm = armOf(swing);
  // Rayitas en el suelo que pasan hacia atrás (dentro del cuadro visible: de 45 a 217).
  const ticks: DynShape[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (((i * 50 - 150 * (t / RUN_DURATION)) % 150) + 150) % 150;
    ticks.push({ kind: 'line', x1: 45 + x, y1: 244, x2: 67 + x, y2: 244, role: 'tick' });
  }
  return {
    legs: near.legs,
    foot: near.foot,
    legs2: far.legs,
    foot2: far.foot,
    torso: [hip, shoulder],
    arm,
    arm2: armOf(-swing),
    head: [shoulder[0] + Math.sin(lean * RAD) * 22 + 2, shoulder[1] - Math.cos(lean * RAD) * 22],
    hand: arm[2],
    dyn: ticks,
  };
}

// --- Air bike (Assault Bike): sentado, los pedales giran y las manos empujan y tiran de las palancas a contrafase. ---
const BIKE_DURATION = 1.2;
const BIKE_HIP: Point = [118, 134];
const BIKE_CRANK: Point = [160, 192];
const BIKE_PIVOT: Point = [190, 214];
const BIKE_FAN: Point = [222, 176];

function airBikePose(t: number): FigurePose {
  const phase = (360 * t) / BIKE_DURATION;
  const pedal = (deg: number): Point => [BIKE_CRANK[0] + 20 * Math.cos(deg * RAD), BIKE_CRANK[1] + 20 * Math.sin(deg * RAD)];
  const nearPedal = pedal(phase);
  const farPedal = pedal(phase + 180);
  const legOf = (p: Point): { legs: Point[]; foot: [number, number, number, number] } => ({
    legs: [BIKE_HIP, elbow(BIKE_HIP, p, L_THIGH, L_SHANK, 'front'), p],
    foot: [p[0] - 4, p[1], p[0] + 10, p[1]],
  });
  const near = legOf(nearPedal);
  const far = legOf(farPedal);
  const lean = 22;
  const shoulder: Point = [BIKE_HIP[0] + L_TORSO * Math.sin(lean * RAD), BIKE_HIP[1] - L_TORSO * Math.cos(lean * RAD)];
  const handOf = (deg: number): Point => {
    const theta = (-7.9 + 7.9 * Math.sin(deg * RAD)) * RAD;
    return [BIKE_PIVOT[0] + 110 * Math.sin(theta), BIKE_PIVOT[1] - 110 * Math.cos(theta)];
  };
  const handNear = handOf(phase);
  const handFar = handOf(phase + 180);
  const spokeAngle = phase * 2 * RAD;
  const spoke = (a: number): DynShape => ({
    kind: 'line',
    x1: BIKE_FAN[0] - 26 * Math.cos(a),
    y1: BIKE_FAN[1] - 26 * Math.sin(a),
    x2: BIKE_FAN[0] + 26 * Math.cos(a),
    y2: BIKE_FAN[1] + 26 * Math.sin(a),
    role: 'spoke',
  });
  return {
    legs: near.legs,
    foot: near.foot,
    legs2: far.legs,
    foot2: far.foot,
    torso: [BIKE_HIP, shoulder],
    arm: [shoulder, elbow(handNear, shoulder, L_FORE, L_UPPER, 'down'), handNear].reverse(),
    arm2: [shoulder, elbow(handFar, shoulder, L_FORE, L_UPPER, 'down'), handFar].reverse(),
    head: [shoulder[0] + Math.sin(lean * RAD) * 22 + 2, shoulder[1] - Math.cos(lean * RAD) * 22],
    hand: handNear,
    dyn: [
      spoke(spokeAngle),
      spoke(spokeAngle + Math.PI / 2),
      { kind: 'line', x1: BIKE_PIVOT[0], y1: BIKE_PIVOT[1], x2: handNear[0], y2: handNear[1], role: 'lever' },
      { kind: 'line', x1: BIKE_PIVOT[0], y1: BIKE_PIVOT[1], x2: handFar[0], y2: handFar[1], role: 'lever' },
      { kind: 'line', x1: BIKE_CRANK[0], y1: BIKE_CRANK[1], x2: nearPedal[0], y2: nearPedal[1], role: 'crank' },
      { kind: 'line', x1: BIKE_CRANK[0], y1: BIKE_CRANK[1], x2: farPedal[0], y2: farPedal[1], role: 'crank' },
    ],
  };
}

// --- Chest-to-bar: como la dominada, pero el pecho sube hasta la barra: el cuerpo se echa atrás y las caderas van delante. ---
const C2B_MID = [136, 70, 22, 26, 8];
const C2B_TOP = [138, 50, 30, 34, 18];
const C2B_KF: Keyframes = [
  [0, HANG],
  [0.5, KIP_ARCH],
  [1.1, KIP_HOLLOW],
  [1.7, C2B_MID],
  [2.3, C2B_TOP],
  [2.6, C2B_TOP],
  [3.6, HANG],
  [3.8, HANG],
];

// --- Bar muscle-up: tirón explosivo, transición por encima de la barra y apoyo con los brazos estirados; baja igual. ---
const BMU_BAR: Point = [150, 98];
const BMU_HANG = [150, 155.5, 0, 0, 0];
const BMU_ARCH = [146, 155.5, -12, -18, -30];
const BMU_HOLLOW = [158, 155.5, 16, 32, 26];
const BMU_PULL = [138, 106, 26, 22, 8];
const BMU_TRANS = [140, 78, 40, 34, 18];
const BMU_SUPPORT = [150, 40.5, -6, -10, -24];
const BMU_KF: Keyframes = [
  [0, BMU_HANG],
  [0.5, BMU_ARCH],
  [1.0, BMU_HOLLOW],
  [1.45, BMU_PULL],
  [1.8, BMU_TRANS],
  [2.3, BMU_SUPPORT],
  [3.0, BMU_SUPPORT],
  [3.5, BMU_TRANS],
  [4.0, BMU_PULL],
  [4.8, BMU_HANG],
  [5.1, BMU_HANG],
];

// --- Power snatch: de la barra en el suelo a la cabeza en un solo tirón, recibida en un cuarto de sentadilla. ---
const PS_START = [32, 82, 42, 0, 0];
const PS_MID = [18, 60, 38, 0, 0];
const PS_EXTEND = [2, 6, -3, 80, 30];
const PS_CATCH = [22, 50, 8, 178, 180];
const PS_LOCK = [0, 0, 0, 180, 180];
const POWER_SNATCH_KF: Keyframes = [
  [0, PS_START],
  [0.5, PS_START],
  [1.1, PS_MID],
  [1.35, PS_EXTEND],
  [1.7, PS_CATCH],
  [2.2, PS_LOCK],
  [2.8, PS_LOCK],
  [3.5, [0, 0, 0, 0, 0]],
  [4.1, PS_START],
  [4.4, PS_START],
];

function powerSnatchPose(t: number): FigurePose {
  const pose = standingBody([130, 238], interpolate(POWER_SNATCH_KF, t));
  return { ...pose, dyn: [{ kind: 'circle', cx: pose.hand[0], cy: pose.hand[1], r: 26, role: 'plate' }] };
}

// --- Plancha (flexiones y burpee): pies y manos fijos, el cuerpo es una línea recta que gira sobre los pies. ---
const BODY_LENGTH = L_TORSO + L_THIGH + L_SHANK;

/** Cuerpo en plancha con la punta de los pies en `ankle`, las manos en `hand` y el hombro a la altura `shoulderY`. */
function plankPose(ankle: Point, hand: Point, shoulderY: number): FigurePose {
  const dy = ankle[1] - shoulderY;
  const shoulder: Point = [ankle[0] + Math.sqrt(Math.max(1, BODY_LENGTH * BODY_LENGTH - dy * dy)), shoulderY];
  const along = (len: number): Point => [ankle[0] + ((shoulder[0] - ankle[0]) * len) / BODY_LENGTH, ankle[1] + ((shoulder[1] - ankle[1]) * len) / BODY_LENGTH];
  const knee = along(L_SHANK);
  const hip = along(L_SHANK + L_THIGH);
  const el = elbow(hand, shoulder, L_FORE, L_UPPER, 'back');
  const angle = Math.atan2(dy, shoulder[0] - ankle[0]);
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + 22 * Math.cos(angle + 0.35), shoulder[1] - 22 * Math.sin(angle + 0.35)],
    foot: [ankle[0], ankle[1], ankle[0] + 7, 238],
    hand,
  };
}

// --- Flexión: sube y baja el pecho hasta casi tocar el suelo. ---
const PU_ANKLE: Point = [65, 234];
const PU_HAND: Point = [205, 238];
const PU_KF: Keyframes = [
  [0, [180.5]],
  [0.9, [224]],
  [1.0, [224]],
  [1.8, [180.5]],
];

// --- Handstand push-up: pino contra la pared, las manos fijas en el suelo y la cabeza baja hasta casi tocarlo. ---
const HS_HAND: Point = [150, 238];
const HS_WALL = 182;
const HS_KF: Keyframes = [
  [0, [152, 180.5]],
  [1.0, [158, 200]],
  [1.2, [158, 200]],
  [2.2, [152, 180.5]],
  [2.4, [152, 180.5]],
];

function handstandPose(t: number): FigurePose {
  const p = interpolate(HS_KF, t);
  const shoulder: Point = [p[0], p[1]];
  const a = Math.asin(Math.max(-0.5, Math.min(0.5, (HS_WALL - shoulder[0]) / BODY_LENGTH)));
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

// --- Bar-facing burpee: burpee de cara a la barra y salto por encima de ella (y vuelta, para poder repetir). Las transiciones entre
// posturas con anclajes distintos (de pie, plancha, en el aire) interpolan punto a punto. ---
const BURPEE_BAR: Point = [222, 216];

const lerpPoint = (a: Point, b: Point, k: number): Point => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const lerpPoints = (a: Point[], b: Point[], k: number): Point[] => a.map((p, i) => lerpPoint(p, b[i], k));

/** Mezcla dos posturas con la misma estructura (mismas listas de puntos). */
function mixPoses(a: FigurePose, b: FigurePose, k: number): FigurePose {
  return {
    legs: lerpPoints(a.legs, b.legs, k),
    torso: lerpPoints(a.torso, b.torso, k),
    arm: lerpPoints(a.arm, b.arm, k),
    head: lerpPoint(a.head, b.head, k),
    foot: [0, 1, 2, 3].map((i) => a.foot[i] + (b.foot[i] - a.foot[i]) * k) as [number, number, number, number],
    hand: lerpPoint(a.hand, b.hand, k),
  };
}

const BURPEE_STAND = standingBody([170, 238], [0, 0, 0, 0, 0]);
const BURPEE_SQUAT = standingBody([170, 238], [45, 100, 51, 0, 0]);
const BURPEE_HANDS = BURPEE_SQUAT.hand;
const BURPEE_PLANK_UP = plankPose([BURPEE_HANDS[0] - 140, 234], [BURPEE_HANDS[0], 238], 180.5);
const BURPEE_PLANK_DOWN = plankPose([BURPEE_HANDS[0] - 140, 234], [BURPEE_HANDS[0], 238], 224);
const BURPEE_CROUCH = standingBody([170, 238], [20, 40, 20, 0, 0]);
const BURPEE_AIR = standingBody([222, 182], [35, 75, 2, 25, 20]);
const BURPEE_LAND = standingBody([272, 238], [20, 40, 20, 0, 0]);
const BURPEE_STAND_FAR = standingBody([272, 238], [0, 0, 0, 0, 0]);
const BURPEE_KF: [number, FigurePose][] = [
  [0, BURPEE_STAND],
  [0.45, BURPEE_SQUAT],
  [0.75, BURPEE_PLANK_UP],
  [1.15, BURPEE_PLANK_DOWN],
  [1.55, BURPEE_PLANK_UP],
  [1.85, BURPEE_SQUAT],
  [2.2, BURPEE_STAND],
  [2.45, BURPEE_CROUCH],
  [2.75, BURPEE_AIR],
  [3.05, BURPEE_LAND],
  [3.3, BURPEE_STAND_FAR],
  [3.6, standingBody([272, 238], [20, 40, 20, 0, 0])],
  [3.9, BURPEE_AIR],
  [4.2, BURPEE_CROUCH],
  [4.45, BURPEE_STAND],
];
const BURPEE_DURATION = 4.45;

function burpeePose(t: number): FigurePose {
  if (t <= 0) return BURPEE_KF[0][1];
  for (let i = 0; i < BURPEE_KF.length - 1; i++) {
    const [t0, a] = BURPEE_KF[i];
    const [t1, b] = BURPEE_KF[i + 1];
    if (t >= t0 && t <= t1) return mixPoses(a, b, ease((t - t0) / (t1 - t0)));
  }
  return BURPEE_KF[BURPEE_KF.length - 1][1];
}

const line = (x1: number, y1: number, x2: number, y2: number, role: 'floor' | 'frame' | 'thin'): PropShape => ({ kind: 'line', x1, y1, x2, y2, role });

export const ANIMATIONS: Record<string, MovementAnimation> = {
  'push-up': {
    box: [55, 150, 200, 95],
    duration: 1.8,
    props: [line(55, 240, 250, 240, 'floor')],
    pose: (t) => plankPose(PU_ANKLE, PU_HAND, interpolate(PU_KF, t)[0]),
  },
  'chest-to-bar-pull-up': {
    box: [60, 0, 200, 250],
    duration: 3.8,
    props: [line(62, BAR_Y, 250, BAR_Y, 'frame')],
    pose: (t) => bodyFromHands([BAR_X, BAR_Y], interpolate(C2B_KF, t), 'down'),
  },
  'bar-muscle-up': {
    box: [60, 0, 200, 312],
    duration: 5.1,
    props: [line(62, BMU_BAR[1], 250, BMU_BAR[1], 'frame')],
    pose: (t) => bodyFromHands(BMU_BAR, interpolate(BMU_KF, t), 'back'),
  },
  'power-snatch': {
    box: [85, 0, 125, 250],
    duration: 4.4,
    props: [line(90, 238, 205, 238, 'floor')],
    pose: powerSnatchPose,
  },
  'handstand-push-up': {
    box: [100, 10, 100, 235],
    duration: 2.4,
    props: [line(100, 240, 200, 240, 'floor'), line(HS_WALL, 10, HS_WALL, 240, 'frame')],
    pose: handstandPose,
  },
  'bar-facing-burpee': {
    box: [45, 20, 265, 225],
    duration: BURPEE_DURATION,
    props: [line(45, 240, 310, 240, 'floor'), { kind: 'circle', cx: BURPEE_BAR[0], cy: BURPEE_BAR[1], r: 22, role: 'frame' }],
    pose: burpeePose,
  },
  thruster: {
    box: [85, 5, 125, 245],
    duration: 3.6,
    props: [line(90, 238, 205, 238, 'floor')],
    pose: thrusterPose,
  },
  'toes-to-bar': {
    box: [80, 0, 215, 250],
    duration: 3,
    props: [line(85, BAR_Y, 290, BAR_Y, 'frame')],
    pose: (t) => bodyFromHands([BAR_X, BAR_Y], interpolate(TTB_KF, t), 'down'),
  },
  'double-under': {
    box: [60, 36, 205, 214],
    duration: 0.7,
    props: [line(65, 238, 260, 238, 'floor')],
    pose: doubleUnderPose,
  },
  run: {
    box: [40, 40, 180, 205],
    duration: RUN_DURATION,
    props: [line(40, 238, 220, 238, 'floor')],
    pose: runPose,
  },
  'air-bike': {
    box: [85, 45, 175, 200],
    duration: BIKE_DURATION,
    props: [
      line(80, 238, 260, 238, 'floor'),
      line(104, 143, 132, 143, 'frame'),
      line(118, 143, 150, 190, 'frame'),
      line(150, 190, 150, 238, 'frame'),
      line(160, 192, BIKE_FAN[0], BIKE_FAN[1], 'frame'),
      { kind: 'circle', cx: BIKE_FAN[0], cy: BIKE_FAN[1], r: 34, role: 'frame' },
    ],
    pose: airBikePose,
  },
  'wall-ball': {
    box: [60, 20, 210, 225],
    duration: 3,
    props: [line(65, 238, 265, 238, 'floor'), line(262, 20, 262, 238, 'frame'), line(246, WB_TARGET[1], 262, WB_TARGET[1], 'thin')],
    pose: wallBallPose,
  },
  deadlift: {
    box: [80, 45, 110, 200],
    duration: 4.2,
    props: [line(85, 238, 185, 238, 'floor')],
    pose: deadliftPose,
  },
  row: {
    box: [30, 62, 250, 158],
    duration: 3.4,
    props: [
      line(40, 212, 270, 212, 'floor'),
      line(60, 153, 236, 153, 'frame'),
      line(80, 153, 80, 212, 'frame'),
      line(225, 153, 225, 212, 'frame'),
      { kind: 'circle', cx: ROW_FLYWHEEL[0], cy: ROW_FLYWHEEL[1], r: 28, role: 'frame' },
      line(191, 184, 219, 170, 'frame'),
    ],
    pose: rowPose,
  },
  'kipping-pull-up': {
    box: [60, 0, 200, 250],
    duration: 3.8,
    props: [line(62, BAR_Y, 250, BAR_Y, 'frame')],
    pose: (t) => bodyFromHands([BAR_X, BAR_Y], interpolate(KIPPING_KF, t), 'down'),
  },
  'ring-dip': {
    box: [60, 0, 200, 270],
    duration: 3.2,
    props: [line(90, 10, 210, 10, 'frame'), line(150, 10, 150, RING_HAND[1] - 11, 'thin'), { kind: 'circle', cx: RING_HAND[0], cy: RING_HAND[1], r: 11, role: 'ring' }],
    pose: (t) => bodyFromHands(RING_HAND, interpolate(DIP_KF, t), 'back'),
  },
};

/** La animación de un movimiento del catálogo, o null si aún no la tiene. */
export function animationFor(movementId: string): MovementAnimation | null {
  return ANIMATIONS[movementId] ?? null;
}

/** Los movimientos que ya tienen animación. */
export function animatedMovementIds(): string[] {
  return Object.keys(ANIMATIONS);
}
