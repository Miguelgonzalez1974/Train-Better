/**
 * Las explicaciones cortas de la jerga de la app (ver `Term`). Se escriben una sola vez aquí para que digan lo mismo en todas las
 * pantallas: una o dos frases, sin fórmulas.
 */

export const GLOSSARY = {
  rpe: {
    title: 'RPE · esfuerzo percibido',
    text: 'Lo duro que te pareció el entreno, de 1 a 10. Un 6 es cómodo, un 8 es duro y un 10 es el máximo.',
  },
  rx: {
    title: 'Rx',
    text: 'El WOD hecho tal como está prescrito: mismas cargas y movimientos, sin escalar.',
  },
  acwr: {
    title: 'ACWR · carga aguda frente a crónica',
    text: 'Lo que has entrenado esta semana comparado con tu media de las últimas 4. Entre 0,8 y 1,3 es la zona óptima; por encima estás subiendo la carga demasiado rápido.',
  },
  taper: {
    title: 'Taper',
    text: 'Bajar el volumen en los días antes de competir, manteniendo la intensidad, para llegar fresco.',
  },
  e1rm: {
    title: '1RM estimado',
    text: 'Lo que podrías levantar a una repetición, calculado con tus series de trabajo (peso, repeticiones y RPE). No es un test.',
  },
  hrv: {
    title: 'HRV',
    text: 'Variabilidad de tu frecuencia cardiaca por la mañana. Si está dentro o por encima de tu rango normal, sueles estar recuperado.',
  },
  fitness: {
    title: 'Forma física',
    text: 'Lo que has construido entrenando: sube despacio con las semanas y se va despacio si paras. Es la línea azul de la curva.',
  },
  supercompensacion: {
    title: 'Supercompensación',
    text: 'Tras cargar y descansar, el cuerpo se recupera y queda un poco por encima de donde estaba. Esa ventana, con la fatiga ya baja, es cuando mejor rindes.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
