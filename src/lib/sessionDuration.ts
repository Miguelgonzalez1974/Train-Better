import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { getWodProfile } from '../engine/wodProfile';

/**
 * Duración ORIENTATIVA de una sesión, en minutos — para que el atleta sepa cuánto le va a llevar
 * antes de empezar, sin entrar a leer cada bloque. Igual de aproximada que el resto de estimaciones
 * del motor (objetivo del WOD, etc.): una heurística razonable, no un cronómetro.
 */

/**
 * Minutos de una pieza de WOD: los del perfil del catálogo si es un WOD real (duración declarada o modelo por movimiento; un Fran
 * son 5 min, no los 12 de un metcon medio), o, si no, a partir de su `format` (si lleva la cifra) o su `wodTarget` (si es de tiempo).
 */
function wodPartMinutes(entry: SessionBlockResult): number {
  const catalogId = entry.wodCatalogId ?? (entry.wodLibraryId ? `lib:${entry.wodLibraryId}` : undefined);
  const profiled = catalogId ? getWodProfile(catalogId)?.expectedMin : null;
  if (profiled) return Math.round(profiled);
  const format = entry.format ?? '';
  const explicitMin = format.match(/(\d+)\s*min/i);
  if (explicitMin) return Number(explicitMin[1]);

  const intervalRounds = format.match(/Cada (\d+):(\d+)\s*x\s*(\d+)\s*rondas/i);
  if (intervalRounds) {
    const [, mm, ss, rounds] = intervalRounds;
    return Math.round((Number(mm) + Number(ss) / 60) * Number(rounds));
  }
  // Intervalo abierto ("hasta el fallo"): longitud real depende de cuánto aguante el atleta — se usa
  // un término medio realista (unos 5 intentos) en vez de dejarlo sin estimar.
  const intervalOpen = format.match(/Cada (\d+):(\d+)\s*hasta el fallo/i);
  if (intervalOpen) {
    const [, mm, ss] = intervalOpen;
    return Math.round((Number(mm) + Number(ss) / 60) * 5);
  }
  // Objetivo orientativo ya calculado por el motor, cuando es de tiempo (For Time, escaleras, sándwich...).
  if (entry.wodTarget?.unit === 'seconds' && entry.wodTarget.high > 0) return Math.round(entry.wodTarget.high / 60);
  // WOD real (biblioteca o benchmark) sin objetivo de tiempo, o formato sin cifra reconocible — duración
  // típica de un metcon medio.
  return 12;
}

export type SessionBlockKind = DailySession['blocks'][number]['block'];

/** Los minutos orientativos de cada tipo de bloque de una sesión (el WOD, con una estimación por parte). */
function blockMinutes(session: DailySession): Record<SessionBlockKind, number> {
  const out = { warmup: 0, strength: 0, oly: 0, wod: 0, accessory: 0, skill: 0, cooldown: 0 } as Record<SessionBlockKind, number>;
  if (session.isRestDay || session.source === 'custom') return out;

  for (const block of session.blocks) {
    switch (block.block) {
      case 'warmup':
      case 'cooldown':
        out[block.block] += 1.5;
        break;
      case 'strength':
      case 'oly':
        // Un paso de preparación (primer técnico, calentamiento de barra) es rápido; el levantamiento
        // de trabajo se mide por series (trabajo + descanso entre series).
        out[block.block] += block.subgroup ? 1 : (block.sets ?? 3) * 2.2;
        break;
      case 'accessory':
        out.accessory += (block.sets ?? 3) * 1.6;
        break;
      case 'skill': {
        const explicitMin = (block.reps ?? '').match(/(\d+)\s*min/);
        out.skill += explicitMin ? Number(explicitMin[1]) : 8;
        break;
      }
      default:
        break;
    }
  }
  // WOD: una estimación por cada parte distinta (día de doble WOD) en vez de por entrada — todas las
  // entradas de la misma parte comparten formato/objetivo.
  const wodEntries = session.blocks.filter((b) => b.block === 'wod');
  const parts = new Set(wodEntries.map((e) => e.wodPart ?? 1));
  for (const part of parts) {
    const first = wodEntries.find((e) => (e.wodPart ?? 1) === part);
    if (first) out.wod += wodPartMinutes(first);
  }
  return out;
}

export function estimateSessionMinutes(session: DailySession): number {
  if (session.isRestDay || session.source === 'custom') return 0;
  const total = Object.values(blockMinutes(session)).reduce((s, v) => s + v, 0) + (session.doubleWod ? 7 : 0); // descanso entre las dos partes (5-10 min)
  return Math.round(total);
}
