import type { CompanionLogEntry } from '../data/athlete/types';

/**
 * «Lo que hiciste» del programa de fuerza que convive con el macro: una sesión del registro, redactada para enseñarla (el título, una línea por
 * levantamiento y cómo salió). Puro: el nombre de cada movimiento entra por `nameOf`.
 */

export interface CompanionSummary {
  title: string;
  outcome: 'hecha' | 'saltada';
  /** «Back Squat · 5×5 · 130 kg», «Back Squat · marca de 5 · 147,5 kg ✓». */
  lines: string[];
  /** «RPE 7 · 40 min», o null si no se apuntó. */
  stats: string | null;
}

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

export function summarizeCompanionEntry(entry: CompanionLogEntry, nameOf: (movementId: string) => string): CompanionSummary {
  const title = entry.label ?? 'Sesión del programa';
  if (entry.outcome === 'saltada') return { title, outcome: 'saltada', lines: [], stats: null };

  const lines = (entry.lifts ?? []).map((l) => {
    const name = nameOf(l.movementId);
    if (l.attempt) {
      return l.achieved !== undefined ? `${name} · marca de 5 · ${kg(l.achieved)} ✓` : `${name} · marca de 5 a ${kg(l.loadKg)} · no salió`;
    }
    return `${name} · ${l.sets}×${l.reps} · ${kg(l.loadKg)}`;
  });
  // Sesiones apuntadas antes de guardar cada levantamiento: solo hay el primero.
  if (lines.length === 0 && entry.movementId) lines.push(`${nameOf(entry.movementId)}${entry.loadKg ? ` · ${kg(entry.loadKg)}` : ''}`);

  const stats = [entry.rpe !== undefined ? `RPE ${entry.rpe}` : null, entry.durationMin !== undefined ? `${entry.durationMin} min` : null].filter(Boolean).join(' · ');
  return { title, outcome: 'hecha', lines, stats: stats || null };
}
