import { describe, expect, it } from 'vitest';
import { elbow, interpolate, type Point } from './movementAnimation';
import { ANIMATIONS, ANIMATION_ALIASES, animatedMovementIds, animationFor } from './movementAnimations';

/** Las que interpolan punto a punto entre posturas con anclajes distintos: el tronco se acorta un poco en las transiciones. */
const MIXED = ['bar-facing-burpee', 'burpee', 'burpee-to-target', 'burpee-pull-up', 'devils-press', 'burpee-box-jump-over', 'box-jump', 'box-jump-over'];
/** De frente, inclinarse hacia delante se ve como un tronco más corto. */
const FORESHORTENED = ['butterfly-stretch', 'straddle-stretch'];
import { getMovementById } from '../data/movements';

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const samples = (duration: number, n = 40) => Array.from({ length: n + 1 }, (_, i) => (duration * i) / n);

describe('animaciones de movimientos', () => {
  it('solo hay animación para movimientos que existen en el catálogo', () => {
    for (const id of animatedMovementIds()) expect(getMovementById(id), id).toBeDefined();
    for (const id of ['row', 'kipping-pull-up', 'ring-dip', 'thruster', 'toes-to-bar', 'double-under', 'run', 'air-bike', 'wall-ball', 'deadlift', 'push-up', 'chest-to-bar-pull-up', 'bar-muscle-up', 'bar-facing-burpee', 'power-snatch', 'handstand-push-up'])
      expect(animationFor(id), id).not.toBeNull();
    expect(animationFor('movimiento-sin-dibujo')).toBeNull();
  });

  it('las piezas móviles son siempre las mismas y en el mismo orden, y el otro lado del cuerpo está o no está en todo el bucle', () => {
    for (const [id, a] of Object.entries(ANIMATIONS)) {
      const first = a.pose(0);
      for (const t of samples(a.duration, 20)) {
        const p = a.pose(t);
        expect(p.dyn?.length ?? 0, id).toBe(first.dyn?.length ?? 0);
        (p.dyn ?? []).forEach((d, i) => {
          expect(d.kind, `${id} dyn ${i}`).toBe(first.dyn![i].kind);
          expect(d.role, `${id} dyn ${i}`).toBe(first.dyn![i].role);
          if (d.kind === 'polyline') expect(d.points.length).toBe((first.dyn![i] as typeof d).points.length);
        });
        expect(Boolean(p.legs2), id).toBe(Boolean(first.legs2));
        expect(Boolean(p.arm2), id).toBe(Boolean(first.arm2));
        expect(Boolean(p.foot2), id).toBe(Boolean(first.foot2));
      }
    }
  });

  it('el bucle empalma: la última postura es la primera', () => {
    for (const [id, a] of Object.entries(ANIMATIONS)) {
      const first = a.pose(0);
      const last = a.pose(a.duration);
      expect(last.head[0], id).toBeCloseTo(first.head[0], 3);
      expect(last.head[1], id).toBeCloseTo(first.head[1], 3);
      expect(last.hand[0], id).toBeCloseTo(first.hand[0], 3);
      expect(last.hand[1], id).toBeCloseTo(first.hand[1], 3);
    }
  });

  it('en todo el bucle los puntos son números y caben en el cuadro visible', () => {
    for (const [id, a] of Object.entries(ANIMATIONS)) {
      const [bx, by, bw, bh] = a.box;
      for (const t of samples(a.duration)) {
        const p = a.pose(t);
        const all: Point[] = [...p.legs, ...p.torso, ...p.arm, ...(p.legs2 ?? []), ...(p.arm2 ?? []), p.head, p.hand];
        for (const d of p.dyn ?? []) {
          if (d.kind === 'circle') all.push([d.cx - d.r, d.cy - d.r], [d.cx + d.r, d.cy + d.r]);
          else if (d.kind === 'line') {
            if (d.role !== 'tick') all.push([d.x1, d.y1], [d.x2, d.y2]);
          }
          else all.push(...d.points);
        }
        for (const [x, y] of all) {
          expect(Number.isFinite(x) && Number.isFinite(y), `${id} t=${t}`).toBe(true);
          expect(x, `${id} t=${t} x`).toBeGreaterThanOrEqual(bx - 2);
          expect(x, `${id} t=${t} x`).toBeLessThanOrEqual(bx + bw + 2);
          expect(y, `${id} t=${t} y`).toBeGreaterThanOrEqual(by - 12);
          expect(y, `${id} t=${t} y`).toBeLessThanOrEqual(by + bh + 2);
        }
      }
    }
  });

  it('colgado o apoyado, la mano no se mueve; sentado en el remo, el pie tampoco', () => {
    for (const id of ['kipping-pull-up', 'ring-dip', 'toes-to-bar', 'chest-to-bar-pull-up', 'bar-muscle-up', 'push-up', 'handstand-push-up']) {
      const a = ANIMATIONS[id];
      const h0 = a.pose(0).hand;
      for (const t of samples(a.duration)) expect(dist(a.pose(t).hand, h0), `${id} t=${t}`).toBeLessThan(0.001);
    }
    const row = ANIMATIONS.row;
    const ankle0 = row.pose(0).legs[0];
    for (const t of samples(row.duration)) expect(dist(row.pose(t).legs[0], ankle0)).toBeLessThan(0.001);
  });

  it('los huesos conservan su largo (el muñeco no se estira al moverse)', () => {
    for (const [id, a] of Object.entries(ANIMATIONS)) {
      for (const t of samples(a.duration)) {
        const p = a.pose(t);
        // Tronco, muslo y pierna: largos fijos. El tronco se mide de la cadera al hombro (una espalda redondeada lleva puntos en medio).
        // El burpee interpola punto a punto entre posturas con anclajes distintos: en el salto el tronco se acorta un poco, nunca se alarga.
        const torso = dist(p.torso[0], p.torso[p.torso.length - 1]);
        if (MIXED.includes(id) || FORESHORTENED.includes(id)) expect(torso, `${id} torso t=${t}`).toBeGreaterThan(40);
        else expect(torso, `${id} torso t=${t}`).toBeCloseTo(52, 1);
        expect(torso).toBeLessThanOrEqual(52.05);
        expect(dist(p.legs[0], p.legs[1]), `${id} t=${t}`).toBeGreaterThan(40);
        // El brazo: dos tramos que suman como mucho su largo completo.
        expect(dist(p.arm[0], p.arm[1]) + dist(p.arm[1], p.arm[2])).toBeLessThanOrEqual(58.6);
      }
    }
  });

  it('en la dominada, en lo alto la cabeza queda a la altura de la barra o por encima, y colgado, por debajo', () => {
    const a = ANIMATIONS['kipping-pull-up'];
    expect(a.pose(2.4).head[1]).toBeLessThan(34);
    expect(a.pose(0).head[1]).toBeGreaterThan(60);
  });

  it('en el fondo de las anillas el cuerpo está más abajo que en el apoyo', () => {
    const a = ANIMATIONS['ring-dip'];
    expect(a.pose(1.4).head[1]).toBeGreaterThan(a.pose(0).head[1] + 40);
  });

  it('en el remo, al final de la palada el torso va hacia atrás y el cable sale de la mano al volante', () => {
    const a = ANIMATIONS.row;
    const catchPose = a.pose(0);
    const finish = a.pose(1.5);
    expect(finish.torso[1][0]).toBeLessThan(finish.torso[0][0]);
    expect(catchPose.torso[1][0]).toBeGreaterThan(catchPose.torso[0][0]);
    expect(finish.cable).toEqual([finish.hand[0], finish.hand[1], 243, 148]);
  });
});

