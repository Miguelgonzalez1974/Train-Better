import { describe, expect, it } from 'vitest';
import { ANIMATIONS, animatedMovementIds, animationFor, elbow, interpolate, type Point } from './movementAnimation';
import { getMovementById } from '../data/movements';

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const samples = (duration: number, n = 40) => Array.from({ length: n + 1 }, (_, i) => (duration * i) / n);

describe('animaciones de movimientos', () => {
  it('solo hay animación para movimientos que existen en el catálogo', () => {
    for (const id of animatedMovementIds()) expect(getMovementById(id), id).toBeDefined();
    expect(animationFor('row')).not.toBeNull();
    expect(animationFor('kipping-pull-up')).not.toBeNull();
    expect(animationFor('ring-dip')).not.toBeNull();
    expect(animationFor('movimiento-sin-dibujo')).toBeNull();
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
        const all: Point[] = [...p.legs, ...p.torso, ...p.arm, p.head, p.hand];
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
    for (const id of ['kipping-pull-up', 'ring-dip']) {
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
        // Tronco, muslo y pierna: largos fijos.
        expect(dist(p.torso[0], p.torso[1]), `${id} torso t=${t}`).toBeCloseTo(52, 1);
        expect(dist(p.legs[0], p.legs[1]), `${id} t=${t}`).toBeGreaterThan(40);
        // El brazo: dos tramos que suman como mucho su largo completo.
        expect(dist(p.arm[0], p.arm[1]) + dist(p.arm[1], p.arm[2])).toBeLessThanOrEqual(58.5);
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
