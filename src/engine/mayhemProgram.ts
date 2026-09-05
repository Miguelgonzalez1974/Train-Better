import type { PersonalRecords, StrengthProgram } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { DayPlan } from './periodization';
import { weeksSinceStart } from './periodization';
import { roundToNearestPlate } from './oneRepMaxTables';
import { parseLadder } from './ladderProgram';

/**
 * "Mayhem Burgener Strength — Ciclo 9 (mayhem-base)" — 6 semanas, 5 días, transcrito literal de las
 * capturas del usuario (`CYCLE 9 WEEK x`). Snatch-focus con squat de soporte; la versión más limpia
 * y "canónica" del motor Burgener. A diferencia del ciclo de halterofilia (`halteroProgram.ts`, todo
 * escaleras de %), Mayhem mezcla formatos: escaleras, esquemas de reps cíclicos con peso a elección,
 * EMOM, complejos con subseries (3+2+1) y tope de RPE. De ahí que tenga su propio modelo y resolver
 * en vez de reutilizar `resolveLadderDay` tal cual (sí reutiliza `parseLadder`).
 */

export const MAYHEM_BASE_TOTAL_WEEKS = 6;

type MayhemBlock = 'oly' | 'strength' | 'accessory';

interface MayhemLift {
  /** Nombre a mostrar, tal cual la captura fuente. */
  label: string;
  /** Movimiento ancla: de él salen el PR, el patrón y el nombre en la tarjeta. */
  movementId: string;
  block: MayhemBlock;
  /** PR de referencia para los %. Ausente = peso a elección del atleta (autoselección). */
  prKey?: keyof PersonalRecords;
  /**
   * Escalera de % en notación `parseLadder` ("70/3 75/2×2"): la última serie es la de trabajo. Manda
   * sobre el resto de campos de carga si está presente.
   */
  ladder?: string;
  /** Serie(s) a un % fijo del PR. */
  percent?: number;
  sets?: number;
  reps?: string;
  /** Esquema de reps descendente con peso a elección ("10,8,6,4,2"). Rampa de % solo como referencia. */
  repScheme?: string;
  /** Rampa de % de referencia [desde, hasta] para `repScheme` — orientativa, el atleta ajusta. */
  repRamp?: [number, number];
  /** Minutos de EMOM (1 serie por minuto de `reps`). */
  emomMinutes?: number;
  /** % de referencia de partida para un EMOM que sube a un tope de RPE. */
  emomStartPercent?: number;
  /** true = el último número es un 1RM real; no se descuenta por autorregulación. */
  isMaxAttempt?: boolean;
  /** Partes del complejo, en orden, para la nota (texto libre — no tienen por qué ser ids del catálogo). */
  complex?: string[];
  /** Nota extra específica de este levantamiento. */
  note?: string;
}

// --- Atajos de construcción -------------------------------------------------

const snZ = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Snatch', movementId: 'snatch', block: 'oly', prKey: 'snatch', ...over });
const clZ = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Clean', movementId: 'clean', block: 'oly', prKey: 'clean', ...over });
const cjZ = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Clean & Jerk', movementId: 'clean-and-jerk', block: 'oly', prKey: 'cleanAndJerk', ...over });
const bs = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Back Squat', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', ...over });
const fs = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', ...over });
const dl = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Peso Muerto', movementId: 'deadlift', block: 'strength', prKey: 'deadlift', ...over });
const bp = (over: Partial<MayhemLift>): MayhemLift => ({ label: 'Bench Press', movementId: 'bench-press', block: 'strength', prKey: 'benchPress', ...over });
const acc = (label: string, movementId: string, over: Partial<MayhemLift> = {}): MayhemLift => ({ label, movementId, block: 'accessory', ...over });

type MayhemDay = MayhemLift[];
type MayhemWeek = MayhemDay[];

// --- Ciclo 9 (6 semanas x 5 días) -----------------------------------------

