import { L_FORE, L_SHANK, L_THIGH, L_UPPER, elbow, interpolate, standingBody, type FigurePose, type Point } from './movementAnimation';
import { FLOOR, dir, line, makeAnim, plus } from './movementAnimationMore';

/**
 * Las animaciones de la vuelta a la calma: posturas que se mantienen, así que se mueven poco (se entra en la postura, se aguanta respirando y se
 * vuelve) y el rodillo va y viene. Mismas piezas que el resto. Casi todas se ven de perfil; la mariposa y el estiramiento de hombro van de
 * frente, porque de lado no se entendían.
 */

/** Cuánto se ha entrado en la postura (0 = a medias, 1 = del todo) en una vuelta de `d` segundos: entra, aguanta y vuelve. */
const hold = (t: number, d: number) =>
  interpolate(
    [
      [0, [0]],
      [d * 0.32, [1]],
      [d * 0.68, [1]],
      [d * 0.94, [0]],
      [d, [0]],
    ],
    t,
  )[0];
/** Ida y vuelta continua entre −1 y 1 (rodar sobre el rodillo, mecerse). */
const swing = (t: number, d: number) => Math.sin((t / d) * Math.PI * 2);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const between = (a: Point, b: Point, k: number): Point => [mix(a[0], b[0], k), mix(a[1], b[1], k)];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** La mano, como mucho a un brazo de distancia del hombro. */
const reach = (shoulder: Point, hand: Point, max = L_UPPER + L_FORE - 0.5): Point => (dist(shoulder, hand) <= max ? hand : between(shoulder, hand, max / dist(shoulder, hand)));

/** La espalda redondeada (o hundida): una curva de la cadera al hombro. `lift` es cuánto se separa de la línea recta en el centro, hacia arriba. */
const back = (hip: Point, shoulder: Point, lift: number): Point[] =>
  Array.from({ length: 9 }, (_, i) => {
    const u = i / 8;
    const p = between(hip, shoulder, u);
    return [p[0], p[1] - lift * 4 * u * (1 - u)];
  });

const STRETCH = 4.4;
const ROLL = 3.2;

// ---------- De pie ----------

/** Pecho con banda: la banda anclada detrás y el cuerpo adelante, abriendo el pecho. */
function bandPecPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const p = standingBody([132, FLOOR], [mix(2, 12, k), mix(4, 16, k), mix(1, 10, k), mix(-72, -94, k), mix(-78, -94, k)]);
  return { ...p, dyn: [{ kind: 'line', x1: 50, y1: 92, x2: p.hand[0], y2: p.hand[1], role: 'crank' }] };
}

/** Estiramiento de hombro, de frente: un brazo cruza el pecho y el otro antebrazo lo acerca. */
function crossBodyPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hip: Point = [150, 140];
  const shoulder: Point = [150, 88];
  const hand: Point = [mix(97, 100, k), mix(102, 94, k)];
  const elbowAcross = between(shoulder, hand, 0.52);
  const pullElbow: Point = [mix(139, 141, k), mix(117, 114, k)];
  const pullHand: Point = [mix(120, 124, k), mix(95, 87, k)];
  return {
    legs: [[132, FLOOR], [136, 189], hip, [164, 189], [168, FLOOR], [178, FLOOR]],
    torso: [hip, shoulder],
    // El segundo brazo va en el mismo trazo (de vuelta por el hombro): de frente los dos son igual de visibles.
    arm: [shoulder, elbowAcross, hand, shoulder, pullElbow, pullHand],
    head: [150, 66],
    foot: [122, FLOOR, 132, FLOOR],
    hand,
  };
}

/** Manos entrelazadas detrás: los brazos suben con el pecho abierto. */
function claspedPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  return standingBody([140, FLOOR], [0, mix(0, 3, k), mix(0, 9, k), mix(-20, -68, k), mix(-28, -74, k)]);
}

// ---------- Perros ----------

