/**
 * Primera frase de una nota del coach — para mostrar solo lo accionable y dejar el resto tras un
 * "ver más". Corta en `. ` / `! ` / `? ` seguido de inicio de frase (mayúscula o ¡¿), así que no
 * parte en "1RM.", cifras decimales ni abreviaturas en minúscula.
 */
export function noteHead(text: string): { head: string; hasMore: boolean } {
  const t = text.trim();
  const parts = t.split(/(?<=[.!?])\s+(?=[¡¿A-ZÁÉÍÓÚ])/);
  if (parts.length <= 1 || parts[0].length >= t.length - 2) return { head: t, hasMore: false };
  return { head: parts[0], hasMore: true };
}