describe('los movimientos de la tanda 1', () => {
  it('thruster y peso muerto: el disco va siempre en la mano; en el thruster acaba por encima de la cabeza', () => {
    for (const id of ['thruster', 'deadlift']) {
      const a = ANIMATIONS[id];
      for (const t of samples(a.duration, 30)) {
        const p = a.pose(t);
        const plate = p.dyn![0];
        expect(plate.kind).toBe('circle');
        if (plate.kind === 'circle') {
          expect(plate.cx).toBeCloseTo(p.hand[0], 3);
          expect(plate.cy).toBeCloseTo(p.hand[1], 3);
        }
      }
    }
    const th = ANIMATIONS.thruster.pose(2.2);
    expect(th.hand[1]).toBeLessThan(th.head[1] - 20);
  });

  it('peso muerto: la barra empieza cerca del suelo y acaba a la altura de los muslos', () => {
    const a = ANIMATIONS.deadlift;
    expect(a.pose(0).hand[1]).toBeGreaterThan(200);
    expect(a.pose(2.1).hand[1]).toBeLessThan(160);
  });

  it('toes-to-bar: en lo alto los pies tocan la barra, y colgado quedan lejos de ella', () => {
    const a = ANIMATIONS['toes-to-bar'];
    const top = a.pose(1.75);
    expect(Math.abs(top.legs[2][1] - 34)).toBeLessThan(4);
    expect(a.pose(0).legs[2][1]).toBeGreaterThan(200);
  });

  it('wall ball: el balón sale de las manos, llega a la marca de la pared y vuelve a las manos', () => {
    const a = ANIMATIONS['wall-ball'];
    const ball = (t: number) => {
      const d = a.pose(t).dyn![0];
      return d.kind === 'circle' ? ([d.cx, d.cy] as Point) : ([0, 0] as Point);
    };
    expect(dist(ball(0), a.pose(0).hand)).toBeLessThan(15);
    const peak = ball(1.75);
    expect(peak[0]).toBeGreaterThan(220);
    expect(peak[1]).toBeLessThan(80);
    expect(dist(ball(2.5), a.pose(2.5).hand)).toBeLessThan(15);
  });

  it('double under: la comba da dos vueltas por salto y el cuerpo sube del suelo', () => {
    const a = ANIMATIONS['double-under'];
    const rope = (t: number) => {
      const d = a.pose(t).dyn![0];
      return d.kind === 'polyline' ? d.points[0] : ([0, 0] as Point);
    };
    expect(dist(rope(0), rope(a.duration))).toBeLessThan(0.01);
    expect(dist(rope(0), rope(0.175))).toBeGreaterThan(20);
    expect(a.pose(0.35).head[1]).toBeLessThan(a.pose(0).head[1] - 8);
  });

  it('correr: las dos piernas van a contrafase y los brazos también', () => {
    const a = ANIMATIONS.run;
    for (const t of [0.1, 0.25, 0.5, 0.65]) {
      const p = a.pose(t);
      expect(p.legs2).toBeDefined();
      expect(dist(p.legs[2], p.legs2![2])).toBeGreaterThan(3);
    }
    const p0 = a.pose(0.2);
    const p1 = a.pose(0.6);
    expect(p0.legs[1][0] - p0.legs[0][0]).toBeGreaterThan(0);
    expect(p1.legs[1][0] - p1.legs[0][0]).toBeLessThan(0);
  });

  it('air bike: los pedales van opuestos y la rodilla queda delante de la cadera', () => {
    const a = ANIMATIONS['air-bike'];
    for (const t of samples(a.duration, 12)) {
      const p = a.pose(t);
      expect(p.legs[1][0]).toBeGreaterThan(p.legs[0][0]);
      const crank: Point = [160, 192];
      const n = p.legs[2];
      const f = p.legs2![2];
      expect(n[0] + f[0]).toBeCloseTo(2 * crank[0], 1);
      expect(n[1] + f[1]).toBeCloseTo(2 * crank[1], 1);
    }
  });
});