/** Perro boca arriba: de casi tumbado a brazos estirados, con la cadera separada del suelo. */
function upDogPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hand: Point = [200, 236];
  const ankle: Point = [60, 234];
  // Piernas estiradas: la cadera sale del tobillo y el hombro, de la cadera.
  const hipY = mix(229, 220, k);
  const hip: Point = [ankle[0] + Math.sqrt((L_THIGH + L_SHANK - 0.2) ** 2 - (ankle[1] - hipY) ** 2), hipY];
  const shoulderY = mix(207, 180.5, k);
  const shoulder: Point = [hip[0] + Math.sqrt(52 * 52 - (hipY - shoulderY) ** 2), shoulderY];
  return {
    legs: [ankle, between(ankle, hip, L_SHANK / (L_THIGH + L_SHANK)), hip],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(shoulder, hand, L_UPPER, L_FORE, 'back'), hand],
    head: [shoulder[0] + mix(20, 9, k), shoulder[1] - mix(8, 20, k)],
    foot: [ankle[0], ankle[1], ankle[0] - 14, 237],
    hand,
  };
}

/** Perro boca abajo: la V invertida; los talones bajan hacia el suelo. */
function downDogPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hand: Point = [214, 236];
  const ankle: Point = [84, mix(224, 234, k)];
  const arm = L_UPPER + L_FORE;
  const upper = arm + 52;
  const legs = L_THIGH + L_SHANK - 0.2;
  const d = dist(hand, ankle);
  const a = (upper * upper - legs * legs + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  const u: Point = [(ankle[0] - hand[0]) / d, (ankle[1] - hand[1]) / d];
  const hip: Point = [hand[0] + u[0] * a - u[1] * h, hand[1] + u[1] * a + u[0] * h];
  const shoulder = between(hand, hip, arm / upper);
  return {
    legs: [ankle, between(ankle, hip, L_SHANK / (L_THIGH + L_SHANK)), hip],
    torso: [hip, shoulder],
    arm: [hand, between(hand, shoulder, L_FORE / arm), shoulder],
    head: [shoulder[0] + 4, shoulder[1] + 20],
    foot: [ankle[0], ankle[1], ankle[0] + 14, 237],
    hand,
  };
}

// ---------- Rodillo ----------

const roller = (x: number) => [{ kind: 'circle' as const, cx: x, cy: 227, r: 10, role: 'plate' as const }];

/** Sentado con las manos detrás y las piernas largas sobre el rodillo: el cuerpo va y viene por encima. */
function seatedRoll(rollerX: number) {
  return (t: number): FigurePose => {
    const s = 14 * swing(t, ROLL);
    const hand: Point = [88, 236];
    const shoulder: Point = [88 + s, 181];
    const hip: Point = [shoulder[0] + 36, shoulder[1] + 37.5];
    const ankle: Point = [hip[0] + 96, hip[1] - 5];
    return {
      legs: [ankle, between(ankle, hip, 0.49), hip],
      torso: [hip, shoulder],
      arm: [shoulder, between(shoulder, hand, 0.52), hand],
      head: [shoulder[0] + 2, shoulder[1] - 22],
      foot: [ankle[0], ankle[1], ankle[0] + 5, ankle[1] - 14],
      hand,
      dyn: roller(rollerX),
    };
  };
}

/** Boca abajo sobre los antebrazos, el rodillo bajo el muslo. */
function quadRollPose(t: number): FigurePose {
  const s = 11 * swing(t, ROLL);
  const el: Point = [192, 235];
  const hand: Point = [216, 235];
  const shoulder: Point = [190 + s, 208];
  const hip: Point = [shoulder[0] - 51, shoulder[1] + 10.1];
  const ankle: Point = [hip[0] - 96, hip[1] - 1];
  return {
    legs: [ankle, between(ankle, hip, 0.49), hip],
    torso: [hip, shoulder],
    arm: [shoulder, el, hand],
    head: [shoulder[0] + 21, shoulder[1] - 6],
    foot: [ankle[0], ankle[1], ankle[0] - 10, ankle[1] + 6],
    hand,
    dyn: roller(110),
  };
}

// ---------- En el suelo ----------

