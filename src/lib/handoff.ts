/**
 * Lo que RexLab le deja dicho a la pantalla a la que te lleva: «abre la conversación de la molestia», «abre el asistente de Objetivos». La
 * pantalla de destino lo recoge una sola vez al montarse. Caduca a los dos minutos, para que algo que no llegó a abrirse no salte días
 * después. Vive en memoria: una recarga lo borra, y está bien.
 */
export type HandoffKey = 'support-start' | 'plan-act' | 'objetivos-asistente';

const TTL_MS = 120_000;
const pending = new Map<HandoffKey, { value: string; at: number }>();

export const handoff = {
  put(key: HandoffKey, value: string, now: number = Date.now()): void {
    pending.set(key, { value, at: now });
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
