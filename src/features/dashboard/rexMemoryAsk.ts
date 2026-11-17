import type { PainArea, RexNote } from '../../data/athlete/types';
import { describeNote, weekdayPlural, type NoteSelector } from '../../engine/rexNotes';
import { PAIN_AREA_LABEL, type PainFollowUp } from '../../engine/painFlags';
import type { AskAnswer, AskIntent } from './rexAsk';

/**
 * Lo que Rex entiende y contesta de su memoria: apuntar algo («recuerda que los jueves solo tengo 45 minutos»), contar qué recuerda, olvidarlo,
 * y cómo sigue una molestia («el hombro va mejor», «ya no me duele»). Aquí solo lo puro: leer la frase y escribir la respuesta; guardar lo hace el router.
 */

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEKDAY_RE = '(domingo|lunes|martes|miercoles|jueves|viernes|sabado)s?';

/** El día de la semana que nombra la frase (0 = domingo), o null. */
export function findWeekday(norm: string): number | null {
  const m = norm.match(new RegExp(`\\b${WEEKDAY_RE}\\b`));
  if (!m) return null;
  return WEEKDAYS.indexOf(m[1]);
}

/** Los minutos que dice la frase («45 minutos», «una hora», «hora y media», «media hora», «1,5 h»), o null. */
export function findMinutes(norm: string): number | null {
  if (/\bhora y media\b/.test(norm)) return 90;
  if (/\bmedia hora\b/.test(norm)) return 30;
  const min = norm.match(/(?:^|[^\d])(\d{1,3}) ?(?:min|mins|minutos)\b/);
  if (min) return Number(min[1]);
  const h = norm.match(/(?:^|[^\d])(\d{1,2})(?:[.,](\d))? ?(?:h|hs|horas?)\b/);
  if (h) return Math.round((Number(h[1]) + (h[2] ? Number(h[2]) / 10 : 0)) * 60);
  if (/\buna hora\b/.test(norm)) return 60;
  return null;
}

/** La zona que nombra la frase, o null. */
function findZone(norm: string): PainArea | null {
  if (/\brodilla\b/.test(norm)) return 'rodilla';
  if (/\bhombro\b/.test(norm)) return 'hombro';
  if (/\b(lumbar|espalda|cadera|lumbares)\b/.test(norm)) return 'cadera-lumbar';
  if (/\b(codo|muneca)\b/.test(norm)) return 'codo-muneca';
  return null;
}

const REMEMBER_PREFIX = /^\s*(?:recu[eé]rda(?:me)?|ten en cuenta|ac[uú]erdate de)(?:\s+(?:de\s+)?que)?[\s:,]+/i;

/**
 * Lee las frases de la memoria. Va antes que el resto de la caja de Rex: «ya no me duele el hombro» contiene «duele» y «apunta…» podría ser una comida o un peso,
 * así que se pide una palabra clara («recuerda», «olvida», «qué recuerdas») para no pisar nada.
 */
export function parseMemoryAsk(text: string, norm: string): AskIntent | null {
  // Cómo sigue una molestia: va mejor / sigue igual / ya pasó. Hay que nombrar la zona o la molestia (o decir «ya no me duele»).
  const zone = findZone(norm);
  const mentionsPain = zone !== null || /\b(dolor|molestia|lesion|lo mio|lo que me paso)\b/.test(norm);
  const gone = /\bya no me (duele|molesta|dan)\b|\bya (esta|estoy|va) (bien|curad[oa]|recuperad[oa])\b|\bya (me )?paso\b|\bse (me )?(ha )?pasad[oa]\b|\bha desaparecido\b/;
  if (mentionsPain || /\bya no me (duele|molesta)\b/.test(norm)) {
    if (gone.test(norm)) return { kind: 'dolor-estado', zone, answer: 'paso' };
    if (/\b(va|voy|esta|estoy|ya)\s+(mucho\s+)?mejor\b|\bmejora(ndo)?\b|\bme duele menos\b|\bmenos (dolor|molestia)\b/.test(norm)) return { kind: 'dolor-estado', zone, answer: 'mejor' };
    if (/\b(sigue|siguen|seguimos|igual|peor)\b/.test(norm)) return { kind: 'dolor-estado', zone, answer: 'sigue' };
  }

  // Apuntar: «recuerda que los jueves solo tengo 45 minutos», «recuerda que mi muñeca es delicada».
  if (REMEMBER_PREFIX.test(text)) {
    const content = text.replace(REMEMBER_PREFIX, '').trim();
    if (content.length < 3) return null;
    const cn = norm.replace(/^(?:recuerda(?:me)?|ten en cuenta|acuerdate de)(?: (?:de )?que)? /, '');
    const weekday = findWeekday(cn);
    const minutes = findMinutes(cn);
    if (weekday !== null && minutes !== null && /\b(solo|solamente|maximo|como mucho|tengo|dispongo|puedo)\b/.test(cn)) {
      return { kind: 'recordar', note: { kind: 'tiempo', weekday, minutes } };
    }
    return { kind: 'recordar', note: { kind: 'nota', text: content.charAt(0).toUpperCase() + content.slice(1) } };
  }

  // Contar lo que recuerda.
  if (/\bque (recuerdas|sabes|tienes apuntado|apuntaste|has apuntado)\b|\b(mis notas|tus notas|lo que recuerdas|tu memoria)\b/.test(norm)) return { kind: 'recuerdos' };

  // Olvidar.
  if (/^(olvida|olvidate|borra el recuerdo|olvida el recuerdo)\b/.test(norm)) {
    if (/\b(todo|todas|todos)\b/.test(norm) && !/\bde los\b/.test(norm)) return { kind: 'olvidar', by: 'todo' };
    const id = norm.match(/\brecuerdo ([a-z0-9]{3,})\b/)?.[1];
    if (id) return { kind: 'olvidar', by: { id } };
    const weekday = findWeekday(norm);
    if (weekday !== null) return { kind: 'olvidar', by: { weekday } };
    const rest = text.replace(/^\s*olv[ií]da(?:te)?(?:\s+(?:de\s+)?(?:lo de|que|eso de))?(?:[\s:,]+|$)/i, '').trim();
    if (rest.length >= 3) return { kind: 'olvidar', by: { text: rest } };
    return { kind: 'recuerdos' };
  }
  return null;
}

