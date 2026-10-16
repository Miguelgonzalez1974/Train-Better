import type { HabitTag } from '../data/athlete/types';

/** Los hábitos que se pueden marcar en el check-in, en el orden en que se enseñan. */
export const HABIT_ORDER: HabitTag[] = ['alcohol', 'cafeina', 'cena-tarde', 'pantallas', 'viaje', 'estres-trabajo', 'siesta', 'enfermo'];

export const HABIT_LABEL: Record<HabitTag, string> = {
  alcohol: 'Alcohol',
  cafeina: 'Cafeína tarde',
  'cena-tarde': 'Cena tarde',
  pantallas: 'Pantallas tarde',
  viaje: 'Viaje',
  'estres-trabajo': 'Estrés en el trabajo',
  siesta: 'Siesta',
  enfermo: 'Algo de malestar',
};

/** Cómo se dice en una frase cuando el hábito está presente: "cuando tomas alcohol…". */
export const HABIT_CONDITION: Record<HabitTag, string> = {
  alcohol: 'tomas alcohol',
  cafeina: 'tomas cafeína por la tarde',
  'cena-tarde': 'cenas tarde',
  pantallas: 'usas pantallas hasta tarde',
  viaje: 'viajas',
  'estres-trabajo': 'tienes estrés en el trabajo',
  siesta: 'haces siesta',
  enfermo: 'tienes algo de malestar',
};

/** Horas de sueño de referencia para un adulto que entrena: por debajo de la primera se nota, de la segunda en adelante es lo ideal. */
export const SLEEP_OK_FROM = 7;
export const SLEEP_OK_TO = 9;

/** "7 h 30" para 7,5; "7 h" para 7. */
export function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
