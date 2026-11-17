import type { AthleteProfile, DailySession, SessionBlockResult } from '../data/athlete/types';
import type { OlyComplex } from '../data/complexes';
import { getMovementById } from '../data/movements';
import { suggestAccessoryLoadKg } from './accessoryLoads';
import { buildComplexPool, stepCapacityKg, swapComplexPatch } from './olyComplexes';
import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * Corrección puntual de la sesión del 17 nov 2026 (la que Miguel hizo de verdad): fuerza con Bench Press en vez de Spoto Press, un Pendlay
 * Row (barbell row) como complemento en vez del remo con mancuerna, y el oly de clean con Muscle Clean como primer, el complejo
 * Power clean + Hang power clean + Split jerk y Clean pull como tirón. Se aplica UNA vez, solo a esa fecha y solo si aún no está
 * registrada; queda anotada en `manualFix`. Se puede borrar este archivo cuando pase la fecha.
 */

export const MANUAL_FIX_ID = 'manual-2026-11-17';
const FIX_DATE = '2026-11-17';

export const PC_HPC_SJ_COMPLEX: OlyComplex = {
  id: 'custom-pc-hpc-sj',
  name: 'Power clean + hang power clean + split jerk',
  family: 'clean',
  focus: ['potencia', 'jerk'],
  custom: true,
  steps: [
    { movementId: 'power-clean', reps: 1 },
    { movementId: 'hang-power-clean', reps: 1 },
    { movementId: 'split-jerk', reps: 1 },
  ],
};

const nameOf = (id: string) => getMovementById(id)?.name ?? id;

/** La carga de un movimiento sustituido: la anterior escalada por lo que cada uno aguanta (paso 1RM de cada uno). Sin datos, se deja la anterior. */
function scaledLoad(oldId: string, newId: string, oldKg: number | undefined, profile: AthleteProfile): number | undefined {
  if (!oldKg) return oldKg;
  const a = stepCapacityKg(oldId, profile.prs, profile.variantPrs);
  const b = stepCapacityKg(newId, profile.prs, profile.variantPrs);
  return a && b ? roundToNearestPlate((oldKg * b) / a) : oldKg;
}

export interface ManualCorrection {
  session: DailySession;
  /** El complejo propio que hay que tener en la librería para que el bloque se nombre bien. */
  newComplex: OlyComplex;
}

/** null si no toca corregir (otra fecha, ya aplicada o sesión propia). */
export function applyManualCorrection(session: DailySession, profile: AthleteProfile): ManualCorrection | null {
  if (session.date !== FIX_DATE || session.manualFix === MANUAL_FIX_ID || session.source === 'custom' || session.isRestDay) return null;
  const week = (session.mesocycleWeek >= 1 && session.mesocycleWeek <= 4 ? session.mesocycleWeek : 1) as 1 | 2 | 3 | 4;
  const blocks: SessionBlockResult[] = session.blocks.map((b) => ({ ...b }));

  // Fuerza: el principal pasa a Bench Press (mismas series, reps y carga: Spoto Press y Bench Press salen del mismo 1RM) y el complemento a Pendlay Row.
  const strength = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.block === 'strength');
  if (strength[0]) strength[0].b.movementId = 'bench-press';
  if (strength[1]) {
    const row = blocks[strength[1].i];
    row.movementId = 'pendlay-row';
    const kg = suggestAccessoryLoadKg('pendlay-row', { prs: profile.prs, bodyweightKg: null, week, loadFactor: 1, doseLoad: 1 });
    if (kg !== undefined) row.loadKg = kg;
  }

  // Oly: calentamiento de clean, primer = Muscle Clean, complejo propio, tirón = Clean Pull.
  const complexPool = buildComplexPool([...(profile.customComplexes ?? []), PC_HPC_SJ_COMPLEX].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i), profile.complexPrefs);
  blocks.forEach((b, i) => {
    if (b.block !== 'oly') return;
    if (b.movementId === 'burgener-warmup-snatch') blocks[i] = { ...b, movementId: 'burgener-warmup-clean' };
  });
  const complexIdx = blocks.findIndex((b) => b.block === 'oly' && b.complex);
  if (complexIdx >= 0) {
    const current = blocks[complexIdx];
    const currentComplex = complexPool.all.find((x) => x.id === current.complex?.id);
    const patch = swapComplexPatch(current, PC_HPC_SJ_COMPLEX, week, profile.prs, profile.variantPrs, nameOf, currentComplex);
    if (patch) blocks[complexIdx] = { ...current, ...patch };
    // El primer técnico es el único bloque de oly con «2-3» repeticiones que no es de calentamiento; el tirón, el que va tras el complejo.
    const primerIdx = blocks.findIndex((b, i) => i < complexIdx && b.block === 'oly' && !b.subgroup && b.reps === '2-3');
    if (primerIdx >= 0) {
      const p = blocks[primerIdx];
      blocks[primerIdx] = { ...p, movementId: 'muscle-clean', loadKg: scaledLoad(p.movementId, 'muscle-clean', p.loadKg, profile) };
    }
    const pullIdx = blocks.findIndex((b, i) => i > complexIdx && b.block === 'oly' && !b.subgroup);
    if (pullIdx >= 0) {
      const p = blocks[pullIdx];
      blocks[pullIdx] = { ...p, movementId: 'clean-pull', loadKg: scaledLoad(p.movementId, 'clean-pull', p.loadKg, profile) };
    }
  }

  return { session: { ...session, blocks, editedByAthlete: true, manualFix: MANUAL_FIX_ID }, newComplex: PC_HPC_SJ_COMPLEX };
}
