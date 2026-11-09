/**
 * La memoria corta de la conversación con Rex: de qué se estaba hablando en la última respuesta, para entender las frases cortas que siguen («¿y el viernes?»
 * tras «¿qué toca mañana?», «¿y el clean?» tras «¿cuál fue mi último snatch?», «¿y el WOD?» tras «¿por qué este peso?»). Vive en memoria (se borra al recargar)
 * y caduca a los 5 minutos. Una frase corta se reescribe como la pregunta completa y sigue el camino normal; lo que no se reconoce no se toca.
 */
import { fixTypos, normalizeAsk, parseAsk, type AskIntent } from './rexAsk';
import { findMarkLift } from './rexMarks';

export type Topic = { kind: 'dia' } | { kind: 'ultimo-levantamiento' } | { kind: 'ultimo-test' } | { kind: 'marca-ver' } | { kind: 'por-que' };

const TTL_MS = 5 * 60_000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

let current: { topic: Topic; at: number } | null = null;

/** Apunta de qué trata lo último que se ha contestado (o olvida el tema si fue otra cosa). */
export function rememberTopic(intent: AskIntent, now: number = Date.now()): void {
  if (intent.kind === 'dia') current = { topic: { kind: 'dia' }, at: now };
  else if (intent.kind === 'dato' && (intent.question.what === 'ultimo-levantamiento' || intent.question.what === 'ultimo-test')) current = { topic: { kind: intent.question.what }, at: now };
  else if (intent.kind === 'marca-ver' && !intent.open) current = { topic: { kind: 'marca-ver' }, at: now };
  else if (intent.kind === 'por-que') current = { topic: { kind: 'por-que' }, at: now };
  else current = null;
}

export function forgetTopic(): void {
  current = null;
}

/** La pregunta completa que quiere decir una frase corta, o null si no sigue el hilo. */
export function followUpText(text: string, todayWeekday: number, now: number = Date.now()): string | null {
  if (!current || now - current.at > TTL_MS) return null;
  const norm = fixTypos(normalizeAsk(text));
  const words = norm.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  const connects = /^(y|e|pero|tambien|ademas)$/.test(words[0]);
  // Sin «y», solo se sigue el hilo si la frase sola no se entiende («el viernes»).
  if (!connects && parseAsk(text, todayWeekday).kind !== 'ayuda') return null;

  const { kind } = current.topic;
  if (kind === 'dia') {
    if (/\bpasado manana\b/.test(norm)) return 'que toca pasado manana';
    if (/\bmanana\b/.test(norm)) return 'que toca manana';
    if (/\bhoy\b/.test(norm)) return 'que toca hoy';
    const day = WEEKDAYS.find((d) => new RegExp(`\\b${d}\\b`).test(norm));
    return day ? `que toca el ${day}` : null;
  }
  if (kind === 'ultimo-levantamiento' || kind === 'ultimo-test' || kind === 'marca-ver') {
    const lift = findMarkLift(norm);
    if (!lift) return null;
    return kind === 'ultimo-levantamiento' ? `cual fue mi ultimo ${lift.label}` : kind === 'ultimo-test' ? `cuando fue mi ultimo test de ${lift.label}` : `cuanto levanto en ${lift.label}`;
  }
  // por-que
  if (/\b(peso|pesos|kilos|kg|carga)\b/.test(norm)) return 'por que este peso';
  if (/\b(wod|metcon)\b/.test(norm)) return 'por que este wod';
  if (/\b(hoy|sesion|entreno|entrenamiento)\b/.test(norm)) return 'por que hoy asi';
  return null;
}
