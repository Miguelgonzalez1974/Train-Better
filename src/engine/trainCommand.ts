/**
 * Órdenes habladas dentro del entreno en tarjetas («serie hecha», «hecha con cien kilos», «justa», «siguiente», «salta el descanso», «me duele el
 * hombro»). Con las manos con magnesio no se escribe: se dice. Esto solo lee la frase y dice qué orden es; quien la usa (las tarjetas) la ejecuta sobre
 * el ejercicio que tiene delante. Puro: ni voz ni pantalla. Las cifras dichas («ciento cuarenta») deben llegar ya en cifras (`numberWordsToDigits`).
 */

export type TrainCommand =
  /** La serie actual está hecha, con otro peso si lo dice y marcada como justa o fallada si lo dice. */
  | { kind: 'done'; kg?: number; quality?: 'justa' | 'fallada' }
  /** Cambia el peso de la serie actual (y de las que quedan) sin marcarla. */
  | { kind: 'kg'; kg: number }
  /** Cómo salió la última serie hecha. */
  | { kind: 'quality'; quality: 'bien' | 'justa' | 'fallada' }
  | { kind: 'undo' }
  | { kind: 'all-planned' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'rest-skip' }
  | { kind: 'rest-add'; seconds: number }
  | { kind: 'pain' }
  | { kind: 'close' }
  | { kind: 'unknown' };

const clean = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!;:()"«»]/g, ' ')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Un peso de barra razonable en kilos, dicho con «kilos», «kg» o tras «con», «pon», «a». */
function findKg(n: string): number | undefined {
  const unit = n.match(/(\d{2,3}(?:,\d{1,2})?)\s*(?:kg|kgs|kilos?|k)\b/);
  const lead = n.match(/\b(?:con|pon|ponle|puse|a|de)\s+(\d{2,3}(?:,\d{1,2})?)\b(?!\s*(?:s|seg|segundos?|min|minutos?|rep|reps|repeticiones))/);
  const raw = unit?.[1] ?? lead?.[1];
  if (!raw) return undefined;
  const kg = Number(raw.replace(',', '.'));
  return kg >= 20 && kg <= 400 ? kg : undefined;
}

export function parseTrainCommand(text: string): TrainCommand {
  const n = clean(text);
  if (n === '') return { kind: 'unknown' };

  if (/\b(me duele|dolor|molestia|lesion)\b/.test(n)) return { kind: 'pain' };
  if (/\b(cierra|cerrar|cierre)\b|\b(he terminado|ya termine|termine|terminar (la )?sesion|fin de la sesion)\b/.test(n)) return { kind: 'close' };

  // El descanso: más tiempo o saltarlo.
  const moreSeconds = n.match(/\b(?:mas|otros?|otras?)\b.*?\b(\d{1,3})\s*(?:segundos?|seg|s)\b/) ?? n.match(/\b(\d{1,3})\s*segundos? mas\b/);
  if (moreSeconds) return { kind: 'rest-add', seconds: Math.min(300, Number(moreSeconds[1])) };
  if (/\bmedio minuto\b/.test(n)) return { kind: 'rest-add', seconds: 30 };
  if (/\b(un minuto mas|otro minuto|mas un minuto|un minuto)\b/.test(n) && /\b(mas|otro)\b/.test(n)) return { kind: 'rest-add', seconds: 60 };
  if (/\b(salta(r)?|saltate|quita)\b.*\bdescanso\b|\bsin descanso\b|\bya estoy( listo| lista)?\b|\bempiezo la serie\b|\bvamos ya\b/.test(n)) return { kind: 'rest-skip' };

  if (/\b(deshaz|deshacer|quita la serie|borra|anula|me equivoque|me he equivocado)\b/.test(n)) return { kind: 'undo' };
  if (/\b(todas|todo)\b.*\b(previst|igual|estaba|plan)\w*/.test(n)) return { kind: 'all-planned' };

  const kg = findKg(n);
  const quality: 'justa' | 'fallada' | 'bien' | undefined = /\b(fallada|fallado|fallo|falle|no sali|no salio|no la saque|no pude)\b/.test(n)
    ? 'fallada'
    : /\b(justa|justo|por los pelos|raspando)\b/.test(n)
      ? 'justa'
      : /\b(bien|perfecta|limpia|facil)\b/.test(n)
        ? 'bien'
        : undefined;
  const done = /\b(hecha|hecho|listo|lista|terminada|terminado|completada|completado|marcada|marca|ya|ok|vale|dale)\b/.test(n) || /\bserie\b/.test(n) && kg !== undefined;
  if (done) {
    const q = quality === 'justa' || quality === 'fallada' ? quality : undefined;
    return { kind: 'done', ...(kg !== undefined ? { kg } : {}), ...(q ? { quality: q } : {}) };
  }
  if (quality) return { kind: 'quality', quality };
  if (kg !== undefined) return { kind: 'kg', kg };

  if (/\b(anterior|atras|vuelve|volver|retrocede)\b/.test(n)) return { kind: 'prev' };
  if (/\b(siguiente|adelante|avanza|pasa|pasar|sigue|continua)\b/.test(n)) return { kind: 'next' };
  return { kind: 'unknown' };
}

/** Las frases de ejemplo que Rex enseña cuando no entiende. */
export const TRAIN_COMMAND_EXAMPLES = ['serie hecha', 'hecha con 100 kilos', 'justa', 'siguiente', 'salta el descanso', 'me duele el hombro'];
