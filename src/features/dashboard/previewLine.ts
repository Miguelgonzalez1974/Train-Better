import { benchmarkWorkouts, getMovementById } from '../../data/movements';
import type { DailySession } from '../../data/athlete/types';

/** "Back Squat · WOD 12 min AMRAP" — el titular de la sesión de hoy en una línea, no el detalle entero (para eso está Planificación). */
export function buildPreviewLine(session: DailySession): string {
  if (session.source === 'custom') return session.customTitle || 'Sesión propia';
  // Día de doble WOD: sin fuerza ni oly, el titular son las dos piezas.
  if (session.doubleWod) {
    const titles = session.blocks
      .filter((b) => b.block === 'wod' && b.wodPart !== undefined)
      .reduce<string[]>((acc, b) => (b.title && !acc.includes(b.title) ? [...acc, b.title] : acc), []);
    return `Doble WOD${titles.length > 0 ? ` · ${titles.map((t) => `"${t}"`).join(' + ')}` : ''}`;
  }
  const strength = session.blocks.find((b) => b.block === 'strength' && !b.subgroup);
  const oly = [...session.blocks].reverse().find((b) => b.block === 'oly' && !b.subgroup);
  const main = strength ?? oly;
  const parts: string[] = [];
  if (main) {
    const name = getMovementById(main.movementId)?.name;
    if (name) parts.push(name);
  }
  const wod = session.blocks.find((b) => b.block === 'wod');
  if (wod) {
    if (wod.movementId.startsWith('benchmark:')) {
      const name = benchmarkWorkouts.find((w) => w.id === wod.movementId.replace('benchmark:', ''))?.name;
      if (name) parts.push(name);
    } else if (wod.title) {
      parts.push(`"${wod.title}"`);
    } else if (wod.format) {
      parts.push(wod.format);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sesión lista para entrenar';
}