/** Postura del niño: sentado sobre los talones, pecho abajo y brazos largos. */
function childPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const knee: Point = [150, 234];
  const ankle: Point = [102.1, 233];
  // La cadera baja hacia los talones y el pecho hacia el suelo; la espalda queda redonda.
  const hip = plus(knee, dir(mix(147, 159, k)), L_THIGH);
  const shoulder = plus(hip, dir(mix(-8, -14, k)), 52);
  const hand = reach(shoulder, [mix(204, 212, k), 236]);
  return {
    legs: [ankle, knee, hip],
    torso: back(hip, shoulder, 20),
    arm: [shoulder, between(shoulder, hand, 0.52), hand],
    head: [shoulder[0] + 19, Math.min(228, shoulder[1] + 8)],
    foot: [ankle[0], ankle[1], ankle[0] - 12, 237],
    hand,
  };
}

/** Gato-vaca: en cuadrupedia, la espalda se redondea y se hunde. */
function catCowPose(t: number): FigurePose {
  const c = swing(t, STRETCH);
  const hip: Point = [128, 186];
  const shoulder: Point = [180, 186];
  const hand: Point = [182, 236];
  return {
    legs: [[80.1, 234], [128, 236], hip],
    torso: back(hip, shoulder, 17 * c),
    arm: [shoulder, [182, 211], hand],
    head: [shoulder[0] + 19, shoulder[1] + 15 * c - 4],
    foot: [80.1, 234, 68, 237],
    hand,
  };
}

/** Piernas en la pared: tumbado, las piernas verticales, respirando. */
function legsUpPose(t: number): FigurePose {
  const b = swing(t, STRETCH);
  const hip: Point = [182, 228];
  const shoulder: Point = [130.04, 230];
  const knee = plus(hip, dir(86), L_THIGH);
  const ankle = plus(knee, dir(88), L_SHANK);
  const hand: Point = [183 + 2 * b, 236];
  return {
    legs: [ankle, knee, hip],
    torso: [hip, shoulder],
    arm: [shoulder, between(shoulder, hand, 0.52), hand],
    head: [shoulder[0] - 21, shoulder[1] - 4],
    foot: [ankle[0], ankle[1], ankle[0] - 13, ankle[1] - 3 - 4 * b],
    hand,
  };
}

/** Mariposa, de frente: sentado con las plantas juntas; las rodillas bajan y el tronco se inclina. */
function butterflyPose(t: number): FigurePose {
  const k = hold(t, STRETCH);
  const hip: Point = [150, 224];
  // De frente, inclinarse hacia delante se ve como un tronco que se acorta.
  const shoulder: Point = [150, mix(175, 183, k)];
  const kneeY = mix(204, 219, k);
  const left: Point = [106, kneeY];
  const right: Point = [194, kneeY];
  const leftFoot: Point = [147, 235];
  const rightFoot: Point = [153, 235];
  const hand: Point = [150, 230];
  // De frente no hay «lado de atrás»: las dos piernas y los dos brazos van en el mismo trazo, del mismo color.
  return {
    legs: [leftFoot, left, hip, right, rightFoot],
    torso: [hip, shoulder],
    arm: [shoulder, elbow(shoulder, hand, L_UPPER, L_FORE, 'back'), hand, elbow(shoulder, hand, L_UPPER, L_FORE, 'front'), shoulder],
    head: [shoulder[0], shoulder[1] - mix(22, 16, k)],
    foot: [leftFoot[0] - 6, 235, rightFoot[0] + 6, 235],
    hand,
  };
}

export const COOLDOWN_ANIMATIONS = {
  'band-pec-stretch': makeAnim(bandPecPose, STRETCH, [line(50, 58, 50, FLOOR)]),
  'shoulder-stretch': makeAnim(crossBodyPose, STRETCH),
  'upward-facing-dog': makeAnim(upDogPose, STRETCH),
  'foam-roll-calves': makeAnim(seatedRoll(188), ROLL),
  'shoulder-extension-hands-clasped': makeAnim(claspedPose, STRETCH),
  'foam-roll-hamstrings': makeAnim(seatedRoll(154), ROLL),
  'downward-facing-dog': makeAnim(downDogPose, STRETCH),
  'foam-roll-quads': makeAnim(quadRollPose, ROLL),
  'childs-pose': makeAnim(childPose, STRETCH),
  'cat-cow-stretch': makeAnim(catCowPose, STRETCH),
  'legs-up-the-wall': makeAnim(legsUpPose, STRETCH, [line(192, 96, 192, FLOOR)]),
  'butterfly-stretch': makeAnim(butterflyPose, STRETCH),
};
