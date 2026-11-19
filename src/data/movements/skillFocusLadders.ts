/**
 * Las escaleras del foco de skill: handstand walk y muscle-up (en barra o en anillas). Cada paso es un movimiento real del catálogo con lo que
 * hay que mirar y una ola de 4 semanas (series y repeticiones, o segundos, que suben semana a semana; la 4ª es de test: se baja el volumen y se
 * mide). Al terminar la ola el paso siguiente empieza solo; si el paso no está dominado se puede repetir desde Objetivos → Cómo programa el coach.
 * Los pasos de los árboles genéricos (`skillProgressions.ts`) no se tocan: esto es el programa propio de estas dos habilidades.
 */

export type SkillFocusKey = 'mu' | 'hsw';
export type MuKind = 'bar' | 'ring';

export interface SkillWaveWeek {
  sets: number;
  /** Lo que se hace en cada serie («3», «20 s», «3 m»). */
  reps: string;
  /** Qué cambia esa semana respecto a la anterior. */
  tip: string;
}

export interface SkillLadderStep {
  movementId: string;
  /** Nombre corto del paso para el selector y las notas. */
  label: string;
  /** En qué fijarse y cuándo está dominado. */
  cue: string;
  /** Las 4 semanas de la ola; la 4ª es el test del paso. */
  wave: [SkillWaveWeek, SkillWaveWeek, SkillWaveWeek, SkillWaveWeek];
}

/** Semanas que dura cada paso (una ola entera) antes de pasar al siguiente. */
export const SKILL_WAVE_WEEKS = 4;

export const HANDSTAND_WALK_LADDER: SkillLadderStep[] = [
  {
    movementId: 'wall-walk',
    label: 'Wall walk',
    cue: 'Sube por la pared con el pecho mirando a ella, manos a un palmo de la pared al final. Dominado: 3 repeticiones con el pecho pegado y 10 s arriba.',
    wave: [
      { sets: 4, reps: '3', tip: 'Sube hasta que el pecho quede a ~30 cm de la pared.' },
      { sets: 4, reps: '4', tip: 'Acércate: pecho a ~15 cm, sin arquear la lumbar.' },
      { sets: 5, reps: '4', tip: 'Pausa de 5 s arriba en cada repetición.' },
      { sets: 3, reps: '3', tip: 'Test: pecho pegado a la pared y 10 s arriba. Menos series, todas limpias.' },
    ],
  },
  {
    movementId: 'handstand-hold',
    label: 'Pino en pared',
    cue: 'Pino de cara a la pared, cuerpo hueco, empuja el suelo y mira entre las manos. Dominado: 40 s seguidos sin arquear.',
    wave: [
      { sets: 4, reps: '20 s', tip: 'Tiempo limpio: sal antes de que la lumbar se arquee.' },
      { sets: 4, reps: '30 s', tip: 'Sube a 30 s con el mismo cuerpo hueco.' },
      { sets: 5, reps: '30 s', tip: 'Una serie más; descansa lo justo, 90 s.' },
      { sets: 3, reps: '40 s', tip: 'Test: tu mejor serie, 40 s o más. Anótala.' },
    ],
  },
  {
    movementId: 'hs-shoulder-taps',
    label: 'Toques de hombro',
    cue: 'En pino de cara a la pared, suelta una mano y toca el hombro contrario sin mover las caderas. Dominado: 10 toques seguidos sin perder la línea.',
    wave: [
      { sets: 4, reps: '6 toques', tip: 'Lento y controlado, sin balancear las caderas.' },
      { sets: 4, reps: '8 toques', tip: 'Más toques con la misma calidad; mira entre las manos.' },
      { sets: 5, reps: '8 toques', tip: 'Una serie más; la mano que toca, rápida y suave.' },
      { sets: 3, reps: '10 toques', tip: 'Test: 10 toques sin tocar la pared con los pies si puedes.' },
    ],
  },
  {
    movementId: 'handstand-walk-progression',
    label: 'Primeros pasos',
    cue: 'Cambios de peso a cada lado y pasos cortos desde la pared. Dominado: 5 m de pasos cortos controlados sin pared.',
    wave: [
      { sets: 5, reps: '3-5 pasos', tip: 'Desde la pared, cambia el peso y da pasos muy pequeños.' },
      { sets: 6, reps: '5-8 pasos', tip: 'Más pasos; corrige el equilibrio con los dedos, no con las piernas.' },
      { sets: 6, reps: '3 m', tip: 'Patada controlada y 3 m con pasos pequeños.' },
      { sets: 4, reps: 'tu máximo', tip: 'Test: lo máximo que llegues. Anota los metros.' },
    ],
  },
  {
    movementId: 'handstand-walk',
    label: 'Caminar libre',
    cue: 'Pasos pequeños, mira a las manos, hombros abiertos y corrige con los dedos. Siempre fresco: el cansancio aquí no suma.',
    wave: [
      { sets: 6, reps: '3 m', tip: 'Intentos frescos y descansados (1-2 min).' },
      { sets: 6, reps: '5 m', tip: 'Alarga a 5 m; para cuando los pasos se vuelvan largos.' },
      { sets: 8, reps: '5 m', tip: 'Más intentos, pasos cortos y regulares.' },
      { sets: 4, reps: 'tu máximo', tip: 'Test: la distancia más larga sin parar. Anótala.' },
    ],
  },
];

