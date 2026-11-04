import { describe, it, expect } from 'vitest';
import { EMPTY_WOD_FORM } from '../../engine/wodScoring';
import { capStep, capView, clockFormFor, clockStopToRecord, isFormUntouched, pickClockStop, type ClockStop } from './workoutClockResult';

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

  describe('el reloj paró solo en el time cap', () => {
    const cap = (seconds: number, rounds = 0): ClockStop => ({ seconds, rounds, capped: true });

    it('un WOD por tiempo sale como no terminado, con el cap y las rondas, no con un tiempo', () => {
      expect(clockFormFor(cap(900, 3), 'time')).toEqual({ capped: true, capSeconds: 900, rounds: 3 });
    });

    it('en un AMRAP el final del tiempo es el final normal: solo las rondas', () => {
      expect(clockFormFor(cap(1200, 6), 'rounds+reps')).toEqual({ rounds: 6 });
    });

    it('un formulario con el CAP ya puesto no se considera vacío', () => {
      expect(isFormUntouched({ ...EMPTY_WOD_FORM, capped: true })).toBe(false);
    });
  });
  it('solo se toca un formulario que sigue vacío', () => {
    expect(isFormUntouched(EMPTY_WOD_FORM)).toBe(true);
    expect(isFormUntouched({ ...EMPTY_WOD_FORM, seconds: 5 })).toBe(false);
    expect(isFormUntouched({ ...EMPTY_WOD_FORM, load: 60 })).toBe(false);
  });
});

describe('el reloj con time cap', () => {
  const cap = { seconds: 900 };
  const fresh = { hit: false, warned: false };

  describe('qué hace en cada tic', () => {
    it('sin límite sigue siempre; lejos del límite también', () => {
      expect(capStep(5000, null, fresh)).toEqual({ kind: 'run' });
      expect(capStep(0, cap, fresh)).toEqual({ kind: 'run' });
      expect(capStep(839, cap, fresh)).toEqual({ kind: 'run' });
    });

    it('a falta de un minuto avisa, una sola vez', () => {
      expect(capStep(840, cap, fresh)).toEqual({ kind: 'warn' });
      expect(capStep(870, cap, fresh)).toEqual({ kind: 'warn' });
      expect(capStep(870, cap, { hit: false, warned: true })).toEqual({ kind: 'run' });
    });

    it('con un límite corto no avisa del último minuto (no daría margen)', () => {
      expect(capStep(40, { seconds: 90 }, fresh)).toEqual({ kind: 'run' });
      expect(capStep(40, { seconds: 91 }, fresh)).toEqual({ kind: 'warn' });
    });

    it('al llegar al límite para, con el tiempo del límite; pasado el límite no vuelve a pararse', () => {
      expect(capStep(900, cap, fresh)).toEqual({ kind: 'hit', seconds: 900 });
      expect(capStep(901.4, cap, fresh)).toEqual({ kind: 'hit', seconds: 900 });
      expect(capStep(1000, cap, { hit: true, warned: true })).toEqual({ kind: 'run' });
    });

    it('si el tic llega tarde (móvil bloqueado) y se pasó del aviso, para igualmente', () => {
      expect(capStep(1200, cap, fresh)).toEqual({ kind: 'hit', seconds: 900 });
    });
  });

  describe('qué se guarda para el resultado', () => {
    const snap = { seconds: 900, rounds: 3, capped: true };

    it('sin límite alcanzado, lo que marca el cronómetro', () => {
      expect(clockStopToRecord({ elapsed: 542.4, rounds: 4, snapshot: null, continuedPastCap: false })).toEqual({ seconds: 542, rounds: 4 });
    });

    it('en el cap de un WOD por tiempo: el cap, marcado como no terminado, con las rondas actuales (por si corriges un toque)', () => {
      expect(clockStopToRecord({ elapsed: 900, rounds: 4, snapshot: snap, continuedPastCap: false })).toEqual({ seconds: 900, rounds: 4, capped: true });
    });

    it('si seguiste cronometrando tras el cap, lo guardado es lo de ese momento', () => {
      expect(clockStopToRecord({ elapsed: 1050, rounds: 5, snapshot: snap, continuedPastCap: true })).toEqual({ seconds: 900, rounds: 3, capped: true });
    });

    it('al final de un AMRAP no hay marca de CAP', () => {
      expect(clockStopToRecord({ elapsed: 1200, rounds: 6, snapshot: { seconds: 1200, rounds: 6, capped: false }, continuedPastCap: false })).toEqual({ seconds: 1200, rounds: 6 });
    });
  });

  describe('lo que se ve', () => {
    it('sin límite no hay nada que enseñar', () => {
      expect(capView(100, null, false)).toBeNull();
    });

    it('lo que queda, el avance y el último minuto', () => {
      expect(capView(300, cap, false)).toEqual({ left: 600, progress: 300 / 900, lastMinute: false, over: 0 });
      expect(capView(860, cap, false)?.lastMinute).toBe(true);
      expect(capView(899, cap, false)?.lastMinute).toBe(true);
    });

    it('al llegar al límite ya no es el último minuto, y lo cronometrado después cuenta como "sobre el límite"', () => {
      const hit = capView(900, cap, true)!;
      expect(hit).toMatchObject({ left: 0, progress: 1, lastMinute: false, over: 0 });
      expect(capView(960, cap, true)).toMatchObject({ progress: 1, over: 60, lastMinute: false });
    });
  });
});
