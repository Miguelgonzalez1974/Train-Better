/**
 * Animaciones de movimientos: un muñeco de palitos de perfil que repite el gesto en bucle, como apoyo rápido de visión junto al movimiento
 * del WOD (no enseña técnica). Todo se calcula aquí, puro: cada movimiento es una lista de posturas (ángulos o posiciones de las
 * articulaciones) con su tiempo, y `poseAt` da el esqueleto en cualquier instante del bucle. El dibujo (SVG) vive en
 * `features/planificacion/MovementFigure.tsx`.
 *
 * Cada animación sigue UN anclaje, que es lo que fija el resto del cuerpo: sentado en el remo (pies fijos), colgado de la barra (manos
 * arriba fijas) o apoyado en las anillas (manos fijas). Añadir un movimiento es añadir sus posturas a `ANIMATIONS`.
 */

export type Point = [number, number];

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
  /** Piezas que se mueven con el cuerpo (el asiento y el cable del remo). */
  seat?: [number, number, number, number];
  cable?: [number, number, number, number];
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
export function elbow(from: Point, to: Point, l1: number, l2: number, pick: 'down' | 'back'): Point {
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

const line = (x1: number, y1: number, x2: number, y2: number, role: 'floor' | 'frame' | 'thin'): PropShape => ({ kind: 'line', x1, y1, x2, y2, role });

export const ANIMATIONS: Record<string, MovementAnimation> = {
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
    props: [line(50, BAR_Y, 250, BAR_Y, 'frame')],
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