const MAYHEM_BASE: MayhemWeek[] = [
  // ===== SEMANA 1 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + Pause OHS + OHS', movementId: 'overhead-squat', ladder: '70/6 75/4', sets: 2, complex: ['Snatch push press', 'Pause overhead squat', 'Overhead squat'], note: 'Complejo 3+2+1 la 1ª carga, 2+1+1 la 2ª — sin soltar la barra.' }),
      snZ({ label: 'Barski Snatch', movementId: 'barski-snatch', ladder: '65/3 70/3', note: '3 snatch desde high hang sin straps por serie. Descanso 2 min entre series.' }),
      acc('Front Rack Lunges', 'walking-lunge', { emomMinutes: 10, reps: '6', note: 'EMOM 10 min: 6 zancadas en rack frontal cada minuto.' }),
    ],
    // Día 2
    [
      bs({ percent: 0.65, sets: 5, reps: '5' }),
      snZ({ label: 'Power Snatch', movementId: 'power-snatch', repScheme: '10,8,6,4,2', repRamp: [0.55, 0.78], note: 'Cíclico: elige pesos que muevas con técnica y eficiencia, descanso a demanda.' }),
      dl({ percent: 0.58, sets: 4, reps: '10', note: '55-60% del PM. Entre series: 5 tall box jumps.' }),
    ],
    // Día 3
    [
      clZ({ label: 'Muscle Clean + Tall Clean', movementId: 'muscle-clean', sets: 3, reps: '3+3', note: 'Trabajo de técnica y velocidad de codos — no te preocupes por la carga.' }),
      clZ({ label: '3 Cleans desde encima de rodilla', movementId: 'clean', ladder: '70/3 75/3', sets: 2, note: '3 cleans consecutivos desde high hang por serie.' }),
      cjZ({ label: 'Jerk', movementId: 'split-jerk', emomMinutes: 10, emomStartPercent: 0.6, note: 'EMOM 10 min: arranca al 60% y sube hasta un tope de RPE 9/10.' }),
      bp({ repScheme: '10,5,3,10,5,3', repRamp: [0.6, 0.85] }),
    ],
    // Día 4
    [
      fs({ percent: 0.75, sets: 10, reps: '3' }),
      clZ({ label: 'Power Clean', movementId: 'power-clean', repScheme: '10,8,6,4,2', repRamp: [0.55, 0.78] }),
      snZ({ label: 'Snatch Deadlift en riser', movementId: 'snatch-deadlift', percent: 0.9, sets: 3, reps: '5' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — ola de singles', movementId: 'snatch', ladder: '70/2 75/2 80/1 85/1 80/1 85/1', note: 'Ola de singles, descanso 60-90 s entre series.' }),
      cjZ({ label: 'Clean & Jerk — ola de singles', movementId: 'clean-and-jerk', ladder: '70/2 75/2 80/1 85/1 80/1 85/1', note: 'Ola de singles sobre tu C&J, descanso 60-90 s.' }),
    ],
  ],

  // ===== SEMANA 2 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Balance', movementId: 'snatch-balance', sets: 4, reps: '3', note: 'Sube el peso en cada serie hasta un tope técnico.' }),
      snZ({ label: 'Snatch 3 Posiciones', movementId: 'three-position-snatch', ladder: '70/3 73/3', sets: 2, note: 'Suelo + rodilla + high hang sin soltar. Descanso 2 min.' }),
      acc('Front Rack Step Ups', 'step-up', { sets: 4, reps: '6/pierna', note: 'Sube el peso en cada serie.' }),
    ],
    // Día 2
    [
      bs({ percent: 0.7, sets: 5, reps: '5' }),
      snZ({ label: 'Power Snatch + Squat Snatch', movementId: 'snatch', percent: 0.7, sets: 3, reps: '1+1', note: '3 series de (1 power + 1 squat) — sube algo el peso si sale limpio.' }),
      dl({ percent: 0.58, sets: 5, reps: '10', note: '55-60% del PM.' }),
    ],
    // Día 3
    [
      clZ({ label: 'Clean 3 Posiciones + Jerk', movementId: 'three-position-clean', ladder: '73/3 78/3', sets: 2, note: 'Suelo + rodilla + high hang, y jerk al final. Sin soltar.' }),
      cjZ({ label: 'Push Jerk + Jerk', movementId: 'push-jerk', sets: 4, reps: '1+2', note: '4 series de (1 push jerk + 2 split jerk) — sube el peso cada serie.' }),
      bp({ repScheme: '10,5,3,10,5,3', repRamp: [0.6, 0.85] }),
    ],
    // Día 4
    [
      fs({ percent: 0.78, sets: 10, reps: '3' }),
      clZ({ label: 'Power Clean + Hang Power Clean', movementId: 'power-clean', sets: 3, reps: '1+1', note: '3 series de (1 power clean + 1 hang power clean) — sube el peso cada serie.' }),
      snZ({ label: 'Snatch Deadlift + Snatch Pull', movementId: 'snatch-pull', percent: 0.95, sets: 3, reps: '2+2', note: '(2 snatch deadlift + 2 snatch pull) por serie al 95% del snatch.' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — ola de singles', movementId: 'snatch', ladder: '75/2 80/2 85/1 85/1 88/1 85/1 90/1 85/1', note: 'Ola larga de singles, descanso 60-90 s.' }),
      cjZ({ label: 'Clean & Jerk — ola de singles', movementId: 'clean-and-jerk', ladder: '75/2 80/2 85/1 85/1 88/1 85/1 90/1', note: 'Ola de singles sobre tu C&J, descanso 60-90 s.' }),
    ],
  ],

  // ===== SEMANA 3 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + Snatch Balance', movementId: 'snatch-balance', ladder: '70/5 75/3', sets: 2, complex: ['Snatch push press', 'Snatch balance'], note: '(3+2) la 1ª carga, (2+1) la 2ª. Sin soltar.' }),
      snZ({ label: 'Snatch High Pull + Power Snatch + Snatch', movementId: 'snatch', ladder: '70/3 73/3', sets: 2, complex: ['Snatch high pull', 'Power snatch', 'Snatch'], note: 'Complejo sin soltar. Descanso 2 min.' }),
      acc('Front Rack Walking Lunge', 'walking-lunge', { sets: 3, reps: '20 pasos', note: 'AHAP — el peso más alto que puedas mantener con torso firme.' }),
    ],
    // Día 2
    [
      bs({ percent: 0.75, sets: 5, reps: '5' }),
      snZ({ label: 'Power Snatch sin soltar', movementId: 'power-snatch', percent: 0.42, sets: 2, reps: '20', note: '2 series de 20 power snatch sin soltar (~75/55 lb). Estímulo de capacidad.' }),
      dl({ repScheme: '8,6,4,2', repRamp: [0.65, 0.85] }),
    ],
    // Día 3
    [
      clZ({ label: 'Clean Pull + Clean + Jerk Dip + Jerk', movementId: 'clean', ladder: '70/4 75/4', sets: 2, complex: ['Clean pull', 'Clean', 'Jerk dip', 'Jerk'], note: 'Complejo completo sin soltar. Descanso amplio.' }),
      cjZ({ label: 'Jerk desde nuca', movementId: 'split-jerk', emomMinutes: 10, emomStartPercent: 0.67, note: 'EMOM 10 min: 1 split jerk desde nuca por minuto, arranca 65-70% y sube a un single de RPE 9/10.' }),
    ],
    // Día 4
    [
      fs({ percent: 0.81, sets: 10, reps: '3' }),
      clZ({ label: 'Power Clean + Push Jerk', movementId: 'power-clean', sets: 3, reps: '1+1', note: '3 series de (1 power clean + 1 push jerk) — sube el peso cada serie.' }),
      snZ({ label: 'Snatch Deadlift + Snatch Shrug', movementId: 'snatch-shrug', percent: 1.05, sets: 3, reps: '3+5', note: '(3 snatch deadlift + 5 snatch shrug) por serie al 105% del snatch. Straps.' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — ola de singles', movementId: 'snatch', ladder: '75/2 80/2 85/1 90/1 85/1 90/1', note: 'Ola de singles, descanso 60-90 s.' }),
      cjZ({ label: 'Clean & Jerk — ola de singles', movementId: 'clean-and-jerk', ladder: '75/2 80/2 85/1 90/1 85/1 90/1', note: 'Ola de singles sobre tu C&J, descanso 60-90 s.' }),
    ],
  ],

  // ===== SEMANA 4 (descarga) =====
  [
    // Día 1
    [
      bs({ percent: 0.75, sets: 3, reps: '3', note: 'Semana de descarga — sin trabajo técnico pesado, solo mantener el patrón.' }),
    ],
    // Día 2
    [
      snZ({ label: 'Power Snatch + Snatch', movementId: 'snatch', percent: 0.7, sets: 4, reps: '1+1', note: '4 series de (1 power + 1 squat snatch) al 70%. Descanso 2 min.' }),
      dl({ label: 'Peso Muerto', movementId: 'deadlift', emomMinutes: 10, emomStartPercent: 0.6, note: 'EMOM 10 min: 1 peso muerto por minuto, sube a un single pesado del día a RPE 9/10.' }),
    ],
    // Día 3
    [
      clZ({ label: 'High Hang Muscle Clean + Jerk Balance', movementId: 'muscle-clean', sets: 3, reps: '3+3', note: 'Trabajo de técnica ligero.' }),
      cjZ({ label: 'Power Clean + Jerk', movementId: 'clean-and-jerk', ladder: '70/2 70/2 70/2 70/2 75/2', sets: 1, note: '4 series al 70% + 1 al 75% del clean.' }),
    ],
    // Día 4
    [
      fs({ percent: 0.75, sets: 5, reps: '3' }),
      snZ({ label: 'Snatch Deadlift', movementId: 'snatch-deadlift', percent: 1.0, sets: 3, reps: '3' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — 3 singles', movementId: 'snatch', percent: 0.8, sets: 3, reps: '1', note: 'Sube hasta un tope de RPE 7-7.5 y haz 3 singles perfectos ahí — no pases de esa sensación.' }),
      cjZ({ label: 'Clean & Jerk — 2 singles', movementId: 'clean-and-jerk', percent: 0.8, sets: 2, reps: '1', note: 'Sube hasta RPE 7-7.5 y haz 2 singles ahí.' }),
    ],
  ],

  // ===== SEMANA 5 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + OHS + Snatch Balance', movementId: 'snatch-balance', ladder: '73/6 78/4', sets: 2, complex: ['Snatch push press', 'Overhead squat', 'Snatch balance'], note: '(3+2+1) la 1ª carga, (2+1+1) la 2ª. Descanso 2 min.' }),
      snZ({ label: 'Snatch Balance — escalera', movementId: 'snatch-balance', ladder: '60/3 65/3 70/2 75/2 80/1 85/1 90/1' }),
    ],
    // Día 2
    [
      bs({ percent: 0.7, sets: 4, reps: '5' }),
      snZ({ label: 'Power Snatch sin soltar', movementId: 'power-snatch', sets: 3, reps: '10', note: '3 series de 10 power snatch sin soltar — sube el peso cada serie.' }),
      dl({ percent: 0.62, sets: 4, reps: '10', note: '60-65% del PM.' }),
    ],
    // Día 3
    [
      clZ({ label: 'Clean desde encima de rodilla + Clean + Jerk', movementId: 'clean', ladder: '73/4 78/3', sets: 2, note: '(2+1+1) la 1ª carga, (1+1+1) la 2ª. Sin soltar.' }),
      cjZ({ label: 'Jerk', movementId: 'split-jerk', emomMinutes: 10, emomStartPercent: 0.6, note: 'EMOM 10 min: 1 split jerk por minuto, arranca 60% y sube a un tope de RPE 9/10.' }),
      bp({ repScheme: '7,5,3,7,5,3', repRamp: [0.62, 0.87] }),
    ],
    // Día 4
    [
      fs({ percent: 0.8, sets: 7, reps: '3' }),
      clZ({ label: 'Power Clean sin soltar', movementId: 'power-clean', sets: 3, reps: '10', note: '3 series de 10 power clean sin soltar — sube el peso cada serie, descanso 90 s.' }),
      snZ({ label: 'Snatch Deadlift en riser', movementId: 'snatch-deadlift', percent: 1.05, sets: 3, reps: '3', note: '100-105% del snatch.' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — singles', movementId: 'snatch', ladder: '75/1 80/1 85/1 93/1 93/1', note: 'Singles, descanso amplio.' }),
      cjZ({ label: 'Clean & Jerk — singles', movementId: 'clean-and-jerk', ladder: '75/1 80/1 85/1 93/1 93/1', note: 'Singles sobre tu C&J.' }),
    ],
  ],

  // ===== SEMANA 6 (pico) =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch DL a medio muslo + Power Snatch a paralelo + Snatch', movementId: 'snatch', ladder: '73/3 75/3', sets: 2, complex: ['Snatch deadlift a medio muslo', 'Power snatch a paralelo', 'Snatch'], note: 'Complejo sin soltar. Descanso 2 min.' }),
      snZ({ label: 'Snatch Balance — escalera', movementId: 'snatch-balance', ladder: '60/3 65/3 70/2 75/2 80/1 85/1 90/1' }),
      acc('Back Rack Reverse Lunge', 'reverse-lunge', { repScheme: '20,14,10', note: 'Baja reps y sube peso cada serie (total 20/14/10).' }),
    ],
    // Día 2
    [
      dl({ percent: 0.8, sets: 5, reps: '3' }),
      snZ({ label: 'Hang Power Snatch + Hang Squat Snatch', movementId: 'hang-snatch', ladder: '70/8 72/6 74/4 76/2', sets: 1, note: '(1+1)x4, (1+1)x3, (1+1)x2, (1+1) — sube el peso cada bloque.' }),
    ],
    // Día 3
    [
      cjZ({ label: 'Jerk desde nuca + Jerk', movementId: 'split-jerk', sets: 4, reps: '1+1', note: '4 series de (1 jerk desde nuca + 1 split jerk) — sube el peso cada serie.' }),
      clZ({ label: 'Power Clean a paralelo con pausa + Push Jerk', movementId: 'power-clean', ladder: '78/4 81/3', sets: 2, complex: ['Power clean a paralelo (pausa 1 s en recepción)', 'Push jerk'], note: '(2+2) la 1ª carga, (2+1) la 2ª.' }),
      bp({ repScheme: '5,3,1,5', repRamp: [0.7, 0.92] }),
    ],
    // Día 4
    [
      clZ({ label: 'Power Clean + Hang Squat Clean', movementId: 'power-clean', ladder: '70/8 73/6 76/4', sets: 1, note: '(1+1)x4, (1+1)x3, (1+1)x2 — sube el peso cada bloque.' }),
      snZ({ label: 'Snatch Deadlift en riser', movementId: 'snatch-deadlift', percent: 1.05, sets: 4, reps: '3', note: '100-105% del snatch.' }),
    ],
    // Día 5
    [
      snZ({ label: 'Snatch — 3 singles', movementId: 'snatch', percent: 0.85, sets: 3, reps: '1', note: 'Sube hasta un tope de RPE 8-8.5 y haz 3 singles ahí.' }),
      cjZ({ label: 'Clean & Jerk — 2 singles', movementId: 'clean-and-jerk', percent: 0.85, sets: 2, reps: '1', note: 'Sube hasta RPE 8-8.5 y haz 2 singles ahí.' }),
    ],
  ],
];

