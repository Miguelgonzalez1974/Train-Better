import type { PainArea } from './athlete/types';

/**
 * Biblioteca de movilidad y estiramientos para el módulo de Rex. Cada ejercicio dice a qué zona(s) sirve, de qué tipo es (cuándo
 * conviene hacerlo), cuánto dura por lado y cómo se hace en una línea. No lleva imágenes: «Ver cómo se hace» abre una búsqueda de
 * vídeos con el nombre del ejercicio (un enlace de búsqueda no se rompe como un vídeo concreto). Orientativo, no es fisioterapia.
 */

export type MobilityZone = 'caderas' | 'cuadriceps' | 'isquios' | 'tobillos' | 'toracica' | 'hombros' | 'munecas' | 'cuello';

export const MOBILITY_ZONES: MobilityZone[] = ['caderas', 'cuadriceps', 'isquios', 'tobillos', 'toracica', 'hombros', 'munecas', 'cuello'];

export const MOBILITY_ZONE_LABEL: Record<MobilityZone, string> = {
  caderas: 'Caderas',
  cuadriceps: 'Cuádriceps y rodillas',
  isquios: 'Isquios y lumbar',
  tobillos: 'Tobillos y gemelos',
  toracica: 'Columna torácica',
  hombros: 'Hombros',
  munecas: 'Muñecas y codos',
  cuello: 'Cuello',
};

/**
 * `estatico`: posturas mantenidas (para después de entrenar). `dinamico`: movimiento controlado (calentar o ganar rango).
 * `activacion`: despertar músculos con poca carga. `liberacion`: rodillo o presión sobre puntos de tensión.
 */
export type MobilityKind = 'estatico' | 'dinamico' | 'activacion' | 'liberacion';

export interface MobilityExercise {
  id: string;
  name: string;
  /** Zonas que trabaja; la primera es la principal. */
  zones: MobilityZone[];
  kind: MobilityKind;
  /** Segundos por lado (o en total si `sides` es 1). */
  seconds: number;
  sides: 1 | 2;
  /** Cómo se hace, en una línea. */
  how: string;
  equipment?: string;
  /** Zonas con aviso de molestia que este ejercicio carga: con ese aviso activo no se propone. */
  loads?: PainArea[];
  /** Versión suave: se puede proponer aunque la zona tenga un aviso activo (siempre que no cargue esa zona). */
  gentle?: boolean;
}