describe('los movimientos de la tanda 2', () => {
  it('flexión: los pies no se mueven y el cuerpo es una línea recta de largo constante que baja y sube', () => {
    const a = ANIMATIONS['push-up'];
    const ankle0 = a.pose(0).legs[0];
    for (const t of samples(a.duration, 30)) {
      const p = a.pose(t);
      expect(dist(p.legs[0], ankle0)).toBeLessThan(0.001);
      expect(dist(p.legs[0], p.torso[1])).toBeCloseTo(150, 1);
    }
    expect(a.pose(0.95).torso[1][1]).toBeGreaterThan(a.pose(0).torso[1][1] + 35);
  });

  it('handstand push-up: los pies quedan en la pared, la cabeza casi toca el suelo abajo y está lejos arriba', () => {
    const a = ANIMATIONS['handstand-push-up'];
    for (const t of samples(a.duration, 30)) expect(Math.abs(a.pose(t).legs[2][0] - 182), `t=${t}`).toBeLessThan(1);
    expect(a.pose(1.1).head[1]).toBeGreaterThan(215);
    expect(a.pose(0).head[1]).toBeLessThan(a.pose(1.1).head[1] - 15);
  });

  it('chest-to-bar: arriba el pecho llega más cerca de la barra que en la dominada con la barbilla', () => {
    const c2b = ANIMATIONS['chest-to-bar-pull-up'].pose(2.4);
    const kip = ANIMATIONS['kipping-pull-up'].pose(2.4);
    expect(c2b.torso[0][1]).toBeGreaterThan(kip.torso[0][1] - 1);
    expect(c2b.torso[0][1]).toBeLessThan(60);
    expect(c2b.legs[0][0]).toBeGreaterThan(c2b.torso[0][0] + 20);
  });

  it('bar muscle-up: colgado el hombro está bajo la barra y en el apoyo por encima de ella', () => {
    const a = ANIMATIONS['bar-muscle-up'];
    expect(a.pose(0).torso[0][1]).toBeGreaterThan(98 + 40);
    expect(a.pose(2.6).torso[0][1]).toBeLessThan(98 - 40);
    expect(a.pose(2.6).head[1]).toBeLessThan(98 - 50);
  });

  it('power snatch: acaba con la barra sobre la cabeza y empieza cerca del suelo', () => {
    const a = ANIMATIONS['power-snatch'];
    const top = a.pose(2.5);
    expect(top.hand[1]).toBeLessThan(top.head[1] - 20);
    expect(a.pose(0).hand[1]).toBeGreaterThan(200);
  });

  it('bar-facing burpee: de pie, plancha con el pecho abajo, y salto por encima de la barra', () => {
    const a = ANIMATIONS['bar-facing-burpee'];
    const stand = a.pose(0);
    expect(stand.head[1]).toBeLessThan(80);
    const plank = a.pose(1.15);
    expect(Math.abs(plank.torso[1][1] - plank.legs[0][1])).toBeLessThan(15);
    expect(plank.head[1]).toBeGreaterThan(205);
    const air = a.pose(2.75);
    expect(air.legs[0][1]).toBeLessThan(200);
    expect(Math.abs(air.legs[0][0] - 222)).toBeLessThan(2);
    expect(a.pose(3.3).legs[0][0]).toBeCloseTo(272, 0);
    expect(a.pose(a.duration).legs[0][0]).toBeCloseTo(170, 0);
  });
});

