import { describe, expect, it } from 'vitest';
import { clockText, COMPLEX_REST_SECONDS, olyRestForReps, prescribedRestSeconds, restLabel, strengthRestForReps, TEST_REST_SECONDS, WAVE_REST_SECONDS } from './restPrescription';

describe('el descanso que prescribe el entreno', () => {
  it('en fuerza, cuantas más repeticiones menos descanso', () => {
    expect([1, 2, 3, 5, 6, 8, 10, 12, 15].map(strengthRestForReps)).toEqual([180, 180, 150, 150, 120, 120, 90, 90, 60]);
  });

  it('en halterofilia, poco descanso extra: se descansa para repetir bien', () => {
    expect(olyRestForReps(1)).toBe(120);
    expect(olyRestForReps(3)).toBe(120);
    expect(olyRestForReps(5)).toBe(90);
  });

  it('una serie recta de fuerza descansa según sus repeticiones', () => {
    expect(prescribedRestSeconds({ block: 'strength', reps: '5', sets: 4 })).toBe(150);
    expect(prescribedRestSeconds({ block: 'strength', reps: '10-12', sets: 3 })).toBe(90);
    expect(prescribedRestSeconds({ block: 'strength', reps: '3', sets: 5 })).toBe(150);
    expect(prescribedRestSeconds({ block: 'oly', reps: '2', sets: 5 })).toBe(120);
  });

  it('un complejo, una rampa o una ola y un test llevan su descanso propio', () => {
    expect(prescribedRestSeconds({ block: 'oly', reps: '1+1+1', sets: 5, complex: { id: 'c', name: 'C', steps: [{ movementId: 'power-clean', reps: 1 }] } })).toBe(COMPLEX_REST_SECONDS);
    expect(prescribedRestSeconds({ block: 'strength', reps: '5-3-1', sets: 6, setPlan: [{ reps: 5, kg: 60 }, { reps: 3, kg: 70 }, { reps: 1, kg: 80 }] })).toBe(WAVE_REST_SECONDS);
    expect(prescribedRestSeconds({ block: 'strength', reps: '1', sets: 1, format: 'Test 1RM' })).toBe(TEST_REST_SECONDS);
  });

  it('lo que lleva su propio reloj o no es de barra no marca descanso', () => {
    expect(prescribedRestSeconds({ block: 'oly', reps: '1', sets: 10, format: 'EMOM 10 min' })).toBeNull();
    expect(prescribedRestSeconds({ block: 'accessory', reps: '12', sets: 3 })).toBeNull();
    expect(prescribedRestSeconds({ block: 'wod', reps: '10' })).toBeNull();
    expect(prescribedRestSeconds({ block: 'warmup', reps: '10' })).toBeNull();
    expect(prescribedRestSeconds({ block: 'strength', reps: 'al fallo', sets: 3 })).toBeNull();
    expect(prescribedRestSeconds({ block: 'strength', sets: 3 })).toBeNull();
  });

  it('cómo se dice', () => {
    expect([150, 180, 90, 60, 120, 240, 75].map(restLabel)).toEqual(['2:30', '3 min', '90 s', '1 min', '2 min', '4 min', '75 s']);
    expect(clockText(102)).toBe('1:42');
    expect(clockText(-3)).toBe('0:00');
  });
});
