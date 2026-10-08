import { describe, it, expect } from 'vitest';
import { EMPTY_WOD_FORM } from '../../engine/wodScoring';
import { clockFormFor, isFormUntouched, pickClockStop, type ClockStop } from './workoutClockResult';

const run = (seconds: number, rounds = 0): ClockStop => ({ seconds, rounds });

describe('reloj de entreno → resultado del WOD', () => {
  describe('qué tanda corresponde a cada parte', () => {
    it('sin paradas no hay nada que volcar', () => {
      expect(pickClockStop([], 1, 1)).toBeUndefined();
      expect(pickClockStop([], 2, 2)).toBeUndefined();
    });

    it('un WOD normal usa la última parada', () => {
      expect(pickClockStop([run(300), run(540)], 1, 1)).toEqual(run(540));
    });

    it('doble WOD: la parte 1 es la primera tanda y la parte 2 la última', () => {
      const runs = [run(400), run(500), run(610)];
      expect(pickClockStop(runs, 1, 2)).toEqual(run(400));
      expect(pickClockStop(runs, 2, 2)).toEqual(run(610));
    });

    it('doble WOD con una sola tanda: la parte 2 se queda sin prellenar', () => {
      expect(pickClockStop([run(400)], 1, 2)).toEqual(run(400));
      expect(pickClockStop([run(400)], 2, 2)).toBeUndefined();
    });
  });

  describe('qué campo se rellena según cómo puntúa el WOD', () => {
    it('for time: minutos y segundos', () => {
      expect(clockFormFor(run(542), 'time')).toEqual({ minutes: 9, seconds: 2 });
      expect(clockFormFor(run(60), 'time')).toEqual({ minutes: 1, seconds: 0 });
    });

    it('AMRAP: las rondas contadas (las repeticiones sueltas las pones tú)', () => {
      expect(clockFormFor(run(720, 7), 'rounds+reps')).toEqual({ rounds: 7 });
    });

    it('AMRAP sin rondas contadas, o tiempo a cero: no se inventa nada', () => {
      expect(clockFormFor(run(720, 0), 'rounds+reps')).toBeNull();
      expect(clockFormFor(run(0), 'time')).toBeNull();
    });

    it('reps totales y carga no se pueden deducir del reloj', () => {
      expect(clockFormFor(run(600, 5), 'reps')).toBeNull();
      expect(clockFormFor(run(600, 5), 'load')).toBeNull();
    });
  });

  it('solo se toca un formulario que sigue vacío', () => {
    expect(isFormUntouched(EMPTY_WOD_FORM)).toBe(true);
    expect(isFormUntouched({ ...EMPTY_WOD_FORM, seconds: 5 })).toBe(false);
    expect(isFormUntouched({ ...EMPTY_WOD_FORM, load: 60 })).toBe(false);
  });
});