describe('la vuelta a la calma', () => {
  it('los estiramientos que más se programan tienen muñeco; el de pecho tumbado, todavía no', () => {
    for (const id of ['band-pec-stretch', 'shoulder-stretch', 'upward-facing-dog', 'butterfly-stretch', 'foam-roll-calves', 'shoulder-extension-hands-clasped', 'foam-roll-hamstrings', 'downward-facing-dog', 'foam-roll-quads', 'cat-cow-stretch', 'childs-pose', 'legs-up-the-wall'])
      expect(animationFor(id), id).not.toBeNull();
    for (const id of ['sumo-squat-rocking-stretch', 'reclining-butterfly', 'lying-glute-stretch', 'figure-4-stretch-wall', 'standing-forward-bend', 'foam-roll-glutes', 'straddle-stretch', 'foam-roll-lower-back', 'lying-knee-to-chest', 'hip-flexor-stretch', 'pike-stretch', 'hamstring-stretch', 'side-lunge-stretch'])
      expect(animationFor(id), id).not.toBeNull();
    expect(animationFor('lying-pectoral-stretch')).toBeNull();
  });

  it('perro boca abajo: las manos no se mueven y la cadera es el punto más alto', () => {
    const a = ANIMATIONS['downward-facing-dog'];
    for (const t of samples(a.duration, 20)) {
      const p = a.pose(t);
      expect(dist(p.hand, a.pose(0).hand)).toBeLessThan(0.001);
      expect(p.torso[0][1]).toBeLessThan(p.torso[1][1] - 20);
      expect(p.torso[0][1]).toBeLessThan(p.legs[0][1] - 40);
    }
  });

  it('gato-vaca: la espalda sube y baja respecto a la línea de la cadera al hombro', () => {
    const a = ANIMATIONS['cat-cow-stretch'];
    const middle = (t: number) => {
      const torso = a.pose(t).torso;
      return torso[Math.floor(torso.length / 2)][1] - torso[0][1];
    };
    expect(middle(a.duration * 0.25)).toBeLessThan(-12);
    expect(middle(a.duration * 0.75)).toBeGreaterThan(12);
  });
});