export interface MayhemDayResult {
  weekNumber: number;
  lifts: {
    movementId: string;
    prKey?: keyof PersonalRecords;
    block: MayhemBlock;
    sets: number;
    reps: string;
    loadKg?: number;
    format: string;
    notes: string;
  }[];
}

const clampFactor = (isMax: boolean, autoreg: number) => (isMax ? 1 : autoreg);

/** Resuelve un levantamiento del ciclo a un bloque listo (carga, reps, nota). */
function resolveMayhemLift(lift: MayhemLift, prs: PersonalRecords, autoregFactor: number, weekLabel: string): MayhemDayResult['lifts'][number] {
  const factor = clampFactor(Boolean(lift.isMaxAttempt), autoregFactor);
  const base = lift.prKey ? prs[lift.prKey] : 0;
  const complexNote = lift.complex && lift.complex.length > 0 ? ` Complejo: ${lift.complex.join(' + ')}.` : '';
  const extraNote = lift.note ? ` ${lift.note}` : '';
  const format = `${weekLabel} · ${lift.label}`;

  // 1) Escalera de %
  if (lift.ladder && lift.prKey) {
    const steps = parseLadder(lift.ladder);
    const lines = steps.map((s) => {
      const load = roundToNearestPlate(base * s.percent * factor);
      const setsLabel = s.sets > 1 ? `${s.sets}x${s.reps}` : `${s.reps}`;
      return `${Math.round(s.percent * 100)}% ${setsLabel} @ ${load} kg`;
    });
    const last = steps[steps.length - 1];
    const lastLoad = roundToNearestPlate(base * last.percent * factor);
    return {
      movementId: lift.movementId,
      prKey: lift.prKey,
      block: lift.block,
      sets: lift.sets ?? last.sets,
      reps: lift.reps ?? String(last.reps),
      loadKg: lastLoad,
      format,
      notes: `Escalera: ${lines.join(', ')}.${complexNote}${extraNote}`,
    };
  }

  // 2) EMOM
  if (lift.emomMinutes) {
    const startLoad = lift.emomStartPercent && lift.prKey ? roundToNearestPlate(base * lift.emomStartPercent * factor) : undefined;
    return {
      movementId: lift.movementId,
      prKey: lift.prKey,
      block: lift.block,
      sets: lift.emomMinutes,
      reps: lift.reps ?? '1',
      loadKg: startLoad,
      format,
      notes: `EMOM ${lift.emomMinutes} min.${startLoad ? ` Referencia de partida: ${startLoad} kg.` : ''}${complexNote}${extraNote}`,
    };
  }

  // 3) Esquema de reps con peso a elección
  if (lift.repScheme) {
    const nums = lift.repScheme.split(',').map((n) => n.trim()).filter(Boolean);
    let hint = '';
    if (lift.repRamp && lift.prKey) {
      const [from, to] = lift.repRamp;
      hint = ` Referencia: de ${roundToNearestPlate(base * from)} a ${roundToNearestPlate(base * to)} kg.`;
    }
    return {
      movementId: lift.movementId,
      prKey: lift.prKey,
      block: lift.block,
      sets: nums.length,
      reps: nums.join('-'),
      loadKg: undefined,
      format,
      notes: `Peso a tu elección, reps descendentes (${lift.repScheme}).${hint}${complexNote}${extraNote}`,
    };
  }

  // 4) Serie(s) a % fijo
  if (lift.percent !== undefined && lift.prKey) {
    const load = roundToNearestPlate(base * lift.percent * factor);
    return {
      movementId: lift.movementId,
      prKey: lift.prKey,
      block: lift.block,
      sets: lift.sets ?? 1,
      reps: lift.reps ?? '1',
      loadKg: load,
      format,
      notes: `${lift.sets ?? 1}${lift.sets && lift.sets > 1 ? ' series' : ' serie'} × ${lift.reps ?? '1'} al ${Math.round(lift.percent * 100)}% (${load} kg).${complexNote}${extraNote}`,
    };
  }

  // 5) Accesorio / peso corporal (sets x reps sin carga)
  return {
    movementId: lift.movementId,
    prKey: lift.prKey,
    block: lift.block,
    sets: lift.sets ?? 3,
    reps: lift.reps ?? '10',
    loadKg: undefined,
    format,
    notes: `${lift.sets ?? 3} × ${lift.reps ?? '10'}.${complexNote}${extraNote}`.trim(),
  };
}