export const MOBILITY_LIBRARY: MobilityExercise[] = [
  // ---- caderas ----
  { id: 'cadera-cars', name: 'Círculos de cadera (CARs)', zones: ['caderas'], kind: 'dinamico', seconds: 30, sides: 2, how: 'A cuatro apoyos, levanta la rodilla y dibuja el círculo más grande que puedas sin mover la espalda.', gentle: true },
  { id: 'cadera-9090', name: '90/90 de cadera', zones: ['caderas'], kind: 'dinamico', seconds: 40, sides: 1, how: 'Sentado con las dos rodillas a 90°, pasa las rodillas de un lado a otro sin despegar el torso del suelo.' },
  { id: 'cadera-mariposa', name: 'Mariposa', zones: ['caderas'], kind: 'estatico', seconds: 45, sides: 1, how: 'Sentado con las plantas de los pies juntas; deja caer las rodillas y baja el torso con la espalda larga.', gentle: true },
  { id: 'cadera-figura4', name: 'Figura 4 tumbado', zones: ['caderas'], kind: 'estatico', seconds: 40, sides: 2, how: 'Tumbado, cruza el tobillo sobre la rodilla contraria y tira de esa pierna hacia el pecho.', gentle: true },
  { id: 'cadera-flexor', name: 'Flexor de cadera (couch stretch)', zones: ['caderas', 'cuadriceps'], kind: 'estatico', seconds: 40, sides: 2, how: 'Rodilla trasera cerca de una pared o banco, glúteo apretado y cadera hacia delante sin arquear la espalda.', loads: ['rodilla'] },
  { id: 'cadera-paloma', name: 'Paloma', zones: ['caderas'], kind: 'estatico', seconds: 40, sides: 2, how: 'Pierna delantera doblada delante, la trasera estirada atrás; baja el torso sobre la pierna delantera.', loads: ['rodilla'] },
  { id: 'cadera-cosaca', name: 'Sentadilla cosaca', zones: ['caderas', 'tobillos'], kind: 'dinamico', seconds: 40, sides: 1, how: 'Piernas muy abiertas; baja sobre una pierna dejando la otra estirada y alterna sin prisa.', loads: ['rodilla'] },
  { id: 'cadera-sentadilla', name: 'Sentadilla profunda sostenida', zones: ['caderas', 'tobillos'], kind: 'estatico', seconds: 45, sides: 1, how: 'Abajo del todo con los talones apoyados; empuja las rodillas hacia fuera con los codos y respira.', loads: ['rodilla', 'cadera-lumbar'] },
  { id: 'cadera-puente', name: 'Puente de glúteo', zones: ['caderas', 'isquios'], kind: 'activacion', seconds: 40, sides: 1, how: 'Tumbado, sube la cadera apretando el glúteo y baja despacio sin arquear la zona lumbar.', gentle: true },

  // ---- cuádriceps y rodillas ----
  { id: 'cuad-pie', name: 'Cuádriceps de pie', zones: ['cuadriceps'], kind: 'estatico', seconds: 30, sides: 2, how: 'Lleva el talón al glúteo con la rodilla hacia abajo, cadera hacia delante y abdomen firme.', loads: ['rodilla'] },
  { id: 'cuad-rodillo', name: 'Rodillo en cuádriceps', zones: ['cuadriceps'], kind: 'liberacion', seconds: 45, sides: 2, how: 'Boca abajo con el rodillo bajo el muslo; rueda despacio y pausa donde notes tensión.', equipment: 'rodillo', gentle: true },
  { id: 'cuad-balanceo', name: 'Balanceo de pierna', zones: ['cuadriceps', 'isquios', 'caderas'], kind: 'dinamico', seconds: 30, sides: 2, how: 'Apoyado en una pared, balancea la pierna adelante y atrás de forma suelta y controlada.', gentle: true },

  // ---- isquios y lumbar ----
  { id: 'isq-banda', name: 'Isquios tumbado con banda', zones: ['isquios'], kind: 'estatico', seconds: 40, sides: 2, how: 'Tumbado, pierna estirada hacia el techo con una banda o toalla; la otra pierna descansa en el suelo.', equipment: 'banda o toalla', gentle: true },
  { id: 'isq-rodillo', name: 'Rodillo en isquios', zones: ['isquios'], kind: 'liberacion', seconds: 45, sides: 2, how: 'Sentado con el rodillo bajo el muslo; rueda del glúteo a la rodilla con las manos apoyadas.', equipment: 'rodillo', gentle: true },
  { id: 'isq-nino', name: 'Postura del niño', zones: ['isquios', 'caderas'], kind: 'estatico', seconds: 45, sides: 1, how: 'Caderas hacia los talones y brazos largos; respira hacia la espalda.', gentle: true },
  { id: 'isq-gatovaca', name: 'Gato-vaca', zones: ['isquios', 'toracica'], kind: 'dinamico', seconds: 40, sides: 1, how: 'A cuatro apoyos, arquea y redondea la columna al ritmo de la respiración.', gentle: true },
  { id: 'isq-rodilla-pecho', name: 'Rodilla al pecho', zones: ['isquios'], kind: 'estatico', seconds: 30, sides: 2, how: 'Tumbado, abraza una rodilla contra el pecho mientras la otra pierna se queda larga.', gentle: true },
  { id: 'isq-rotacion', name: 'Rotación lumbar tumbado', zones: ['isquios', 'toracica'], kind: 'estatico', seconds: 35, sides: 2, how: 'Tumbado con las rodillas dobladas, déjalas caer hacia un lado con los hombros pegados al suelo.', gentle: true },
  { id: 'isq-buenosdias', name: 'Buenos días con palo', zones: ['isquios'], kind: 'dinamico', seconds: 35, sides: 1, how: 'Palo en la espalda, bisagra de cadera con espalda neutra hasta notar los isquios y vuelve.', loads: ['cadera-lumbar'] },
  { id: 'isq-gusano', name: 'Gusano (inchworm)', zones: ['isquios', 'hombros'], kind: 'dinamico', seconds: 40, sides: 1, how: 'De pie, baja las manos al suelo, camina hasta plancha, vuelve caminando y sube.', loads: ['hombro', 'codo-muneca'] },
  { id: 'isq-birddog', name: 'Bird dog', zones: ['isquios', 'caderas'], kind: 'activacion', seconds: 40, sides: 1, how: 'A cuatro apoyos, estira brazo y pierna contrarios sin que la cadera gire; alterna.', gentle: true },

  // ---- tobillos y gemelos ----
  { id: 'tob-pared', name: 'Rodilla a la pared', zones: ['tobillos'], kind: 'dinamico', seconds: 35, sides: 2, how: 'Pie a un puño de la pared; lleva la rodilla a tocarla sobre el segundo dedo sin levantar el talón.', gentle: true },
  { id: 'tob-gemelo', name: 'Gemelo en pared', zones: ['tobillos'], kind: 'estatico', seconds: 35, sides: 2, how: 'Pierna trasera estirada con el talón en el suelo y empuja la pared con el cuerpo recto.', gentle: true },
  { id: 'tob-rodillo', name: 'Rodillo en gemelos', zones: ['tobillos'], kind: 'liberacion', seconds: 45, sides: 2, how: 'Sentado con el rodillo bajo la pantorrilla; rueda del tobillo a la rodilla y cruza la otra pierna encima si quieres más presión.', equipment: 'rodillo', gentle: true },
  { id: 'tob-circulos', name: 'Círculos de tobillo', zones: ['tobillos'], kind: 'dinamico', seconds: 30, sides: 2, how: 'Con el pie en el aire, dibuja círculos grandes y lentos en los dos sentidos.', gentle: true },
  { id: 'tob-talones', name: 'Caminar de talones y puntillas', zones: ['tobillos'], kind: 'activacion', seconds: 30, sides: 1, how: 'Camina unos pasos sobre los talones y otros sobre las puntillas, despacio y con control.', gentle: true },
  { id: 'tob-balanceo', name: 'Balanceo en cuclillas', zones: ['tobillos', 'caderas'], kind: 'dinamico', seconds: 40, sides: 1, how: 'En cuclillas, desplaza el peso de un lado a otro empujando la rodilla hacia fuera.', loads: ['rodilla'] },

  // ---- columna torácica ----
  { id: 'tor-rotacion', name: 'Rotación torácica a cuatro apoyos', zones: ['toracica'], kind: 'dinamico', seconds: 40, sides: 2, how: 'Una mano en la nuca; abre el codo hacia el techo siguiendo con la mirada y vuelve.', gentle: true },
  { id: 'tor-libro', name: 'Libro abierto', zones: ['toracica', 'hombros'], kind: 'dinamico', seconds: 40, sides: 2, how: 'Tumbado de lado con las rodillas dobladas; abre el brazo de arriba hacia atrás como la tapa de un libro.', gentle: true },
  { id: 'tor-rodillo', name: 'Extensión torácica sobre rodillo', zones: ['toracica'], kind: 'liberacion', seconds: 45, sides: 1, how: 'Rodillo bajo los omóplatos, manos en la nuca; deja caer la espalda sobre él y sube poco a poco.', equipment: 'rodillo', gentle: true },
  { id: 'tor-aguja', name: 'Aguja (thread the needle)', zones: ['toracica', 'hombros'], kind: 'estatico', seconds: 35, sides: 2, how: 'A cuatro apoyos, pasa un brazo por debajo del otro y apoya el hombro y la cabeza en el suelo.', loads: ['hombro'] },
  { id: 'tor-angeles', name: 'Ángeles en la pared', zones: ['toracica', 'hombros'], kind: 'activacion', seconds: 40, sides: 1, how: 'Espalda y brazos pegados a la pared; sube y baja los brazos sin despegar nada.', loads: ['hombro'] },

  // ---- hombros ----
  { id: 'hom-palo', name: 'Pase de palo o banda', zones: ['hombros'], kind: 'dinamico', seconds: 40, sides: 1, how: 'Con agarre ancho y brazos rectos, pasa el palo de delante a detrás sin doblar los codos.', equipment: 'palo o banda', loads: ['hombro'] },
  { id: 'hom-colgarse', name: 'Colgarse de la barra', zones: ['hombros'], kind: 'estatico', seconds: 30, sides: 1, how: 'Cuelga con los brazos estirados y deja que los hombros se estiren; sin balanceos.', equipment: 'barra', loads: ['hombro', 'codo-muneca'] },
  { id: 'hom-dorsal', name: 'Dorsal en la pared', zones: ['hombros', 'toracica'], kind: 'estatico', seconds: 35, sides: 2, how: 'Mano en la pared a la altura de la cabeza, aleja la cadera y baja el pecho hacia el suelo.', loads: ['hombro'] },
  { id: 'hom-pecho', name: 'Pecho en el marco de la puerta', zones: ['hombros'], kind: 'estatico', seconds: 35, sides: 2, how: 'Antebrazo en el marco; da medio paso adelante hasta notar el pecho, sin forzar.', gentle: true },
  { id: 'hom-rotext', name: 'Rotación externa con banda', zones: ['hombros'], kind: 'activacion', seconds: 40, sides: 2, how: 'Codo pegado al costado a 90°, abre el antebrazo hacia fuera contra la banda y vuelve despacio.', equipment: 'banda', gentle: true },
  { id: 'hom-circulos', name: 'Círculos de brazos', zones: ['hombros'], kind: 'dinamico', seconds: 30, sides: 1, how: 'Círculos amplios y suaves hacia delante y hacia atrás, aumentando poco a poco.', gentle: true },
  { id: 'hom-escapulas', name: 'Deslizamientos escapulares en pared', zones: ['hombros', 'toracica'], kind: 'activacion', seconds: 40, sides: 1, how: 'Antebrazos en la pared; empuja y deja que los omóplatos se abran y se cierren sin encoger los hombros.', gentle: true },
  { id: 'hom-triceps', name: 'Tríceps por encima de la cabeza', zones: ['hombros', 'munecas'], kind: 'estatico', seconds: 30, sides: 2, how: 'Codo doblado detrás de la cabeza; con la otra mano empuja suavemente el codo hacia atrás.', gentle: true },

  // ---- muñecas y codos ----
  { id: 'mun-circulos', name: 'Círculos de muñeca', zones: ['munecas'], kind: 'dinamico', seconds: 30, sides: 1, how: 'Con los dedos entrelazados o a cuatro apoyos, dibuja círculos lentos en los dos sentidos.', gentle: true },
  { id: 'mun-flexores', name: 'Flexores del antebrazo', zones: ['munecas'], kind: 'estatico', seconds: 30, sides: 2, how: 'Brazo estirado con la palma al techo; con la otra mano tira de los dedos hacia ti.', gentle: true },
  { id: 'mun-extensores', name: 'Extensores del antebrazo', zones: ['munecas'], kind: 'estatico', seconds: 30, sides: 2, how: 'Brazo estirado con la palma hacia abajo; con la otra mano baja suavemente el dorso de la mano.', gentle: true },
  { id: 'mun-balanceo', name: 'Balanceos de muñeca a cuatro apoyos', zones: ['munecas'], kind: 'dinamico', seconds: 40, sides: 1, how: 'Con las manos en el suelo, balancea el peso adelante y atrás sin levantar las palmas.', loads: ['codo-muneca'] },
  { id: 'mun-rack', name: 'Muñeca para el rack frontal', zones: ['munecas', 'hombros'], kind: 'estatico', seconds: 30, sides: 2, how: 'Codo alto y dedos bajo la barra imaginaria; mantén la muñeca extendida sin dolor.', loads: ['codo-muneca'] },

  // ---- cuello ----
  { id: 'cue-lateral', name: 'Inclinación lateral del cuello', zones: ['cuello'], kind: 'estatico', seconds: 25, sides: 2, how: 'Sentado, deja caer la oreja hacia el hombro sin subirlo; la mano solo acompaña, no tira.', gentle: true },
  { id: 'cue-giros', name: 'Giros lentos de cuello', zones: ['cuello'], kind: 'dinamico', seconds: 30, sides: 1, how: 'Gira la cabeza a un lado y a otro despacio, dentro de un rango cómodo.', gentle: true },
  { id: 'cue-barbilla', name: 'Retracción de barbilla', zones: ['cuello', 'toracica'], kind: 'activacion', seconds: 30, sides: 1, how: 'Lleva la barbilla hacia atrás como para hacerte papada, sin inclinar la cabeza, y suelta.', gentle: true },
  { id: 'cue-trapecio', name: 'Trapecio superior', zones: ['cuello', 'hombros'], kind: 'estatico', seconds: 30, sides: 2, how: 'Sentado agarrando el asiento con una mano, inclina la cabeza hacia el lado contrario y gira la nariz hacia abajo.', gentle: true },
];

const BY_ID = new Map(MOBILITY_LIBRARY.map((e) => [e.id, e]));

export function getMobilityExercise(id: string): MobilityExercise | undefined {
  return BY_ID.get(id);
}

/** Enlace de búsqueda de vídeos del ejercicio. Una búsqueda no caduca como un vídeo concreto. */
export function mobilityVideoUrl(exercise: Pick<MobilityExercise, 'name'>): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} movilidad ejercicio`)}`;
}
