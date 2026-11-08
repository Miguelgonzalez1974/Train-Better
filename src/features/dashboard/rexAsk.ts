/**
 * «Pregúntale a Rex»: la caja de texto del lab de Rex. Lee lo que escribes con reglas sencillas (sin IA externa: si no lo entiende, lo
 * dice y da ejemplos) y lo convierte en una intención: apuntar el peso, apuntar una comida, contar qué toca un día, decir cómo estás
 * o abrir un módulo. Aquí solo está la lectura y las frases de respuesta; quien lo usa (el Dashboard) hace lo que toque.
 * Pura: sin React, sin reloj propio y sin almacenamiento.
 */
import type { RexAction, RexTarget } from './rexDashboard';

export type AskIntent =
  | { kind: 'peso'; kg: number }
  /** «He comido…»: la frase entera pasa a Nutrición para que Rex la lea allí. */
  | { kind: 'comida'; text: string }
  /** ¿Qué toca ese día? `offset` en días desde hoy (0 = hoy). */
  | { kind: 'dia'; offset: number; label: string }
  | { kind: 'estado' }
  /** Nutrición: lo que falta del día, y una idea de qué comer para cerrarlo. */
  | { kind: 'falta' }
  | { kind: 'cena' }
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

/** Lee lo que se ha escrito. La primera regla que encaja gana: peso, comida, día, estado, módulo; si no, ayuda. */
export function parseAsk(text: string, todayWeekday: number): AskIntent {
  const norm = normalizeAsk(text);
  if (norm === '') return { kind: 'ayuda' };

  if (MEAL_START.test(norm)) return { kind: 'comida', text: text.trim() };

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
  if (/\b(voy a faltar|no voy a (poder )?entrenar|me voy de (viaje|vacaciones)|estare fuera|de viaje)\b/.test(norm)) {
    const n = Number(norm.match(/(\d+) dias?/)?.[1] ?? (/\buna semana\b/.test(norm) ? 7 : NaN));
    return { kind: 'faltar', days: Number.isFinite(n) ? n : null };
  }
  if (/\b(otro|cambia|cambiar|cambiame)\b.*\bwod\b/.test(norm)) return { kind: 'otro-wod' };
  if (/\b(no estoy para|no me encuentro|hoy no (entreno|quiero|puedo|hago)|estoy (cansad[oa]|fundid[oa]|roto|rota|mal)|no tengo ganas)\b/.test(norm)) return { kind: 'no-plan' };

  // Nutrición.
  if (/\b(que|cuanto|cuantos|cuanta|cuantas)\b.*\bfaltan?\b|\bme falta(n)?\b/.test(norm)) return { kind: 'falta' };
  if (/\bque (ceno|cenar|como|comer|desayuno|desayunar|almuerzo|almorzar|meriendo|merendar|tomo|tomar)\b|\bidea(s)? de (cena|comida|almuerzo|desayuno|merienda)\b/.test(norm)) return { kind: 'cena' };

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
    text: 'Prueba con «¿qué toca mañana?», «apunta 82,4 kg», «he comido dos huevos y arroz», «¿cómo estoy?» o el nombre de un módulo (nutrición, recovery, objetivos…).',
    actions: [],
  };
}

/** Frases de ejemplo que se ofrecen como atajos bajo la caja. */
export const ASK_EXAMPLES = ['¿Qué toca mañana?', '¿Cómo estoy?', 'Apunta mi peso', 'He comido…'] as const;

/** Lo que falta del día en comida, con un botón a «He comido…». */
export function missingAnswer(missing: { protein: number; carbs: number }): AskAnswer {
  if (missing.protein <= 0 && missing.carbs <= 0) return { lead: 'Día cubierto.', tone: 'good', text: 'Ya llevas lo que te toca de proteína e hidratos.', actions: [] };
  const parts = [missing.protein > 0 ? `${Math.round(missing.protein)} g de proteína` : null, missing.carbs > 0 ? `${Math.round(missing.carbs)} g de hidratos` : null].filter(Boolean);
  return { lead: 'Te falta:', tone: 'info', text: `${parts.join(' y ')}.`, actions: [{ label: '¿Qué ceno?', target: 'nutri-cena', ask: '¿Qué ceno?' }] };
}

/** «¿Qué ceno?»: las ideas ya redactadas (hasta tres), o que no falta casi nada. */
export function dinnerAnswer(ideas: string[]): AskAnswer {
  if (ideas.length === 0) return { lead: 'No te falta casi nada.', tone: 'good', text: 'Con un poco de fruta o lo que te apetezca, cubierto.', actions: [] };
  return {
    lead: 'Para cerrar el día:',
    tone: 'info',
    text: ideas.map((idea, i) => `${i + 1}) ${idea}.`).join(' '),
    actions: [{ label: 'He comido…', target: 'nutri-comido' }],
  };
}

/** Una petición que esta pantalla no hace: dice dónde se hace y ofrece ir. */
export function elsewhereAnswer(what: string, target: 'ir-dashboard' | 'ir-planificacion' | 'ir-nutricion' | 'ir-objetivos'): AskAnswer {
  const label = target === 'ir-dashboard' ? 'Ir al Dashboard' : target === 'ir-planificacion' ? 'Ir a Planificación' : target === 'ir-nutricion' ? 'Ir a Nutrición' : 'Ir a Objetivos';
  return { lead: 'Eso se hace en otra pantalla.', tone: 'info', text: `${what}`, actions: [{ label, target }] };
}
