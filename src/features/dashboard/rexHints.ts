/**
 * Las pistas que rotan en el hueco de la caja de Rex, una lista por pantalla: frases que Rex entiende y que NO tienen un botón (así no repiten el menú).
 * Hay un test que comprueba que Rex entiende de verdad cada una.
 */
import type { RexScreen } from './rexAskRouter';

export const REX_HINTS: Record<RexScreen, readonly string[]> = {
  dashboard: ['¿cuál fue mi último snatch?', 'mañana no puedo entrenar', '¿por qué hoy así?', 'mi back squat es 140', 'mi racha', '¿cuánto peso?'],
  planificacion: ['tengo 30 minutos', 'hoy sin accesorio', 'solo fuerza', 'pasa la sesión de hoy a mañana', '¿por qué este peso?', '¿cuánto dura la sesión de hoy?'],
  nutricion: ['he comido dos huevos y arroz', 'apunta 82,4 kg', '¿cuánto peso?'],
  objetivos: ['quiero subir mi sentadilla', 'crea un macro hasta junio', '¿cómo voy?'],
};
