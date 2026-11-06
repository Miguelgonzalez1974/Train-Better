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