// ---------- Respuestas ----------

const seeAll = { label: 'Qué recuerdas de mí', target: 'ir-dashboard' as const, ask: 'que recuerdas de mi' };

/** Apuntado. Los recuerdos de tiempo dicen qué hará Rex con ellos; se puede deshacer con «olvida…». */
export function rememberedAnswer(note: RexNote): AskAnswer {
  if (note.kind === 'tiempo') {
    return {
      lead: 'Lo recuerdo.',
      tone: 'good',
      text: `${weekdayPlural(note.weekday).replace(/^l/, 'L')} cuentas con ${note.minutes} min. Ese día, si la sesión se pasa, te propongo acortarla (nunca la cambio sin que me lo confirmes).`,
      actions: [{ label: 'Deshacer', target: 'ir-dashboard', ask: `olvida lo de ${weekdayPlural(note.weekday)}` }, seeAll],
    };
  }
  return {
    lead: 'Apuntado.',
    tone: 'good',
    text: `Lo recuerdo: «${note.text}».`,
    actions: [{ label: 'Deshacer', target: 'ir-dashboard', ask: `olvida el recuerdo ${note.id}` }, seeAll],
  };
}

/** Todo lo que Rex recuerda, con un botón para olvidar cada cosa (hasta cuatro; para más, «olvida todo»). */
export function recallAnswer(notes: RexNote[] | undefined): AskAnswer {
  const list = notes ?? [];
  if (list.length === 0) {
    return {
      lead: 'Aún no recuerdo nada tuyo.',
      tone: 'info',
      text: 'Dime «recuerda que los jueves solo tengo 45 minutos» o «recuerda que…» lo que quieras que tenga en cuenta.',
      actions: [],
    };
  }
  const lines = list.map((n) => describeNote(n));
  return {
    lead: 'Esto recuerdo:',
    tone: 'info',
    text: `${lines.join(' · ')}.`,
    actions: [
      ...list.slice(0, 3).map((n) => ({
        label: `Olvidar ${n.kind === 'tiempo' ? weekdayPlural(n.weekday) : `«${n.text.length > 18 ? `${n.text.slice(0, 17)}…` : n.text}»`}`,
        target: 'ir-dashboard' as const,
        ask: n.kind === 'tiempo' ? `olvida lo de ${weekdayPlural(n.weekday)}` : `olvida el recuerdo ${n.id}`,
      })),
      ...(list.length > 1 ? [{ label: 'Olvidar todo', target: 'ir-dashboard' as const, ask: 'olvida todo' }] : []),
    ].slice(0, 4),
  };
}

export function forgotAnswer(removed: RexNote[], by: NoteSelector): AskAnswer {
  if (removed.length === 0) {
    return { lead: 'No encuentro eso.', tone: 'mid', text: 'No tengo ningún recuerdo así. Pregúntame «qué recuerdas de mí» para verlos.', actions: [seeAll] };
  }
  const what = by === 'todo' ? 'Todo olvidado.' : 'Olvidado.';
  const text = removed.length === 1 ? `Ya no recuerdo: ${describeNote(removed[0])}.` : `Ya no recuerdo ${removed.length} cosas.`;
  return { lead: what, tone: 'info', text, actions: [] };
}

const ANSWER_TEXT: Record<PainFollowUp, string> = {
  sigue: 'sigue igual. Lo mantengo en cuenta y sigo evitando lo que la carga.',
  mejor: 'va mejor. Lo dejo unos días más y luego empiezo a devolverte la carga poco a poco.',
  paso: 'ya pasó. Quito el aviso y te devuelvo la carga de forma progresiva las próximas semanas.',
};

/** Contesta a «el hombro va mejor»: qué se ha anotado de cada molestia activa. */
export function painFollowAnswer(answer: PainFollowUp, zones: PainArea[]): AskAnswer {
  const names = zones.map((z) => PAIN_AREA_LABEL[z].toLowerCase()).join(' y ');
  return {
    lead: answer === 'paso' ? 'Me alegro.' : 'Anotado.',
    tone: answer === 'sigue' ? 'mid' : 'good',
    text: `Tu ${names} ${ANSWER_TEXT[answer]}`,
    actions: [],
  };
}

export function noPainAnswer(): AskAnswer {
  return { lead: 'No tienes molestias activas.', tone: 'info', text: 'Si te duele algo, dímelo («me duele el hombro») y lo tengo en cuenta en tus sesiones.', actions: [] };
}