/**
 * Resuelve el día de hoy dentro del Ciclo 9: en qué semana (1-6, se queda en la 6 si el atleta
 * alarga la fecha de fin) y cuál de los 5 días toca — mismo índice continuo por días de entreno que
 * usa `resolveHalteroDay`. Con un calendario de menos de 5 días/semana solo se alcanzan los primeros
 * días del ciclo (limitación conocida, igual que en haltero con calendarios que no son múltiplo de 3).
 */
export function resolveMayhemBaseDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): MayhemDayResult | null {
  const weeksElapsed = weeksSinceStart(program.startDate, today);
  const weekIndex = Math.min(weeksElapsed, MAYHEM_BASE_TOTAL_WEEKS - 1);
  const week = MAYHEM_BASE[weekIndex];
  const dayIndex = Math.max(dayPlan.trainingDayIndex, 0) % week.length;
  const day = week[dayIndex];
  const weekNumber = weekIndex + 1;
  const weekLabel = `Mayhem Base · Semana ${weekNumber}/${MAYHEM_BASE_TOTAL_WEEKS}`;

  const lifts = day
    .filter((lift) => getMovementById(lift.movementId))
    .map((lift) => resolveMayhemLift(lift, prs, autoregFactor, weekLabel));

  if (lifts.length === 0) return null;
  return { weekNumber, lifts };
}
