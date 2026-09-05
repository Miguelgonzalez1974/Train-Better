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
export const MAYHEM_TECNICA_TOTAL_WEEKS = 4;
export const MAYHEM_PICO_TOTAL_WEEKS = 8;

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

// --- Ciclo 3 (4 semanas x 4 días) — posiciones, pausas y tempo -----------

const MAYHEM_TECNICA: MayhemWeek[] = [
  // ===== SEMANA 1 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + Pause OHS', movementId: 'pause-overhead-squat', ladder: '67/2×3 75/2×2', complex: ['Snatch push press', 'Pause OHS (3 s abajo)'], note: '(1+1) por serie. Pausa de 3 s en el fondo del OHS.' }),
      snZ({ label: 'Snatch 3 Posiciones', movementId: 'three-position-snatch', percent: 0.7, sets: 5, reps: '1+1+1', note: 'High hang + media rodilla + suelo, sin soltar.' }),
      snZ({ label: 'Tempo Back Squat', movementId: 'tempo-back-squat', block: 'strength', prKey: 'backSquat', percent: 0.65, sets: 5, reps: '5', note: 'Tempo 32X1: 3 s de bajada, 2 s de pausa abajo, subida explosiva, 1 s arriba.' }),
      snZ({ label: 'Snatch Pull', movementId: 'snatch-pull', percent: 0.85, sets: 3, reps: '5' }),
    ],
    // Día 2
    [
      cjZ({ label: 'Push Press + Pause Push Jerk', movementId: 'push-jerk', percent: 0.7, sets: 3, reps: '2+1', note: '+ 2 series de (1+1). Pausa de 2 s en la recepción del jerk.' }),
      cjZ({ label: 'Halting Clean Deadlift a media rodilla', movementId: 'halting-deadlift', block: 'strength', prKey: 'deadlift', percent: 0.8, sets: 3, reps: '3', note: 'Parada de 2 s a media rodilla en la subida.' }),
      cjZ({ label: 'Clean + Jerk', movementId: 'clean-and-jerk', ladder: '65/5×3 70/3×2', complex: ['Clean', 'Jerk', 'Jerk'], note: '(2 clean + 1 jerk + 2 jerk) las 3 primeras cargas, (1+1+1) las 2 últimas.' }),
      clZ({ label: 'Clean Deadlift', movementId: 'clean-deadlift', percent: 0.85, sets: 3, reps: '3' }),
    ],
    // Día 3
    [
      snZ({ label: 'Pause Snatch Balance', movementId: 'snatch-balance', ladder: '65/3×3 75/2×2', note: 'Pausa de 3 s en el fondo.' }),
      snZ({ label: 'Pause Snatch', movementId: 'pause-snatch', ladder: '65/3 75/2×2 85/1×2', note: 'Pausa de 3 s en el fondo de la recepción.' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', ladder: '70/5×2 75/4×2 80/3' }),
    ],
    // Día 4
    [
      cjZ({ label: 'Tall Jerk + Press en split', movementId: 'tall-jerk', sets: 3, reps: '3+3', note: 'Trabajo de recepción del jerk — carga ligera.' }),
      cjZ({ label: 'Dip + Dip + Pause Jerk', movementId: 'split-jerk', ladder: '65/4×3 78/3×2', note: 'Pausa de 3 s en el split del jerk. (1+1+2) las 3 primeras, (1+1+1) las 2 últimas.' }),
      clZ({ label: 'Power Clean + Push Jerk + Jerk', movementId: 'power-clean', ladder: '75/3×2 82/3', complex: ['Power clean', 'Push jerk', 'Split jerk'], note: '(1+1+1) por serie. % sobre tu power clean.' }),
      snZ({ label: 'Snatch Deadlift', movementId: 'snatch-deadlift', percent: 0.92, sets: 3, reps: '5', note: '90-95% del snatch.' }),
    ],
  ],

  // ===== SEMANA 2 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + OHS', movementId: 'overhead-squat', ladder: '70/6×2 80/4×3', complex: ['Snatch push press', 'Overhead squat'], note: '(5+1) las 2 primeras cargas, (3+1) las 3 siguientes.' }),
      snZ({ label: 'Snatch 2 Posiciones (colgado + suelo)', movementId: 'three-position-snatch', percent: 0.72, sets: 4, reps: '1+1' }),
      snZ({ label: 'Back Squat', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', percent: 0.75, sets: 8, reps: '3' }),
      snZ({ label: 'Snatch Pull', movementId: 'snatch-pull', percent: 0.88, sets: 4, reps: '3', note: '85-90% del snatch.' }),
    ],
    // Día 2
    [
      cjZ({ label: 'Push Press + Push Jerk + Push Press', movementId: 'push-press', block: 'strength', percent: 0.62, sets: 4, reps: '1+1+1', note: '% sobre tu clean & jerk.' }),
      cjZ({ label: 'Clean lift-off a 1" + Clean + Jerk', movementId: 'clean-and-jerk', ladder: '72/4×3 82/3×2', complex: ['Clean lift-off (1" del suelo)', 'Clean', 'Jerk'], note: '(2+1+1) las 3 primeras cargas, (1+1+1) las 2 últimas. % sobre tu clean.' }),
      clZ({ label: 'Clean Pull', movementId: 'clean-pull', percent: 0.95, sets: 4, reps: '4', note: '95% de tu mejor clean.' }),
    ],
    // Día 3
    [
      snZ({ label: 'Pause Snatch Balance + Snatch Balance', movementId: 'snatch-balance', percent: 0.7, sets: 5, reps: '1+1', note: '1 con pausa de 3 s + 1 normal por serie.' }),
      snZ({ label: 'Power Snatch + OHS', movementId: 'power-snatch', ladder: '68/4×2 73/3×2 78/2×2', complex: ['Power snatch', 'Overhead squat'], note: '(3+1), luego (2+1), luego (1+1).' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', ladder: '72/5×2 77/4×2 82/3' }),
    ],
    // Día 4
    [
      cjZ({ label: 'Tall Jerk + Jerk Balance + Press en split', movementId: 'tall-jerk', sets: 3, reps: '3+3+3', note: 'Trabajo de recepción — carga ligera.' }),
      cjZ({ label: 'Dip + Jerk + Overhead Hold', movementId: 'split-jerk', percent: 0.85, sets: 5, reps: '1+1', note: '+ hold de 10 s por encima de la cabeza. 80-90% del jerk.' }),
      clZ({ label: 'Power Clean', movementId: 'power-clean', ladder: '72/3×2 80/2×2 88/1×2', note: '2×3 @70-75%, 2×2 @75-85%, 2×1 @85-90% del power clean.' }),
      snZ({ label: 'Snatch Pull', movementId: 'snatch-pull', percent: 0.95, sets: 4, reps: '4', note: '95% de tu mejor snatch.' }),
    ],
  ],

  // ===== SEMANA 3 =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + OHS', movementId: 'overhead-squat', ladder: '88/6×2 92/4×3', complex: ['Snatch push press', 'Overhead squat'], note: '85-95% de tu mejor snatch. (5+1) las 2 primeras, (3+1) las 3 siguientes.' }),
      snZ({ label: 'Snatch High Pull + Power Snatch + Snatch', movementId: 'snatch', ladder: '72/4×2 78/3×3', complex: ['Snatch high pull', 'Power snatch', 'Snatch'], note: '(2+1+1) las 2 primeras cargas, (1+1+1) las 3 siguientes.' }),
      snZ({ label: 'Back Squat — ola 5-3-1', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', ladder: '75/5 82/3 88/1 78/5 85/3 90/1 65/10', note: 'Dos olas de 5-3-1 subiendo + una serie de 10 de back-off.' }),
    ],
    // Día 2
    [
      cjZ({ label: 'Push Press — ola 5-3-1', movementId: 'push-press', block: 'strength', ladder: '55/5 62/3 68/1 58/5 65/3 70/1 48/10', note: 'Dos olas de 5-3-1 + una serie de 10 de back-off. % sobre tu clean & jerk.' }),
      cjZ({ label: 'Clean DL a 1" + Clean Pull + Clean + Jerk', movementId: 'clean-and-jerk', ladder: '72/5×2 82/4×3', complex: ['Clean deadlift (1" del suelo)', 'Clean pull', 'Clean', 'Jerk'], note: '(1+1+1+2) @70-75%, (1+1+1+1) @80-85% del clean.' }),
      clZ({ label: 'Clean Pull', movementId: 'clean-pull', percent: 0.96, sets: 3, reps: '5', note: '95-97% del clean.' }),
    ],
    // Día 3
    [
      snZ({ label: 'Snatch Balance', movementId: 'snatch-balance', ladder: '85/3 88/3 90/2 92/2 94/1 95/1', note: '85-95% del snatch.' }),
      snZ({ label: 'Power Snatch', movementId: 'power-snatch', ladder: '72/3×2 78/2×2 84/1×3' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.95, sets: 5, reps: '3', note: 'Referencia: 90-100% de tu clean.' }),
    ],
    // Día 4
    [
      cjZ({ label: 'Dip + Pause Push Jerk + Jerk desde nuca', movementId: 'split-jerk', percent: 0.75, sets: 3, reps: '1+1+1', note: 'Pausa en el push jerk.' }),
      clZ({ label: 'Pause Power Clean + Jerk', movementId: 'power-clean', ladder: '75/3×2 82/2×3', complex: ['Power clean (pausa en recepción)', 'Jerk'], note: '(2+1) x2, (1+1) x3.' }),
      snZ({ label: 'Snatch Pull', movementId: 'snatch-pull', percent: 0.97, sets: 5, reps: '3', note: '95-100% del snatch.' }),
    ],
  ],

  // ===== SEMANA 4 (prehab de hombro entre series) =====
  [
    // Día 1
    [
      snZ({ label: 'Snatch Push Press + OHS + Snatch Balance', movementId: 'snatch-balance', ladder: '82/6×3 97/3×2', complex: ['Snatch push press', 'Overhead squat', 'Snatch balance'], note: '(3+2+1) @80-85%, (1+1+1) @95-100% del snatch. Entre series: 10 band pull-aparts o Crossover Symmetry (prehab de hombro).' }),
      snZ({ label: 'Snatch 2 Posiciones (bajo rodilla + suelo)', movementId: 'three-position-snatch', percent: 0.68, sets: 5, reps: '1+1' }),
      snZ({ label: 'Back Squat — ola 5-3-1', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', ladder: '78/5 85/3 90/1 80/5 87/3 92/1 65/10 65/10', note: 'Dos olas de 5-3-1 + dos series de 10 de back-off.' }),
    ],
    // Día 2
    [
      cjZ({ label: 'Push Jerk + Jerk', movementId: 'split-jerk', ladder: '78/4×3 88/3×2', note: '(2+2) @75-80%, (2+1) @85-90% del jerk.' }),
      cjZ({ label: 'Clean DL a 1" (pausa 2 s) + Clean DL a medio muslo + Clean + Jerk', movementId: 'clean-and-jerk', ladder: '78/4×2 85/3×3', complex: ['Clean deadlift (1", pausa 2 s)', 'Clean deadlift a medio muslo', 'Clean', 'Jerk'], note: '80-90% del C&J.' }),
      clZ({ label: 'Clean Pull', movementId: 'clean-pull', percent: 1.0, sets: 4, reps: '4', note: '100% del clean.' }),
    ],
    // Día 3
    [
      snZ({ label: 'Snatch Balance — a un tope', movementId: 'snatch-balance', ladder: '80/2 88/2 94/1 100/1', isMaxAttempt: true, note: 'Sube hasta al menos el 100% de tu snatch.' }),
      snZ({ label: 'Power Snatch + Snatch', movementId: 'power-snatch', ladder: '72/3×2 78/2×3', complex: ['Power snatch', 'Snatch'], note: '(2+1) @70-75%, (1+1) @75-80% del snatch.' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.9, sets: 4, reps: '4', note: 'La última serie de 4 al peso de tu 1RM de clean & jerk.' }),
    ],
    // Día 4
    [
      cjZ({ label: 'Jerk Balance + Push Press desde nuca en split', movementId: 'jerk-balance', sets: 3, reps: '3+3', note: 'Trabajo de recepción — carga ligera.' }),
      cjZ({ label: 'Pause Dip (2 s) + Dip + Jerk', movementId: 'split-jerk', percent: 0.78, sets: 4, reps: '1+1+1' }),
      clZ({ label: 'Power Clean + Clean + Jerk', movementId: 'power-clean', ladder: '85/3×3 92/3×2', complex: ['Power clean', 'Clean', 'Jerk'], note: '(1+1+1) por serie. 85-95% del power clean.' }),
      snZ({ label: 'Snatch Pull', movementId: 'snatch-pull', percent: 1.05, sets: 3, reps: '3', note: '105% del snatch.' }),
    ],
  ],
];

// --- Ciclo 4 (8 semanas x 5 días) — peaking / prep de competición --------
// Complejos de tirón largos, "off the blocks" (bloques a la altura de la rodilla), déficit, olas de
// intensidad (sube-baja-sube el % dentro de la serie) y simulacros de "sube a un single pesado en X
// minutos". Semana 8 = MAX OUT en snatch / clean & jerk / front squat.

/** Día 5 estándar del ciclo: simulacro de competición (subir a un single pesado en X minutos). */
const PICO_D5_15_10: MayhemDay = [
  snZ({ label: 'Snatch — single del día (15 min)', movementId: 'snatch', percent: 0.88, sets: 1, reps: '1', note: 'Sube a un single pesado del día en 15 min.' }),
  cjZ({ label: 'Clean & Jerk — single del día (15 min)', movementId: 'clean-and-jerk', percent: 0.88, sets: 1, reps: '1', note: 'Sube a un single pesado del día en 15 min.' }),
  snZ({ label: 'Snatch — single (10 min)', movementId: 'snatch', percent: 0.9, sets: 1, reps: '1', note: 'Otra vez: single pesado en 10 min.' }),
  cjZ({ label: 'Clean & Jerk — single (10 min)', movementId: 'clean-and-jerk', percent: 0.9, sets: 1, reps: '1', note: 'Otra vez: single pesado en 10 min.' }),
  snZ({ label: 'Back Squat — single (6 series)', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', percent: 0.9, sets: 1, reps: '1', note: 'Sube a un single pesado en 6 series.' }),
];

const MAYHEM_PICO: MayhemWeek[] = [
  // ===== SEMANA 1 =====
  [
    [
      snZ({ label: 'Pause Snatch Pull + Power Snatch + Panda Pull + Snatch', movementId: 'snatch', ladder: '60/4×2 65/4×2', complex: ['Pause snatch pull', 'Power snatch', 'Panda pull', 'Snatch'], note: '(1+1+1+1) por serie, sin soltar.' }),
      snZ({ label: 'Snatch', movementId: 'snatch', ladder: '70/3×2 75/2×2 80/1×2' }),
      snZ({ label: 'Snatch Deadlift + High Hang Shrug', movementId: 'snatch-shrug', percent: 0.9, sets: 3, reps: '3+5', note: '(3 snatch deadlift + 5 high-hang shrug) por serie al 90% del snatch.' }),
      snZ({ label: 'In-the-Hole Front Squat', movementId: 'in-the-hole-front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.7, sets: 5, reps: '3', note: 'Pausa larga en el fondo.' }),
    ],
    [
      cjZ({ label: 'Push Press — a un tope (10 min)', movementId: 'push-press', block: 'strength', percent: 0.6, sets: 1, reps: '1', note: 'Sube a un push press pesado en 10 min. % sobre tu clean & jerk.' }),
      cjZ({ label: 'Pause Jerk Dip + Push Jerk + Jerk Dip + Jerk', movementId: 'push-jerk', percent: 0.72, sets: 4, reps: '1+1+1+1', complex: ['Pause jerk dip', 'Push jerk', 'Jerk dip', 'Jerk'], note: '70-75% de tu mejor push jerk.' }),
      clZ({ label: 'Power Clean + Front Squat + Pause Squat Clean + Jerk', movementId: 'power-clean', percent: 0.75, sets: 5, reps: '1+1+1+1', complex: ['Power clean', 'Front squat', 'Pause squat clean', 'Jerk'], note: 'Sube a una serie pesada.' }),
      clZ({ label: 'Clean Deadlift', movementId: 'clean-deadlift', percent: 0.9, sets: 4, reps: '3', note: 'Entre series: KB single-leg RDL 7/pierna.' }),
    ],
    [
      snZ({ label: 'Power Snatch — olas', movementId: 'power-snatch', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 82/1 82/1', note: '% sobre tu power snatch. Los dos últimos singles: 80%+.' }),
      clZ({ label: 'Power Clean + Push Jerk — olas', movementId: 'power-clean', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 82/1 82/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu power clean. Los dos últimos: 80%+.' }),
      snZ({ label: 'Front Squat + Back Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.7, sets: 5, reps: '2+3', complex: ['Front squat', 'Back squat'], note: 'Sube el peso cada serie.' }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (encima de rodilla)', movementId: 'off-blocks-snatch', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 82/1', note: 'Sube, baja y vuelve a subir.' }),
      clZ({ label: 'Clean Pull + Clean + Jerk desde Bloques', movementId: 'off-blocks-clean', percent: 0.75, sets: 5, reps: '1+1+2', complex: ['Clean pull', 'Clean', 'Jerk'], note: 'Sube el peso cada serie. Bloques a la altura de la rodilla.' }),
      clZ({ label: 'Deficit Clean Deadlift (4")', movementId: 'deficit-deadlift', block: 'strength', prKey: 'clean', percent: 0.9, sets: 4, reps: '3', note: 'De pie sobre un disco de 4", agarre de clean.' }),
    ],
    PICO_D5_15_10,
  ],

  // ===== SEMANA 2 =====
  [
    [
      snZ({ label: 'Snatch DL a medio muslo + High Pull (suelo) + Snatch', movementId: 'snatch', ladder: '65/3 70/3 75/3', complex: ['Snatch deadlift a medio muslo', 'Snatch high pull (desde suelo)', 'Snatch'], note: '(1+1+1) por serie.' }),
      snZ({ label: 'Snatch High Pull + Snatch', movementId: 'snatch', percent: 0.82, sets: 1, reps: '1+1', complex: ['Snatch high pull', 'Snatch'], note: '80-85% del snatch.' }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 0.95, sets: 5, reps: '3', note: 'Entre series: 10 single-arm DB deadlift (DB por fuera de los pies).' }),
      snZ({ label: 'In-the-Hole Front Squat', movementId: 'in-the-hole-front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.75, sets: 6, reps: '2', note: 'Entre series: 5 tall box jumps.' }),
    ],
    [
      cjZ({ label: 'Pause Clean + Clean + Jerk Dip + Jerk', movementId: 'clean-and-jerk', percent: 0.75, sets: 3, reps: '1+1+1+1', complex: ['Pause clean', 'Clean', 'Jerk dip', 'Jerk'] }),
      cjZ({ label: 'Clean & Jerk — 4 singles', movementId: 'clean-and-jerk', percent: 0.85, sets: 4, reps: '1', note: 'Sube en peso desde el complejo anterior.' }),
      clZ({ label: '3-Position Halting Clean Deadlift', movementId: 'halting-deadlift', block: 'strength', prKey: 'clean', percent: 0.95, sets: 5, reps: '3', note: '3 posiciones con parada. 90-100% del clean.' }),
    ],
    [
      snZ({ label: 'Power Snatch — olas', movementId: 'power-snatch', ladder: '70/3 75/2 80/1 75/3 80/2 85/1 87/1 87/1', note: '% sobre tu power snatch. Los dos últimos: 85%+.' }),
      clZ({ label: 'Power Clean + Push Jerk — olas', movementId: 'power-clean', ladder: '70/3 75/2 80/1 75/3 80/2 80/1 82/1 82/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu power clean.' }),
      snZ({ label: 'Front Squat + Back Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.72, sets: 5, reps: '3+3', complex: ['Front squat', 'Back squat'] }),
    ],
    [
      cjZ({ label: 'Jerk desde nuca — a un tope (10 min)', movementId: 'split-jerk', percent: 0.8, sets: 1, reps: '1', note: 'Sube a un jerk desde nuca pesado en 10 min.' }),
      snZ({ label: 'Power Snatch + Snatch desde Bloques (media rodilla)', movementId: 'off-blocks-snatch', percent: 0.75, sets: 5, reps: '1+1', complex: ['Power snatch', 'Snatch'] }),
      clZ({ label: 'Clean High Pull + Clean + Jerk desde Bloques', movementId: 'off-blocks-clean', percent: 0.75, sets: 5, reps: '1+1+2', complex: ['Clean high pull', 'Clean', 'Jerk'], note: 'Sube el peso cada serie.' }),
      clZ({ label: 'Deficit Clean Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'clean', percent: 0.95, sets: 4, reps: '3' }),
    ],
    PICO_D5_15_10,
  ],

  // ===== SEMANA 3 =====
  [
    [
      snZ({ label: 'Snatch Pull + High Pull + Snatch', movementId: 'snatch', ladder: '70/3 75/3 80/3', complex: ['Snatch pull', 'Snatch high pull', 'Snatch'], note: '(1+1+1) por serie.' }),
      snZ({ label: 'Snatch Pull + Snatch', movementId: 'snatch', ladder: '82/2 88/2', complex: ['Snatch pull', 'Snatch'], note: '(1+1): 80-85% y luego 85-90%.' }),
      snZ({ label: 'Snatch — 3 singles', movementId: 'snatch', percent: 0.92, sets: 3, reps: '1', note: '90-95% del snatch.' }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.0, sets: 4, reps: '3', note: '100% de tu mejor snatch.' }),
      snZ({ label: 'In-the-Hole FS + 1¼ FS + FS', movementId: 'in-the-hole-front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.9, sets: 6, reps: '1+1+1', complex: ['In-the-hole front squat', '1¼ front squat', 'Front squat'], note: 'Referencia: 85-100% de tu clean.' }),
    ],
    [
      cjZ({ label: 'DL a medio muslo + Pause Clean (3s) + Clean + Jerk Dip + Jerk', movementId: 'clean-and-jerk', percent: 0.7, sets: 3, reps: '1+1+1+1+1', complex: ['Deadlift a medio muslo', 'Pause clean (3s recepción)', 'Clean', 'Jerk dip', 'Jerk'], note: '65-75% del clean.' }),
      cjZ({ label: 'Clean DL a medio muslo + Clean + Jerk — 4 singles', movementId: 'clean-and-jerk', percent: 0.85, sets: 4, reps: '1', complex: ['Clean deadlift a medio muslo', 'Clean', 'Jerk'], note: '80-90% del clean.' }),
      clZ({ label: '3-Position Halting Clean Deadlift', movementId: 'halting-deadlift', block: 'strength', prKey: 'clean', percent: 1.02, sets: 5, reps: '3', note: '100-105% del clean.' }),
    ],
    [
      snZ({ label: 'Power Snatch — olas con descansos', movementId: 'power-snatch', ladder: '70/3 75/2 80/1 75/3 80/2 85/1 87/1 87/1', note: 'Descanso 2 min tras cada tramo de 3, 1 min antes de cada single final. % sobre tu power snatch.' }),
      clZ({ label: 'Clean desde encima de rodilla + Jerk', movementId: 'hang-clean', percent: 0.85, sets: 5, reps: '1+1', complex: ['Clean desde encima de rodilla', 'Jerk'], note: '80-90% de tu power clean.' }),
      snZ({ label: 'Front Squat + Back Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.75, sets: 5, reps: '2+2', complex: ['Front squat', 'Back squat'], note: 'Sube el peso cada serie.' }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (medio muslo) — olas', movementId: 'off-blocks-snatch', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 82/1', note: '% sobre tu snatch.' }),
      clZ({ label: 'Power Clean + Push Jerk desde Bloques — olas', movementId: 'off-blocks-clean', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 82/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu clean.' }),
      clZ({ label: 'Deficit Clean Deadlift (4")', movementId: 'deficit-deadlift', block: 'strength', prKey: 'clean', percent: 0.95, sets: 4, reps: '3' }),
    ],
    [
      snZ({ label: 'Snatch — single del día (15 min)', movementId: 'snatch', percent: 0.9, sets: 1, reps: '1', note: 'Sube a un single pesado del día en 15 min.' }),
      cjZ({ label: 'Clean & Jerk — single del día (15 min)', movementId: 'clean-and-jerk', percent: 0.9, sets: 1, reps: '1', note: 'Sube a un single pesado del día en 15 min.' }),
      snZ({ label: 'Snatch — 2º intento (10 min)', movementId: 'snatch', percent: 0.93, sets: 1, reps: '1', note: 'Segundo intento: single pesado en 10 min.' }),
      snZ({ label: 'Back Squat — single (6 series)', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', percent: 0.92, sets: 6, reps: '1', note: 'Sube a un single pesado en 6 series.' }),
    ],
  ],

  // ===== SEMANA 4 ("sube si te sientes bien") =====
  [
    [
      snZ({ label: 'Snatch Pull a medio muslo + Snatch', movementId: 'snatch', percent: 0.75, sets: 5, reps: '1+1', complex: ['Snatch pull a medio muslo', 'Snatch'] }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.05, sets: 3, reps: '3', note: '105% de tu mejor snatch.' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.8, sets: 6, reps: '2' }),
    ],
    [
      clZ({ label: 'Power Clean + Jerk Dip + Jerk', movementId: 'power-clean', percent: 0.72, sets: 3, reps: '1+1+1', complex: ['Power clean', 'Jerk dip', 'Jerk'] }),
      clZ({ label: 'Power Clean + Jerk', movementId: 'power-clean', percent: 0.78, sets: 3, reps: '1+1', complex: ['Power clean', 'Jerk'], note: 'Si te sientes bien, sube el peso.' }),
    ],
    [
      snZ({ label: 'Power Snatch', movementId: 'power-snatch', ladder: '72/3 75/3 80/2 84/2 88/1 90/1', note: 'Sube a 80-90% de tu power snatch.' }),
      clZ({ label: 'Clean (1" del suelo, de arriba a abajo) + Jerk', movementId: 'clean-and-jerk', percent: 0.82, sets: 5, reps: '1+1', complex: ['Clean (1" del suelo, top-down)', 'Jerk'], note: '80-85% del clean.' }),
      snZ({ label: 'Front Squat + Back Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.82, sets: 5, reps: '1+2', complex: ['Front squat', 'Back squat'], note: '80-85% del front squat.' }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (encima de rodilla)', movementId: 'off-blocks-snatch', ladder: '60/3 65/2 70/1 65/3 70/2 75/1 75/1', note: '% sobre tu snatch.' }),
      clZ({ label: 'Power Clean + Push Jerk — olas', movementId: 'power-clean', ladder: '65/2 70/2 75/1 70/2 75/2 75/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu power clean.' }),
      clZ({ label: 'Deficit Clean Deadlift (4")', movementId: 'deficit-deadlift', block: 'strength', prKey: 'clean', percent: 1.0, sets: 3, reps: '3' }),
    ],
    [
      snZ({ label: 'Snatch — 3 singles', movementId: 'snatch', percent: 0.82, sets: 3, reps: '1', note: 'Sube a 80-85% y haz 3 singles ahí.' }),
      cjZ({ label: 'Clean & Jerk — 2 singles', movementId: 'clean-and-jerk', percent: 0.82, sets: 2, reps: '1', note: 'Sube a 80-85% y haz 2 singles ahí.' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.9, sets: 3, reps: '1', note: 'Referencia: 100% de tu clean.' }),
    ],
  ],

  // ===== SEMANA 5 =====
  [
    [
      snZ({ label: 'Snatch DL bajo rodilla + Snatch Pull (pausa 1s arriba) + Snatch', movementId: 'snatch', percent: 0.75, sets: 4, reps: '1+1+1', complex: ['Snatch deadlift bajo rodilla', 'Snatch pull (pausa 1s arriba)', 'Snatch'], note: '70-80% del snatch.' }),
      snZ({ label: 'Snatch DL bajo rodilla + Snatch', movementId: 'snatch', percent: 0.82, sets: 3, reps: '1+1', complex: ['Snatch deadlift bajo rodilla', 'Snatch'], note: '80-85% del snatch.' }),
      snZ({ label: 'Snatch Deadlift', movementId: 'snatch-deadlift', percent: 1.0, sets: 3, reps: '3', note: '100% de tu mejor snatch.' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.72, sets: 5, reps: '5', note: 'Entre series: 5 tall box jumps.' }),
    ],
    [
      cjZ({ label: 'Clean DL bajo rodilla + Clean DL a medio muslo + Clean + Jerk', movementId: 'clean-and-jerk', percent: 0.8, sets: 5, reps: '1+1+1+1', complex: ['Clean deadlift bajo rodilla', 'Clean deadlift a medio muslo', 'Clean', 'Jerk'], note: '70-85% del C&J.' }),
      cjZ({ label: 'Clean & Jerk — 3 singles', movementId: 'clean-and-jerk', percent: 0.88, sets: 3, reps: '1', note: '85-90% del C&J.' }),
      dl({ label: 'Peso Muerto', movementId: 'deadlift', percent: 0.7, sets: 5, reps: '5', note: 'Entre series: 5 KB single-leg deadlift/pierna.' }),
    ],
    [
      snZ({ label: 'Power Snatch + Snatch Balance + Snatch', movementId: 'power-snatch', percent: 0.8, sets: 5, reps: '1+1+1', complex: ['Power snatch', 'Snatch balance', 'Snatch'], note: '75-85% del power snatch.' }),
      clZ({ label: 'Power Clean + Clean + Jerk + Jerk desde nuca', movementId: 'power-clean', percent: 0.8, sets: 4, reps: '1+1+1+1', complex: ['Power clean', 'Clean', 'Jerk', 'Jerk desde nuca'], note: '75-85% del power clean.' }),
      snZ({ label: 'Back Squat + Front Squat', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', percent: 0.75, sets: 5, reps: '5+1', complex: ['Back squat', 'Front squat'] }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (encima de rodilla) — olas', movementId: 'off-blocks-snatch', ladder: '70/3 75/2 80/1 75/3 80/2 85/1 87/1', note: '% sobre tu snatch.' }),
      clZ({ label: 'Clean desde Bloques + Jerk — olas', movementId: 'off-blocks-clean', ladder: '70/2 75/2 80/1 75/2 80/2 85/1 87/1', complex: ['Clean', 'Jerk'], note: '% sobre tu clean.' }),
      snZ({ label: 'Deficit Snatch Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.0, sets: 3, reps: '3' }),
    ],
    PICO_D5_15_10,
  ],

  // ===== SEMANA 6 (4 días) =====
  [
    [
      snZ({ label: 'Snatch DL media rodilla + Snatch DL medio muslo + Snatch', movementId: 'snatch', percent: 0.78, sets: 3, reps: '1+1+1', complex: ['Snatch deadlift a media rodilla', 'Snatch deadlift a medio muslo', 'Snatch'], note: '75-80% del snatch.' }),
      snZ({ label: 'Snatch DL medio muslo + Snatch', movementId: 'snatch', percent: 0.85, sets: 3, reps: '1+1', complex: ['Snatch deadlift a medio muslo', 'Snatch'], note: '80-87% del snatch.' }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.05, sets: 3, reps: '3', note: '105% de tu mejor snatch.' }),
      snZ({ label: 'In-the-Hole Front Squat', movementId: 'in-the-hole-front-squat', block: 'strength', prKey: 'frontSquat', ladder: '78/3 80/3 84/2 86/2 90/1 92/1 93/1' }),
    ],
    [
      cjZ({ label: 'Pause Clean (3s) + Clean + Pause Jerk (3s)', movementId: 'clean-and-jerk', percent: 0.72, sets: 3, reps: '1+1+1', complex: ['Pause clean (3s recepción)', 'Clean', 'Pause jerk (3s recepción)'], note: '70-75% del C&J.' }),
      cjZ({ label: 'Clean & Jerk — 3 singles', movementId: 'clean-and-jerk', percent: 0.9, sets: 3, reps: '1', note: 'Sube en peso desde el complejo (80-95% del C&J).' }),
      dl({ label: 'Peso Muerto', movementId: 'deadlift', percent: 0.75, sets: 4, reps: '4', note: 'Más pesado que las series de 5 de la semana pasada.' }),
    ],
    [
      snZ({ label: 'Power Snatch directo a OHS (pausa 1s)', movementId: 'power-snatch', ladder: '60/3 65/3 70/2 75/2 80/1 80/1', complex: ['Power snatch', 'Overhead squat'], note: 'Pausa 1s en la recepción y luego squat. % sobre tu power snatch.' }),
      clZ({ label: 'Power Clean + Push Jerk — olas', movementId: 'power-clean', ladder: '70/2 75/2 80/1 75/2 80/2 85/1 80/2 90/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu power clean.' }),
      snZ({ label: 'Front Squat + Back Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.75, sets: 5, reps: '3+3', complex: ['Front squat', 'Back squat'] }),
    ],
    PICO_D5_15_10,
  ],

  // ===== SEMANA 7 =====
  [
    [
      snZ({ label: 'Snatch Pull + High Pull + Snatch', movementId: 'snatch', percent: 0.82, sets: 5, reps: '1+1+1', complex: ['Snatch pull', 'Snatch high pull', 'Snatch'], note: 'Sube de 65-70% a 80-85% a lo largo de las series.' }),
      snZ({ label: 'Snatch — 3 singles', movementId: 'snatch', percent: 0.9, sets: 3, reps: '1', note: '85-93% del snatch.' }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.05, sets: 3, reps: '3' }),
      snZ({ label: 'FS + 1¼ FS + FS', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 1.0, sets: 5, reps: '1+1+1', complex: ['Front squat', '1¼ front squat', 'Front squat'], note: 'Referencia: 90-110% de tu clean.' }),
    ],
    [
      cjZ({ label: 'DL a 1" + DL media rodilla + DL medio muslo + Clean + Jerk', movementId: 'clean-and-jerk', percent: 0.78, sets: 3, reps: '1+1+1+1+1', complex: ['Deadlift a 1"', 'Deadlift a media rodilla', 'Deadlift a medio muslo', 'Clean', 'Jerk'], note: '70-80% del C&J.' }),
      cjZ({ label: 'Clean DL medio muslo + Clean + Jerk — 4 singles', movementId: 'clean-and-jerk', percent: 0.9, sets: 4, reps: '1', complex: ['Clean deadlift a medio muslo', 'Clean', 'Jerk'], note: '85-95% del C&J.' }),
      dl({ label: 'Peso Muerto', movementId: 'deadlift', percent: 0.82, sets: 4, reps: '3', note: 'Más pesado que la serie de 4 de la semana pasada.' }),
    ],
    [
      snZ({ label: 'Power Snatch + Pause Snatch (3s)', movementId: 'power-snatch', percent: 0.78, sets: 4, reps: '1+1', complex: ['Power snatch', 'Pause snatch (3s recepción)'], note: '70-80% del snatch.' }),
      cjZ({ label: 'Clean (1" del suelo, top-down) + Jerk', movementId: 'clean-and-jerk', percent: 0.88, sets: 4, reps: '1+1', complex: ['Clean (1" del suelo, top-down)', 'Jerk'], note: '80-95% del C&J.' }),
      snZ({ label: 'Front Squat + Back Squat + Goblet Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 0.75, sets: 5, reps: '2+2+10', complex: ['Front squat', 'Back squat', 'Goblet squat'] }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (encima de rodilla) — olas', movementId: 'off-blocks-snatch', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 85/1', note: '% sobre tu snatch.' }),
      clZ({ label: 'Power Clean + Push Jerk desde Bloques — olas', movementId: 'off-blocks-clean', ladder: '65/3 70/2 75/1 70/3 75/2 80/1 80/1 80/1', complex: ['Power clean', 'Push jerk'], note: '% sobre tu clean.' }),
      snZ({ label: 'Deficit Snatch Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.05, sets: 3, reps: '3' }),
    ],
    [
      snZ({ label: 'Snatch — single (10 min)', movementId: 'snatch', percent: 0.92, sets: 1, reps: '1', note: 'Sube a un single pesado en 10 min.' }),
      cjZ({ label: 'Clean & Jerk — single (10 min)', movementId: 'clean-and-jerk', percent: 0.92, sets: 1, reps: '1', note: 'Sube a un single pesado en 10 min.' }),
      snZ({ label: 'Snatch — single (5 min)', movementId: 'snatch', percent: 0.95, sets: 1, reps: '1', note: 'Otra vez: single pesado en 5 min.' }),
      cjZ({ label: 'Clean & Jerk — single (5 min)', movementId: 'clean-and-jerk', percent: 0.95, sets: 1, reps: '1', note: 'Otra vez: single pesado en 5 min.' }),
      snZ({ label: 'Back Squat — single (6 series)', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', percent: 0.93, sets: 1, reps: '1', note: 'Sube a un single pesado en 6 series.' }),
    ],
  ],

  // ===== SEMANA 8 (MAX OUT) =====
  [
    [
      snZ({ label: 'Snatch DL a medio muslo + Snatch', movementId: 'snatch', percent: 0.78, sets: 5, reps: '1+1', complex: ['Snatch deadlift a medio muslo', 'Snatch'], note: '75-80% del snatch.' }),
      snZ({ label: 'Snatch Deficit Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.05, sets: 3, reps: '3' }),
      snZ({ label: 'Front Squat', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', ladder: '78/5 83/4 88/3 92/2 95/1', note: 'Sube a un peso exigente.' }),
    ],
    [
      clZ({ label: 'Power Clean + Jerk + Power Clean', movementId: 'power-clean', percent: 0.78, sets: 3, reps: '1+1+1', complex: ['Power clean', 'Jerk', 'Power clean'], note: '75-80% del power clean.' }),
      clZ({ label: 'Power Clean & Jerk', movementId: 'power-clean', percent: 0.82, sets: 3, reps: '1+1', complex: ['Power clean', 'Jerk'], note: '80-85% del power clean.' }),
      dl({ label: 'Peso Muerto — a un tope (10 min)', movementId: 'deadlift', percent: 0.85, sets: 1, reps: '1', note: 'Sube a un single pesado en 10 min.' }),
    ],
    [
      snZ({ label: 'Power Snatch — a un tope', movementId: 'power-snatch', ladder: '72/3 75/3 80/2 84/2 88/1 92/1', note: 'Sube a un single pesado.' }),
      cjZ({ label: 'Clean (1" del suelo, top-down) + Jerk', movementId: 'clean-and-jerk', percent: 0.8, sets: 3, reps: '1+1', complex: ['Clean (1" del suelo, top-down)', 'Jerk'], note: '80% del C&J.' }),
      snZ({ label: 'Back Squat — a un tope', movementId: 'back-squat', block: 'strength', prKey: 'backSquat', ladder: '78/5 83/4 88/3 92/2 96/1', note: 'Sube a un single pesado.' }),
    ],
    [
      snZ({ label: 'Snatch desde Bloques (medio muslo) — 3 singles', movementId: 'off-blocks-snatch', percent: 0.78, sets: 3, reps: '1', note: 'Sube a 70-80% y haz 3 singles ahí.' }),
      clZ({ label: 'Power Clean desde Bloques (medio muslo) + Jerk — 3 singles', movementId: 'off-blocks-clean', percent: 0.78, sets: 3, reps: '1+1', complex: ['Power clean', 'Jerk'], note: 'Sube a 75-80% y haz 3 singles ahí.' }),
      snZ({ label: 'Deficit Snatch Deadlift', movementId: 'deficit-deadlift', block: 'strength', prKey: 'snatch', percent: 1.0, sets: 3, reps: '3' }),
    ],
    [
      snZ({ label: 'Snatch — MAX OUT', movementId: 'snatch', percent: 1.0, isMaxAttempt: true, sets: 1, reps: '1', note: 'Día de MAX OUT — busca un nuevo 1RM de snatch.' }),
      cjZ({ label: 'Clean & Jerk — MAX OUT', movementId: 'clean-and-jerk', percent: 1.0, isMaxAttempt: true, sets: 1, reps: '1', note: 'Día de MAX OUT — busca un nuevo 1RM de clean & jerk.' }),
      snZ({ label: 'Front Squat — MAX OUT', movementId: 'front-squat', block: 'strength', prKey: 'frontSquat', percent: 1.0, isMaxAttempt: true, sets: 1, reps: '1', note: 'Día de MAX OUT — busca un nuevo 1RM de front squat.' }),
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
 * Resuelve el día de hoy dentro de un ciclo Mayhem: en qué semana (se queda en la última si el
 * atleta alarga la fecha de fin) y cuál de los días toca — mismo índice continuo por días de entreno
 * que usa `resolveHalteroDay`. Con un calendario de menos días/semana que el ciclo solo se alcanzan
 * los primeros días (limitación conocida, igual que en haltero con calendarios no múltiplo de 3).
 */
function resolveMayhemCycleDay(
  cycle: MayhemWeek[],
  totalWeeks: number,
  cycleName: string,
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): MayhemDayResult | null {
  const weeksElapsed = weeksSinceStart(program.startDate, today);
  const weekIndex = Math.min(weeksElapsed, totalWeeks - 1);
  const week = cycle[weekIndex];
  const dayIndex = Math.max(dayPlan.trainingDayIndex, 0) % week.length;
  const day = week[dayIndex];
  const weekNumber = weekIndex + 1;
  const weekLabel = `${cycleName} · Semana ${weekNumber}/${totalWeeks}`;

  const lifts = day
    .filter((lift) => getMovementById(lift.movementId))
    .map((lift) => resolveMayhemLift(lift, prs, autoregFactor, weekLabel));

  if (lifts.length === 0) return null;
  return { weekNumber, lifts };
}

/** Día de hoy en el Ciclo 9 ("mayhem-base", 6 semanas). */
export function resolveMayhemBaseDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): MayhemDayResult | null {
  return resolveMayhemCycleDay(MAYHEM_BASE, MAYHEM_BASE_TOTAL_WEEKS, 'Mayhem Base', program, dayPlan, prs, autoregFactor, today);
}

/** Día de hoy en el Ciclo 3 ("mayhem-tecnica", 4 semanas de pausas, tempo y posiciones). */
export function resolveMayhemTecnicaDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): MayhemDayResult | null {
  return resolveMayhemCycleDay(MAYHEM_TECNICA, MAYHEM_TECNICA_TOTAL_WEEKS, 'Mayhem Técnica', program, dayPlan, prs, autoregFactor, today);
}

/** Día de hoy en el Ciclo 4 ("mayhem-pico", 8 semanas de peaking, termina en MAX OUT). */
export function resolveMayhemPicoDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): MayhemDayResult | null {
  return resolveMayhemCycleDay(MAYHEM_PICO, MAYHEM_PICO_TOTAL_WEEKS, 'Mayhem Pico', program, dayPlan, prs, autoregFactor, today);
}