/** Los últimos pasos del muscle-up son los mismos en barra y en anillas: el tirón de transición, la banda y el movimiento entero. */
const MU_TRANSITION: SkillLadderStep = {
  movementId: 'muscle-up-transition-drill',
  label: 'Transición aislada',
  cue: 'Transición con los pies apoyados o con banda: gira rápido las muñecas sobre la barra o las anillas y cierra el pecho. Dominado: 5 limpias seguidas.',
  wave: [
    { sets: 4, reps: '5', tip: 'Despacio y limpio, la transición completa en cada una.' },
    { sets: 5, reps: '5', tip: 'Una serie más y un poco más rápida.' },
    { sets: 5, reps: '6', tip: 'Más rápido: la transición debe ser un solo gesto.' },
    { sets: 3, reps: '5', tip: 'Test: 5 transiciones seguidas con pausa de 1 s arriba.' },
  ],
};

const MU_BANDED: SkillLadderStep = {
  movementId: 'banded-muscle-up',
  label: 'Muscle-up con banda',
  cue: 'Muscle-up completo con banda bajo los pies: tira alto y mete el cuerpo pronto. Dominado: 3 seguidos con banda fina.',
  wave: [
    { sets: 5, reps: '2', tip: 'Banda gruesa: movimiento completo y limpio.' },
    { sets: 5, reps: '3', tip: 'Una repetición más por serie con la misma banda.' },
    { sets: 6, reps: '3', tip: 'Cambia a una banda más fina.' },
    { sets: 4, reps: '2', tip: 'Test: banda fina (o la más fina que puedas), 2-3 seguidos.' },
  ],
};

const MU_FULL = (movementId: 'bar-muscle-up' | 'ring-muscle-up', label: string, cue: string): SkillLadderStep => ({
  movementId,
  label,
  cue,
  wave: [
    { sets: 6, reps: '1', tip: 'Intentos frescos de 1; descansa 1-2 min entre ellos.' },
    { sets: 6, reps: '2', tip: 'Si sale el 1, enlaza 2; si no, repite 1 con calidad.' },
    { sets: 8, reps: '1', tip: 'Un intento cada 90 s: calidad antes que cantidad.' },
    { sets: 4, reps: 'tu máximo', tip: 'Test: máximo de muscle-ups seguidos, frescos. Anótalo.' },
  ],
});

export const MU_LADDERS: Record<MuKind, SkillLadderStep[]> = {
  bar: [
    {
      movementId: 'chest-to-bar-pull-up',
      label: 'Pecho a barra explosivo',
      cue: 'Tira alto y rápido hasta que el pecho llegue al esternón-barra, sin kip exagerado. Dominado: 5 seguidas explosivas.',
      wave: [
        { sets: 5, reps: '3', tip: 'Cada una explosiva, con el pecho a la barra.' },
        { sets: 5, reps: '4', tip: 'Una más por serie; tira hacia atrás, no solo arriba.' },
        { sets: 6, reps: '4', tip: 'Una serie más con la misma altura.' },
        { sets: 4, reps: '5', tip: 'Test: 5 seguidas con el pecho a la barra.' },
      ],
    },
    MU_TRANSITION,
    MU_BANDED,
    MU_FULL('bar-muscle-up', 'Muscle-up en barra', 'Tirón alto + transición rápida + salida con press. Series cortas y frescas; para antes del fallo.'),
  ],
  ring: [
    {
      movementId: 'false-grip-hang',
      label: 'False grip',
      cue: 'Muñeca por encima de la anilla desde el inicio. Dominado: 30 s colgado sin soltar y con los hombros activos.',
      wave: [
        { sets: 4, reps: '15 s', tip: 'Muñeca sobre la anilla; para si el agarre se abre.' },
        { sets: 4, reps: '20 s', tip: 'Más tiempo, hombros activos y costillas dentro.' },
        { sets: 5, reps: '20 s', tip: 'Una serie más; intercala con dominadas en false grip si puedes.' },
        { sets: 3, reps: '30 s', tip: 'Test: 30 s seguidos en false grip.' },
      ],
    },
    {
      movementId: 'ring-support-hold',
      label: 'Soporte en anillas',
      cue: 'Brazos bloqueados, anillas giradas hacia fuera y hombros abajo. Dominado: 30 s quieto con las anillas giradas.',
      wave: [
        { sets: 4, reps: '20 s', tip: 'Anillas pegadas al cuerpo, brazos bloqueados.' },
        { sets: 4, reps: '25 s', tip: 'Gira las anillas hacia fuera (rotación externa).' },
        { sets: 5, reps: '25 s', tip: 'Una serie más con las anillas giradas.' },
        { sets: 3, reps: '30 s', tip: 'Test: 30 s quieto con las anillas giradas.' },
      ],
    },
    MU_TRANSITION,
    MU_BANDED,
    MU_FULL('ring-muscle-up', 'Muscle-up en anillas', 'False grip + tirón al pecho + transición + dip de salida. Series cortas y frescas; para antes del fallo.'),
  ],
};
