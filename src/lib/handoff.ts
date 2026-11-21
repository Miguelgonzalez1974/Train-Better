/**
 * Lo que RexLab le deja dicho a la pantalla a la que te lleva: «abre la conversación de la molestia», «abre el asistente de Objetivos». La
 * pantalla de destino lo recoge una sola vez al montarse. Caduca a los dos minutos, para que algo que no llegó a abrirse no salte días
 * después. Vive en memoria: una recarga lo borra, y está bien.
 */
export type HandoffKey = 'support-start' | 'plan-act' | 'objetivos-asistente' | 'analisis-tab' | 'dash-act' | 'nutri-act';
// El valor de 'nutri-act': 'scan' (Nutrición abre el escáner de códigos de barras) o 'comida' (Nutrición enfoca la caja «He comido…»).
// El valor de 'plan-act': 'continuar' (las tarjetas, entrenando), 'cerrar' (las tarjetas en el cierre), 'anotar' (la pregunta «¿qué hiciste hoy?»), 'otra-cosa' (el registro de otra cosa) u 'otro-wod'.
// El valor de 'dash-act': 'resumen' (el Dashboard abre «Lo que hiciste» de hoy, con el resumen de la sesión).
// El valor de 'analisis-tab': 'perfil' (Análisis en su pestaña Perfil), 'marcas' (la pantalla Mis marcas) o 'marcas:backSquat' (con ese levantamiento desplegado).

const TTL_MS = 120_000;
const pending = new Map<HandoffKey, { value: string; at: number }>();

export const handoff = {
  put(key: HandoffKey, value: string, now: number = Date.now()): void {
    pending.set(key, { value, at: now });
  },
  /** Lee sin borrar (para el estado inicial de un componente, que en desarrollo se calcula dos veces). Quien lo usa llama luego a `take` en un efecto. */
  peek(key: HandoffKey, now: number = Date.now()): string | null {
    const item = pending.get(key);
    return item && now - item.at <= TTL_MS ? item.value : null;
  },
  /** Lee y borra. null si no hay nada o ya caducó. */
  take(key: HandoffKey, now: number = Date.now()): string | null {
    const item = pending.get(key);
    pending.delete(key);
    return item && now - item.at <= TTL_MS ? item.value : null;
  },
  clear(): void {
    pending.clear();
  },
};
