/**
 * «Pregúntale a Rex»: la caja de texto del lab de Rex. Lee lo que escribes con reglas sencillas (sin IA externa: si no lo entiende, lo
 * dice y da ejemplos) y lo convierte en una intención: apuntar el peso, apuntar una comida, contar qué toca un día, decir cómo estás
 * o abrir un módulo. Aquí solo está la lectura y las frases de respuesta; quien lo usa (el Dashboard) hace lo que toque.
 * Pura: sin React, sin reloj propio y sin almacenamiento.
 */
import type { RexAction, RexTarget } from './rexDashboard';
import { findLoadReps, findMarkKg, findMarkLift, type MarkLift } from './rexMarks';
import type { DataQuestion, WhyAbout } from './rexData';
import type { AdaptRequest } from '../../lib/sessionAdapt';
import type { PartKey } from '../../engine/sessionParts';

export type AskIntent =
  | { kind: 'peso'; kg: number }
  /** «He comido…»: la frase entera pasa a Nutrición para que Rex la lea allí. */
  | { kind: 'comida'; text: string }
  /** ¿Qué toca ese día? `offset` en días desde hoy (0 = hoy). */
  | { kind: 'dia'; offset: number; label: string }
  | { kind: 'estado' }
  /** Nutrición: lo que falta del día. */
  | { kind: 'falta' }
  /** Imprevistos de Planificación: me duele algo (con la zona si la dices), hoy no estoy para el plan, voy a faltar unos días, otro WOD. */
  | { kind: 'dolor'; zone: 'hombro' | 'cadera-lumbar' | 'rodilla' | 'codo-muneca' | null }
  | { kind: 'no-plan' }
  | { kind: 'faltar'; days: number | null }
  | { kind: 'otro-wod' }
  /** El programa de fuerza que convive con el macro: aplazarlo, saltarlo, pausarlo o hacerlo hoy. */
  | { kind: 'programa'; action: 'aplazar' | 'saltar' | 'pausar' | 'hacer'; days: number | null }
  /** Crear algo con Rex (objetivo, macro, programa, temporada): abre el asistente. */
  | { kind: 'crear'; what: 'objetivo' | 'macro' | 'programa' | 'temporada' }
  | { kind: 'modulo'; target: RexTarget }
  /** Marcas (PR): ver una o todas, apuntar una (`kg` null = falta decirlo; `confirmed` = ya dijo que sí) o estimar el 1RM de una serie («100 x 3»). */
  | { kind: 'marca-ver'; lift: MarkLift | null; /** true: abrir la pantalla «Mis marcas» (todas, o desplegada en ese levantamiento); false: contestar en una línea. */ open: boolean }
  | { kind: 'marca-apuntar'; lift: MarkLift | null; kg: number | null; confirmed: boolean }
  | { kind: 'marca-estimar'; lift: MarkLift; loadKg: number; reps: number }
  /** Cambiar la sesión de hoy hablando («tengo 30 minutos», «sin accesorio», «solo fuerza»); `confirmed` = ya dijo que sí al resumen. */
  | { kind: 'adaptar'; request: AdaptRequest; confirmed: boolean }
  | { kind: 'adaptar-deshacer' }
  /** «Acortar la sesión», «tengo poco tiempo» sin decir cuánto: Rex pregunta cuánto con botones. */
  | { kind: 'adaptar-ayuda' }
  /** Mover o intercambiar sesiones de la semana: días como desplazamiento desde hoy (0 = hoy); `to` null = que Rex elija el hueco. */
  | { kind: 'mover'; from: number; to: number | null; confirmed: boolean; /** `insertar`: la sesión pasa al destino y las de entre medias se corren (en vez de intercambiar). */ mode?: 'insertar' }
  /** «Desplaza la semana desde mañana»: cada sesión pasa al día siguiente hasta que un descanso lo absorba. */
  | { kind: 'desplazar'; from: number; confirmed: boolean }
  /** Deshacer el último cambio de la semana. */
  | { kind: 'mover-deshacer' }
  /** «Mover la sesión» sin decir a qué día: Rex ofrece los días posibles con botones. */
  | { kind: 'mover-ayuda' }
  /** Preguntas sobre tus datos: último levantamiento, última marca, racha, sesiones, duración de hoy, peso actual. */
  | { kind: 'dato'; question: DataQuestion }
  /** «¿Por qué este peso / este WOD / hoy así?». */
  | { kind: 'por-que'; about: WhyAbout }
  | { kind: 'ayuda' };

export interface AskAnswer {
  lead: string;
  tone: 'good' | 'mid' | 'bad' | 'info' | 'gold';
  text: string;
  actions: RexAction[];
}

