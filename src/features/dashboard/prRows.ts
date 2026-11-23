import type { PersonalRecords } from '../../data/athlete/types';

/** Orden deliberado: fila 1 los grandes basicos, fila 2 press estricto + los 3 de halterofilia — no alfabetico, se lee como un atleta agruparia sus propios numeros. */
export const PR_ROWS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'clean', label: 'Clean' },
  { key: 'cleanAndJerk', label: 'C&J' },
];