describe('el calentamiento', () => {
  it('los ejercicios que más se programan tienen muñeco', () => {
    for (const id of ['crossover-symmetry', 'hip-halo', 'jumping-jacks', 'butt-kicks', 'arm-hugs', 'inchworm-push-up', 'backward-sprint', 'pvc-around-the-world', 'arm-circles', 'side-shuffle', 'sit-up-to-pike', 'high-knees', 'mountain-climbers', 'band-shoulder-dislocate', 'pvc-pass-through'])
      expect(animationFor(id), id).not.toBeNull();
    for (const id of ['scorpions', 'sit-up-to-straddle', 'thoracic-mobility-stretch', 'spiderman-lunge', 'lateral-leg-swings', 'thoracic-spine-bb-stretch', 'cossack-lunge', 'general-aerobic-warmup', 'goblet-squat-hold', 'glute-activation'])
      expect(animationFor(id), id).not.toBeNull();
  });

  it('escorpión (visto desde arriba): una pierna cruza al otro lado y los brazos no se mueven', () => {
    const a = ANIMATIONS.scorpions;
    const rest = a.pose(0);
    const crossed = a.pose(a.duration * 0.25);
    expect(rest.legs[0][0]).toBeLessThan(rest.torso[0][0]);
    expect(crossed.legs[0][0]).toBeGreaterThan(crossed.torso[0][0] + 30);
    expect(dist(crossed.hand, rest.hand)).toBeLessThan(0.001);
    expect(a.pose(a.duration * 0.75).legs2![0][0]).toBeLessThan(rest.torso[0][0] - 30);
  });

  it('jumping jacks: se abren los pies y las manos suben por encima de la cabeza', () => {
    const a = ANIMATIONS['jumping-jacks'];
    const closed = a.pose(0);
    const open = a.pose(a.duration / 2);
    const feet = (p: typeof closed) => p.legs[4][0] - p.legs[0][0];
    expect(feet(open)).toBeGreaterThan(feet(closed) + 40);
    expect(open.hand[1]).toBeLessThan(open.head[1] - 10);
    expect(closed.hand[1]).toBeGreaterThan(closed.torso[0][1] - 10);
  });

  it('gusano: se pasa de estar de pie a la plancha con las manos en el suelo y se vuelve', () => {
    const a = ANIMATIONS['inchworm-push-up'];
    expect(a.pose(0).head[1]).toBeLessThan(80);
    const plank = a.pose(2.1);
    expect(plank.hand[1]).toBeCloseTo(238, 0);
    expect(plank.head[1]).toBeGreaterThan(150);
    expect(a.pose(2.7).torso[1][1]).toBeGreaterThan(plank.torso[1][1] + 35);
    expect(a.pose(a.duration).head[1]).toBeCloseTo(a.pose(0).head[1], 3);
  });

  it('high knees sube la rodilla hasta la cadera; talones al glúteo sube el pie hacia atrás', () => {
    const knees = ANIMATIONS['high-knees'].pose(0.2);
    expect(knees.legs[1][1]).toBeLessThan(knees.legs[2][1] + 10);
    const heels = ANIMATIONS['butt-kicks'].pose(0.2);
    expect(heels.legs[0][0]).toBeLessThan(heels.legs[1][0] - 25);
    expect(heels.legs[0][1]).toBeLessThan(heels.legs[1][1]);
  });
});

describe('alias de animaciones', () => {
  it('cada alias apunta a una animación que existe y es un movimiento del catálogo', () => {
    for (const [id, target] of Object.entries(ANIMATION_ALIASES)) {
      expect(getMovementById(id), id).toBeDefined();
      expect(ANIMATIONS[target], `${id} → ${target}`).toBeDefined();
      expect(animationFor(id)).toBe(ANIMATIONS[target]);
    }
  });
});

describe('interpolación y codo', () => {
  const kf: [number, number[]][] = [
    [0, [0, 10]],
    [1, [10, 20]],
  ];
  it('suaviza entre posturas y se queda en los extremos fuera de rango', () => {
    expect(interpolate(kf, 0)).toEqual([0, 10]);
    expect(interpolate(kf, 1)).toEqual([10, 20]);
    expect(interpolate(kf, 0.5)).toEqual([5, 15]);
    expect(interpolate(kf, -3)).toEqual([0, 10]);
    expect(interpolate(kf, 9)).toEqual([10, 20]);
  });

  it('el codo de un brazo estirado queda en la línea, y uno doblado respeta los largos', () => {
    const straight = elbow([0, 0], [0, 57.5], 28, 30, 'down');
    expect(Math.abs(straight[0])).toBeLessThan(4.5);
    expect(straight[1]).toBeGreaterThan(20);
    const e = elbow([0, 0], [-22, 14], 28, 30, 'down');
    expect(dist([0, 0], e)).toBeCloseTo(28, 3);
    expect(dist(e, [-22, 14])).toBeCloseTo(30, 3);
    expect(e[1]).toBeGreaterThan(0);
    const back = elbow([0, 0], [-4, 8], 28, 30, 'back');
    expect(back[0]).toBeLessThan(0);
  });
});