/** Minúsculas, sin acentos y con los espacios normalizados. */
export function normalizeAsk(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEKDAY_LABEL = ['el domingo', 'el lunes', 'el martes', 'el miércoles', 'el jueves', 'el viernes', 'el sábado'];

const MEAL_START = /^(?:apunta(?:me)?(?: que)? |anota(?:me)?(?: que)? |registra(?: que)? |oye rex )?(?:he |me he |acabo de |hoy he |hoy )?(?:comido|cenado|desayunado|almorzado|merendado|tomado|picado|comi|cene|desayune|almorce|meriende|tome)\b/;

/** Un peso corporal razonable en kilos, escrito «82,4», «82.4» o «82». */
function findWeight(norm: string): number | null {
  const m = norm.match(/(?:^|[^\d.,])(\d{2,3})(?:[.,](\d{1,2}))?(?!\d)/);
  if (!m) return null;
  const kg = Number(`${m[1]}${m[2] ? `.${m[2]}` : ''}`);
  return kg >= 30 && kg <= 250 ? kg : null;
}

const MODULE_WORDS: { target: RexTarget; words: RegExp }[] = [
  { target: 'checkin', words: /\b(check ?-?in|como he amanecido|como amanezco)\b/ },
  { target: 'movilidad', words: /\b(recovery|movilidad|estiramientos?|estirar|rodillo|foam)\b/ },
  { target: 'nutricion', words: /\b(nutricion|dieta|macros|proteina)\b/ },
  { target: 'constancia', words: /\b(constancia|racha|calendario)\b/ },
  { target: 'volumen', words: /\b(volumen)\b/ },
  { target: 'analisis', words: /\b(analisis|progreso|progresion|records?|prs?|estadisticas)\b/ },
  { target: 'forma', words: /\b(tu forma|supercompensacion|fatiga|forma fisica)\b/ },
  { target: 'perfil', words: /\b(perfil|diagnostico|puntos debiles)\b/ },
  { target: 'objetivos', words: /\b(objetivos?|macrociclo|macro|programas?|rampa|temporada)\b/ },
  { target: 'semana', words: /\b(revision semanal|mi semana|tu semana|resumen semanal)\b/ },
  { target: 'planificacion', words: /\b(planificacion|plan de hoy|la sesion|mi sesion|entrenar ya|empezar)\b/ },
];

/** Cómo se llama cada parte de la sesión al hablar. «wod» son las dos piezas de un día de doble WOD. */
const PART_WORDS: [RegExp, PartKey[]][] = [
  [/\b(accesorios?|core|abdominales)\b/, ['accessory']],
  [/\b(tecnica|skill|skills|gimnasticos?)\b/, ['skill']],
  [/\b(oly|olimpico|olimpicos|halterofilia|halterofilico)\b/, ['oly']],
  [/\b(wod|wods|metcon|metcones|acondicionamiento)\b/, ['wod1', 'wod2']],
  [/\bfuerza\b/, ['strength']],
];

/** Las partes de la sesión que se nombran en la frase, sin repetir y en el orden en que aparecen las palabras. */
export function findSessionParts(norm: string): PartKey[] {
  const out: PartKey[] = [];
  for (const [re, keys] of PART_WORDS) if (re.test(norm)) for (const k of keys) if (!out.includes(k)) out.push(k);
  return out;
}

/** Los minutos que se dicen: «30 minutos», «45 min», «media hora», «una hora», «1h30», «hora y media». null si no hay. */
export function findMinutes(norm: string): number | null {
  if (/\bmedia hora\b/.test(norm)) return 30;
  if (/\bhora y media\b/.test(norm)) return 90;
  const h = norm.match(/\b(\d)\s*(?:horas?\b|h(?=\d|\s|$))\s*(?:y\s*)?(\d{1,2})?(?!\d)/);
  if (h) return Number(h[1]) * 60 + Number(h[2] ?? 0);
  if (/\b(una|1) hora\b/.test(norm)) return 60;
  if (/\bdos horas\b/.test(norm)) return 120;
  const m = norm.match(/\b(\d{1,3})\s*(?:min|mins|minutos)\b/);
  if (m) {
    const n = Number(m[1]);
    return n >= 10 && n <= 180 ? n : null;
  }
  return null;
}

/** «Cambiar la sesión» por frase: minutos, quitar una parte o quedarse solo con una. null si no va de eso. */
function parseAdaptAsk(norm: string): AskIntent | null {
  // El botón «Sí, aplicar» de Rex: «confirmo cambio minutos 30», «confirmo cambio sin accesorio», «confirmo cambio solo fuerza wod».
  const conf = norm.match(/^confirmo cambio (minutos|sin|solo) (.+)$/);
  if (conf) {
    if (conf[1] === 'minutos') {
      const n = Number(conf[2]);
      return Number.isFinite(n) ? { kind: 'adaptar', request: { how: 'minutos', minutes: n }, confirmed: true } : { kind: 'ayuda' };
    }
    const parts = findSessionParts(conf[2]);
    return parts.length > 0 ? { kind: 'adaptar', request: { how: conf[1] as 'sin' | 'solo', parts }, confirmed: true } : { kind: 'ayuda' };
  }
  if (/\b(deshaz|deshacer|deshazlo|vuelve a la sesion|como estaba|la de antes)\b/.test(norm) && /\b(cambio|sesion|antes|estaba)\b/.test(norm) && !/\b(semana|movimiento|reorden|desplazamiento)\b/.test(norm)) return { kind: 'adaptar-deshacer' };

  const parts = findSessionParts(norm);
  const minutes = findMinutes(norm);
  if (minutes === null && parts.length === 0 && /\b(acortar|acorta|acortala|recortar|recorta|mas corta|poco tiempo|sin tiempo|tengo prisa|voy justo|voy justa)\b/.test(norm)) return { kind: 'adaptar-ayuda' };
  // «Cuánto dura la sesión» es una pregunta, no un cambio.
  if (/\bcuanto (dura|tarda|me lleva|va a durar)\b/.test(norm)) return null;
  if (minutes !== null && /\b(tengo|solo|apenas|dispongo|queda|quedan|dura|durar|duracion|acorta|acortar|corta|cortar|menos de|maximo|como mucho|sesion de|entreno de|adapta|adaptala|ajusta|ajustala|que quepa|que dure)\b/.test(norm) && !(/\botro\b/.test(norm) && /\bwod\b/.test(norm))) {
    return { kind: 'adaptar', request: { how: 'minutos', minutes }, confirmed: false };
  }
  if (parts.length > 0) {
    // «Solo fuerza», «solo el wod y el accesorio» (sin que sea «solo tengo 30 minutos», que ya se ha leído).
    if (/\bsolo\b/.test(norm) && !/\bsolo tengo\b/.test(norm)) return { kind: 'adaptar', request: { how: 'solo', parts }, confirmed: false };
    if (/\b(sin|quita|quitame|quitar|elimina|eliminar|salta|saltate|saltar|omite|omitir|no quiero|no hagas|no me pongas|no pongas|prefiero no|hoy no hago|hoy sin|quitale)\b/.test(norm)) return { kind: 'adaptar', request: { how: 'sin', parts }, confirmed: false };
  }
  return null;
}

const DAY_WORDS = /\b(pasado manana|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g;
const JS_WEEKDAY = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MOVE_VERB = /\b(pasa|pasala|pasalo|pasame|pasarla|mueve|muevela|muevelo|mover|moverla|traslada|trasladala|aplaza|aplazala|aplazar|pospon|posponla|posponer|retrasa|retrasala|adelanta|adelantala)\b/;
const SWAP_VERB = /\b(intercambia|intercambiame|intercambiar|cambia|cambiame|cambiar)\b/;
const CANT = /\b(no puedo|no podre|no voy a poder|no me va bien|no me viene bien|no entreno|no voy a entrenar|me es imposible)\b/;

/** «Pasa la sesión de hoy al jueves», «mañana no puedo entrenar», «intercambia el miércoles y el jueves». null si no va de mover sesiones. */
function parseMoveAsk(norm: string, todayWeekday: number): AskIntent | null {
  const conf = norm.match(/^confirmo (?:mover|intercambiar) (-?\d+) (\d+)$/);
  if (conf) return { kind: 'mover', from: Number(conf[1]), to: Number(conf[2]), confirmed: true };
  const confInsert = norm.match(/^confirmo insertar (-?\d+) (\d+)$/);
  if (confInsert) return { kind: 'mover', from: Number(confInsert[1]), to: Number(confInsert[2]), confirmed: true, mode: 'insertar' };
  const confShift = norm.match(/^confirmo desplazar (-?\d+)$/);
  if (confShift) return { kind: 'desplazar', from: Number(confShift[1]), confirmed: true };
  // Deshacer el último cambio de la semana.
  if (/\b(deshaz|deshacer|deshazlo|revierte|revertir|anula|anular)\b/.test(norm) && /\b(semana|movimiento|reorden|desplazamiento|cambio de dias)\b/.test(norm)) return { kind: 'mover-deshacer' };
  if (/\bwod\b/.test(norm)) return null;

  const found = [...norm.matchAll(DAY_WORDS)].map((m) => ({ word: m[1], start: m.index ?? 0 }));
  // «Desplaza la semana desde mañana»: todo un día más tarde hasta que un descanso lo absorba (por defecto desde mañana).
  if (/\b(desplaza|desplazar|desplazame|corre|correr|empuja|retrasa|retrasar|atrasa|atrasar)\b/.test(norm) && /\b(semana|todo|todas|sesiones|resto)\b/.test(norm) && found.length <= 1) {
    const w = found[0]?.word;
    const off = w === undefined ? 1 : w === 'hoy' ? 0 : w === 'manana' ? 1 : w === 'pasado manana' ? 2 : (JS_WEEKDAY.indexOf(w) - todayWeekday + 7) % 7;
    return { kind: 'desplazar', from: off, confirmed: false };
  }
  // «Inserta el martes en el viernes»: la sesión pasa al destino y las de entre medias se corren.
  if (found.length === 2 && /\b(inserta|insertar|intercala|intercalar)\b/.test(norm)) {
    const off = (w: string) => (w === 'hoy' ? 0 : w === 'manana' ? 1 : w === 'pasado manana' ? 2 : (JS_WEEKDAY.indexOf(w) - todayWeekday + 7) % 7);
    return { kind: 'mover', from: off(found[0].word), to: off(found[1].word) || 7, confirmed: false, mode: 'insertar' };
  }
  // «Mover la sesión» sin decir a qué día: Rex pregunta con botones.
  if (found.length === 0 && (/\b(mover|mueve|moverla|muevela|pasar|pasala|cambiarla de dia|cambiar de dia)\b.*\b(sesion|entreno|entrenamiento)\b|\b(otro dia|cambiar de dia|cambiarla de dia)\b/.test(norm) || /\bmover (la )?sesion\b/.test(norm))) return { kind: 'mover-ayuda' };
  if (found.length === 0 || found.length > 2) return null;
  const offsetOf = (word: string, asTarget: boolean): number => {
    if (word === 'hoy') return 0;
    if (word === 'manana') return 1;
    if (word === 'pasado manana') return 2;
    const diff = (JS_WEEKDAY.indexOf(word) - todayWeekday + 7) % 7;
    return diff === 0 ? (asTarget ? 7 : 0) : diff;
  };
  // Un día precedido por «a / al / para / hasta» es el destino; el resto, el origen.
  const roleOf = (start: number) => (/\b(a|al|para|hasta|hacia)\s+(el\s+|la\s+)?$/.test(norm.slice(Math.max(0, start - 16), start)) ? 'to' : 'from');
  const days = found.map((f) => ({ ...f, role: roleOf(f.start) as 'to' | 'from' }));

  // Intercambiar: dos días y un verbo de cambiar.
  if (days.length === 2 && SWAP_VERB.test(norm) && days.every((d) => d.role === 'from' || d.word !== 'hoy')) {
    return { kind: 'mover', from: offsetOf(days[0].word, false), to: offsetOf(days[1].word, true), confirmed: false };
  }
  if (MOVE_VERB.test(norm)) {
    const origin = days.find((d) => d.role === 'from');
    const target = days.find((d) => d.role === 'to');
    if (origin && target) return { kind: 'mover', from: offsetOf(origin.word, false), to: offsetOf(target.word, true), confirmed: false };
    if (target) return { kind: 'mover', from: 0, to: offsetOf(target.word, true), confirmed: false };
    if (origin) return { kind: 'mover', from: offsetOf(origin.word, false), to: null, confirmed: false };
  }
  // «Mañana no puedo entrenar»: el día elegido (nunca hoy, que ya tiene su camino con «hoy no estoy para el plan»).
  if (CANT.test(norm) && days.length === 1 && days[0].word !== 'hoy') return { kind: 'mover', from: offsetOf(days[0].word, false), to: null, confirmed: false };
  return null;
}

/** «¿Por qué…?»: del peso, del WOD o de la sesión de hoy. null si no empieza por «por qué» o no se sabe de qué. */
function parseWhyAsk(norm: string): AskIntent | null {
  if (!/^(y |pero )?por ?que\b/.test(norm)) return null;
  if (/\b(peso|kilos|kg|carga|pesa|tanto)\b/.test(norm)) return { kind: 'por-que', about: 'peso' };
  if (/\b(wod|metcon)\b/.test(norm)) return { kind: 'por-que', about: 'wod' };
  if (/\b(hoy|sesion|entreno|entrenamiento|toca|asi|descanso|recovery|me pone|me manda|esta)\b/.test(norm)) return { kind: 'por-que', about: 'sesion' };
  return null;
}

/** Preguntas sobre tus datos. null si la frase no es una. */
function parseDataAsk(norm: string): AskIntent | null {
  const lift = findMarkLift(norm);
  if (lift && /\b(ultimo|ultima|cuando)\b/.test(norm)) {
    return { kind: 'dato', question: { what: /\b(test|probe|marca|pr|record|max|maximo)\b/.test(norm) ? 'ultimo-test' : 'ultimo-levantamiento', lift } };
  }
  if (/\b(racha|seguidos|consecutivos|sin fallar)\b/.test(norm)) return { kind: 'dato', question: { what: 'racha' } };
  if (/\bcuantas? (sesiones|entrenos|entrenamientos|dias)\b/.test(norm) && /\b(llevo|he hecho|hecho|entrenado|esta semana|este mes|van|hay)\b/.test(norm)) return { kind: 'dato', question: { what: 'sesiones' } };
  if (/\bcuanto (dura|tarda|me lleva|va a durar|durara)\b/.test(norm) || /\bduracion de (hoy|la sesion)\b/.test(norm)) return { kind: 'dato', question: { what: 'duracion' } };
  if (/\b(cuanto peso|cual es mi peso|mi peso actual|que peso tengo|cuanto pesaba)\b/.test(norm) && findWeight(norm) === null) return { kind: 'dato', question: { what: 'peso-actual' } };
  return null;
}

/** Las frases de marcas. null si la frase no va de marcas. */
function parseMarkAsk(norm: string): AskIntent | null {
  const lift = findMarkLift(norm);
  const kg = findMarkKg(norm);

  // El botón «Sí, apuntar» de Rex: «confirmo marca Back Squat 140».
  if (/^confirmo marca\b/.test(norm)) return lift && kg !== null ? { kind: 'marca-apuntar', lift, kg, confirmed: true } : { kind: 'ayuda' };

  if (lift) {
    // «Mañana toca sentadilla», «quiero subir mi sentadilla», «me duele al hacer sentadilla»: un levantamiento en medio no es apuntar nada.
    if (/\b(toca|manana|quiero|duele|dolor|molestia|objetivo|programa|macro)\b/.test(norm) && !/\b(marca|pr|record|1rm)\b/.test(norm)) return null;
    const series = findLoadReps(norm);
    if (series) return { kind: 'marca-estimar', lift, loadKg: series.loadKg, reps: series.reps };
    if (kg !== null) return { kind: 'marca-apuntar', lift, kg, confirmed: false };
    if (/\b(apunta|apuntar|anota|anotar|registra|registrar|actualiza|actualizar|nueva|nuevo)\b/.test(norm) && /\b(marca|pr|record|1rm|maximo)\b/.test(norm)) return { kind: 'marca-apuntar', lift, kg: null, confirmed: false };
    if (/\b(grafica|evolucion)\b/.test(norm)) return { kind: 'marca-ver', lift, open: true };
    if (/\b(marca|marcas|pr|prs|record|records|maximo|1rm|levanto|levantas|tengo)\b/.test(norm)) return { kind: 'marca-ver', lift, open: false };
    return null;
  }

  if (/\b(apunta|apuntar|anota|anotar|registra|registrar|actualiza|actualizar|nueva|nuevo)\b.*\b(marca|pr|record|1rm)\b/.test(norm)) return { kind: 'marca-apuntar', lift: null, kg: null, confirmed: false };
  if (/\b(mis|todas mis|tus) (marcas?|records?|prs?|maximos|1rm)\b|\bmi (marca|pr|record)\b/.test(norm)) return { kind: 'marca-ver', lift: null, open: true };
  return null;
}

// ---------- Faltas de escritura ----------

/** Las palabras que Rex entiende y que merece la pena corregir si se escriben con una falta («sentadila», «manna», «entrnar»). Ya sin acentos. */
const VOCAB = [
  'sentadilla', 'sentadillas', 'entreno', 'entrenamiento', 'entrenar', 'manana', 'proteina', 'hidratos', 'accesorio', 'accesorios', 'tecnica', 'halterofilia',
  'marcas', 'marca', 'records', 'racha', 'sesion', 'sesiones', 'minutos', 'cuanto', 'cuantas', 'cuantos', 'ultimo', 'ultima', 'cuando', 'apunta', 'quita',
  'duele', 'hombro', 'rodilla', 'lumbar', 'espalda', 'muneca', 'recovery', 'movilidad', 'estiramientos', 'constancia', 'objetivos', 'macrociclo',
  'perfil', 'analisis', 'semana', 'snatch', 'deadlift', 'clean', 'banca', 'squat', 'arrancada', 'cargada', 'envion', 'fuerza', 'acortar', 'deshaz', 'muestrame',
  'ensename', 'cuentame', 'dime', 'levanto', 'programa', 'temporada',
];
// No se incluyen palabras de uso común que otra palabra normal podría «corregir» sin querer: tengo/estoy (estas), falta (fatal), comido (comida), etc.
const VOCAB_SET = new Set(VOCAB);

/** Distancia de edición (sustituir, borrar, añadir, o intercambiar dos letras seguidas, cada cosa cuenta 1). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Corrige las palabras que casi coinciden con una de `VOCAB` (una falta en palabras cortas, dos en largas), solo si hay una única candidata.
 * No toca números, palabras de menos de 5 letras ni las que son una palabra conocida más larga o más corta («semanal» no pasa a «semana»).
 */
export function fixTypos(norm: string): string {
  return norm
    .split(' ')
    .map((tok) => {
      if (tok.length < 5 || VOCAB_SET.has(tok) || /\d/.test(tok)) return tok;
      const max = tok.length >= 9 ? 2 : 1;
      // Una palabra que solo es otra con letras de más o de menos al final («semanal», «proteinas») es otra palabra, no una falta; una letra final repetida («rachaa») sí.
      const isExtension = (v: string) => (tok.startsWith(v) && tok !== v + v[v.length - 1]) || v.startsWith(tok);
      const near = VOCAB.filter((v) => Math.abs(v.length - tok.length) <= max && !isExtension(v) && editDistance(tok, v) <= max);
      const best = near.length > 0 ? Math.min(...near.map((v) => editDistance(tok, v))) : null;
      const winners = best === null ? [] : near.filter((v) => editDistance(tok, v) === best);
      if (winners.length === 1) return winners[0];
      // «marca» y «marcas» a la vez: da igual cuál (se leen igual); con dos palabras distintas, mejor no tocar.
      const shortest = [...winners].sort((a, b) => a.length - b.length)[0];
      return winners.length > 1 && winners.every((w) => w.startsWith(shortest)) ? shortest : tok;
    })
    .join(' ');
}

// ---------- Varias cosas en una frase ----------

/** Las respuestas que se pueden dar seguidas sin pedir nada: leer algo o apuntar el peso. Con algo que pide confirmar o abre otra pantalla no se junta. */
const COMBINABLE = new Set<AskIntent['kind']>(['peso', 'dia', 'estado', 'falta', 'dato', 'por-que']);

/**
 * «Apunta 82,4 kg y dime qué toca mañana»: si la frase trae varias peticiones y todas se pueden contestar seguidas, las devuelve por separado. null si es una
 * sola, si alguna no se entiende, si alguna pide confirmar o abrir otra pantalla, o si es una comida («arroz y pollo» no son dos cosas).
 */
export function splitAsk(text: string, todayWeekday: number): string[] | null {
  const norm = normalizeAsk(text);
  if (parseAsk(text, todayWeekday).kind === 'comida') return null;
  const parts = norm
    .split(/,\s+(?=[a-z])|\.\s+(?=[a-z])|\s+(?:y luego|y despues|y ademas|y tambien|luego|despues|ademas|tambien|y|e)\s+(?=(?:dime|apunta|anota|ensename|cuentame|muestrame|cual|cuanto|cuantas|cuantos|que|como|por ?que)\b)/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length < 2) return null;
  const kinds = parts.map((p) => parseAsk(p, todayWeekday));
  const ok = kinds.every((k) => COMBINABLE.has(k.kind) || (k.kind === 'marca-ver' && !k.open));
  return ok ? parts : null;
}

/** Lee lo que se ha escrito. La primera regla que encaja gana: peso, comida, día, estado, módulo; si no, ayuda. */
export function parseAsk(text: string, todayWeekday: number): AskIntent {
  const norm = fixTypos(normalizeAsk(text));
  if (norm === '') return { kind: 'ayuda' };

  if (MEAL_START.test(norm)) return { kind: 'comida', text: text.trim() };

  // Marcas: antes que el peso («mi back squat es 140 kg» no es tu peso corporal) y que los módulos («records» abre el Análisis).
  const mark = parseMarkAsk(norm);
  if (mark) return mark;

  // «¿Por qué 85 kg?» no es tu peso corporal: se lee antes que el peso.
  const why = parseWhyAsk(norm);
  if (why) return why;

  const weight = findWeight(norm);
  if (weight !== null && /\b(kg|kgs|kilos?|peso|pese|pesado|pesa|pesar|bascula)\b/.test(norm)) return { kind: 'peso', kg: weight };

  // El programa de fuerza: hay que nombrarlo y decir qué hacer con él.
  if (/\b(programa|texas)\b/.test(norm)) {
    const days = Number(norm.match(/(\d+) dias?/)?.[1] ?? (/\buna semana\b/.test(norm) ? 7 : NaN));
    const d = Number.isFinite(days) ? days : null;
    if (/\b(pausa|pausar|pausalo|para el programa|detener)\b/.test(norm)) return { kind: 'programa', action: 'pausar', days: d };
    if (/\b(salta|saltar|saltate|sin hacer)\b/.test(norm)) return { kind: 'programa', action: 'saltar', days: null };
    if (/\b(aplaza|aplazar|aplazalo|hoy no|mas tarde|manana)\b/.test(norm)) return { kind: 'programa', action: 'aplazar', days: null };
    if (/\b(hazla|hacerla|hacerlo|hago|hacemos|empezar|empieza)\b/.test(norm)) return { kind: 'programa', action: 'hacer', days: null };
  }

  // Imprevistos (antes que «qué toca», que también lee «entreno»).
  if (/\b(me duele|dolor|molestia|lesion|lesionado|lesionada|tirón|tiron)\b/.test(norm)) {
    const zone = /\brodilla\b/.test(norm) ? 'rodilla' : /\b(hombro)\b/.test(norm) ? 'hombro' : /\b(lumbar|espalda|cadera)\b/.test(norm) ? 'cadera-lumbar' : /\b(codo|muneca)\b/.test(norm) ? 'codo-muneca' : null;
    return { kind: 'dolor', zone };
  }
  // Cambiar la sesión de hoy: minutos, sin una parte, solo una parte (antes de «hoy no entreno», que también lee «no hago»).
  const adapt = parseAdaptAsk(norm);
  if (adapt) return adapt;
  const move = parseMoveAsk(norm, todayWeekday);
  if (move) return move;
  const data = parseDataAsk(norm);
  if (data) return data;
  if (/\b(voy a faltar|no voy a (poder )?entrenar|me voy de (viaje|vacaciones)|estare fuera|de viaje)\b/.test(norm)) {
    const n = Number(norm.match(/(\d+) dias?/)?.[1] ?? (/\buna semana\b/.test(norm) ? 7 : NaN));
    return { kind: 'faltar', days: Number.isFinite(n) ? n : null };
  }
  if (/\b(otro|cambia|cambiar|cambiame)\b.*\bwod\b/.test(norm)) return { kind: 'otro-wod' };
  if (/\b(no estoy para|no me encuentro|hoy no (entreno|quiero|puedo|hago)|estoy (cansad[oa]|fundid[oa]|roto|rota|mal)|no tengo ganas)\b/.test(norm)) return { kind: 'no-plan' };

  // Nutrición.
  if (/\b(que|cuanto|cuantos|cuanta|cuantas)\b.*\bfaltan?\b|\bme falta(n)?\b/.test(norm)) return { kind: 'falta' };

  if (/\b(que|cual)\b.*\b(toca|hay|entreno|entrenamiento|sesion|wod|plan|programado)\b|\b(toca|entreno)\b/.test(norm) || /^(y )?(hoy|manana|pasado manana)$/.test(norm)) {
    if (/\bpasado manana\b/.test(norm)) return { kind: 'dia', offset: 2, label: 'pasado mañana' };
    if (/\bmanana\b/.test(norm)) return { kind: 'dia', offset: 1, label: 'mañana' };
    const day = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(norm));
    if (day >= 0) {
      const offset = (day - todayWeekday + 7) % 7;
      return { kind: 'dia', offset, label: offset === 0 ? 'hoy' : WEEKDAY_LABEL[day] };
    }
    return { kind: 'dia', offset: 0, label: 'hoy' };
  }

  if (/\b(como|que tal)\b.*\b(estoy|voy|ando|llevo|vengo)\b|\b(mi estado|mi preparacion|estoy listo|estoy para)\b/.test(norm)) return { kind: 'estado' };

  // Crear con Rex: «crea un macro», «quiero subir mi sentadilla», «nueva temporada».
  if (/\b(crea|crear|nuevo|nueva|monta|montame|prepara|preparame|quiero un|quiero una)\b.*\b(macro|macrociclo|objetivo|programa|temporada)\b/.test(norm)) {
    const what = /\btemporada\b/.test(norm) ? 'temporada' : /\bprograma\b/.test(norm) ? 'programa' : /\b(macro|macrociclo)\b/.test(norm) ? 'macro' : 'objetivo';
    return { kind: 'crear', what };
  }
  if (/\bquiero (subir|mejorar|llegar|conseguir|aprender)\b/.test(norm)) return { kind: 'crear', what: 'objetivo' };

  const hit = MODULE_WORDS.find((m) => m.words.test(norm));
  if (hit) return { kind: 'modulo', target: hit.target };
  if (/\b(peso|pesarme|pesar)\b/.test(norm)) return { kind: 'modulo', target: 'peso' };

  return { kind: 'ayuda' };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La respuesta al apuntar el peso: lo apuntado y cómo cambia frente al último registro. */
export function weightAnswer(kg: number, previous: { kg: number; daysAgo: number } | null): AskAnswer {
  const base: AskAnswer = { lead: 'Apuntado.', tone: 'good', text: `${fmt(kg)} kg de hoy.`, actions: [{ label: 'Ver el peso', target: 'peso' }] };
  if (!previous) return { ...base, text: `${base.text} Es tu primer registro.` };
  const diff = Math.round((kg - previous.kg) * 10) / 10;
  if (previous.daysAgo <= 0) return { ...base, text: `${base.text} Sustituye al que habías apuntado hoy (${fmt(previous.kg)} kg).` };
  const when = previous.daysAgo === 1 ? 'ayer' : `hace ${previous.daysAgo} días`;
  const change = diff === 0 ? 'Igual que' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} kg frente a`;
  return { ...base, text: `${base.text} ${change} ${fmt(previous.kg)} kg (${when}).` };
}

/** Lo que se sabe de un día para contar qué toca: lo calcula quien usa esto con el motor de sesiones. */
export type DayInfo =
  | { kind: 'hecho'; strain: number | null }
  | { kind: 'descanso'; chosen: boolean }
  | { kind: 'competicion' }
  | { kind: 'sin-plan' }
  | { kind: 'sesion'; line: string; strain: number | null; minutes: number | null };

/** La respuesta a «¿qué toca…?». `label` es «hoy», «mañana», «el viernes»…; el cuerpo lo escribe cada caso. */
export function dayAnswer(label: string, info: DayInfo): AskAnswer {
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  const plan: RexAction[] = [{ label: 'Ver Planificación', target: 'planificacion' }];
  switch (info.kind) {
    case 'hecho':
      return { lead: 'Ya entrenaste hoy.', tone: 'good', text: info.strain !== null ? `Cerraste con un esfuerzo de ${info.strain}.` : 'Está apuntado.', actions: [{ label: 'Ver el día', target: 'detalle-dia' }] };
    case 'descanso':
      return { lead: `${cap}: descanso.`, tone: 'info', text: info.chosen ? 'Lo marcaste tú como día de descanso.' : 'No hay sesión programada. Aprovecha para recuperar.', actions: [{ label: 'Hacer recovery', target: 'movilidad' }] };
    case 'competicion':
      return { lead: `${cap} compites.`, tone: 'gold', text: 'Calienta como un WOD y dosifica desde la primera prueba.', actions: plan };
    case 'sin-plan':
      return { lead: 'Nada programado.', tone: 'mid', text: `No tengo sesión para ${label}: no hay macrociclo ni programa activo ese día.`, actions: [{ label: 'Ver objetivos', target: 'objetivos' }] };
    case 'sesion': {
      const extra = [info.minutes ? `unos ${info.minutes} min` : null, info.strain !== null ? `esfuerzo previsto ~${info.strain}` : null].filter(Boolean).join(', ');
      const text = `${info.line}${extra ? ` (${extra})` : ''}.${label === 'hoy' ? '' : ' Es lo previsto hoy: puede cambiar con tu check-in y cómo llegues.'}`;
      return { lead: `${cap} toca:`, tone: 'info', text, actions: plan };
    }
  }
}

/** Cuando Rex no entiende lo escrito: lo dice y enseña ejemplos que sí entiende. */
export function helpAnswer(): AskAnswer {
  return {
    lead: 'No te he entendido.',
    tone: 'mid',
    text: 'Prueba con «¿qué toca mañana?», «tengo 30 minutos», «mi back squat es 140», «¿por qué este peso?», «apunta 82,4 kg», «he comido dos huevos y arroz», «¿cómo estoy?» o el nombre de un módulo (nutrición, recovery, objetivos…).',
    actions: [],
  };
}

/** Frases de ejemplo que se ofrecen como atajos bajo la caja. */
export const ASK_EXAMPLES = ['¿Qué toca mañana?', '¿Cómo estoy?', 'Apunta mi peso', 'He comido…'] as const;

/** Lo que falta del día en comida, con un botón a «He comido…». */
export function missingAnswer(missing: { protein: number; carbs: number }): AskAnswer {
  if (missing.protein <= 0 && missing.carbs <= 0) return { lead: 'Día cubierto.', tone: 'good', text: 'Ya llevas lo que te toca de proteína e hidratos.', actions: [] };
  const parts = [missing.protein > 0 ? `${Math.round(missing.protein)} g de proteína` : null, missing.carbs > 0 ? `${Math.round(missing.carbs)} g de hidratos` : null].filter(Boolean);
  return { lead: 'Te falta:', tone: 'info', text: `${parts.join(' y ')}.`, actions: [] };
}

/** Una petición que esta pantalla no hace: dice dónde se hace y ofrece ir. */
export function elsewhereAnswer(what: string, target: 'ir-dashboard' | 'ir-planificacion' | 'ir-nutricion' | 'ir-objetivos'): AskAnswer {
  const label = target === 'ir-dashboard' ? 'Ir al Dashboard' : target === 'ir-planificacion' ? 'Ir a Planificación' : target === 'ir-nutricion' ? 'Ir a Nutrición' : 'Ir a Objetivos';
  return { lead: 'Eso se hace en otra pantalla.', tone: 'info', text: `${what}`, actions: [{ label, target }] };
}
