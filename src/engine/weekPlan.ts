import type { MovementPattern } from '../data/movements/types';
import { resolveDayEmphasis, type OlyFamily } from './periodization';
import { stalledOlyFamily, stalledStrengthPattern, type ResponseProfile } from './responseProfile';
import { PHASE_DOMINANT_ENERGY, type EnergySystem } from './wodDomains';

/**
 * Planificador de microciclo: en vez de decidir cada dia en aislamiento (ciclo crudo de patron +
 * parche reactivo de "esta semana falta X"), reparte los patrones de fuerza y las familias de oly
 * sobre LA SEMANA ENTERA de una vez — como hace un coach de verdad: primero dibuja la semana
 * (cuantas sentadillas, cuantas bisagras, familias de oly alternadas, mismo patron nunca en dias
 * seguidos), luego se rellena cada dia.
 *
 * Es una CAPA DE PREFERENCIA, no un reemplazo: `generateDailySession` pasa el patron/familia
 * planificados a `buildStrengthBlock`/`buildOlyBlock` como base, y encima siguen actuando por dia
 * el forzado por objetivo, la sustitucion por dolor, el anti-repeticion entre semanas y toda la
 * autorregulacion. Sin macrociclo activo no se construye plan y el motor cae al comportamiento
 * anterior exacto.
 *
 * Determinista por `${macroId}:${weekNumber}`: la semana es estable (regenerar un dia no rebaraja
 * el resto) pero cada semana del macro sale distinta.
 */

export interface MicrocyclePlan {
  weekNumber: number;
  phase: 1 | 2 | 3 | 4;
  /** Patron de fuerza por `trainingDayIndex` (0..n-1). Los slots que no haran fuerza (dia de solo
   *  metcon, dia de recuperacion de n=6) tambien llevan uno — se ignora aguas abajo. */
  strengthPattern: MovementPattern[];
  /** Familia de oly por `trainingDayIndex`. */
  olyFamily: OlyFamily[];
  /** Sistema energetico del WOD por `trainingDayIndex` — rota alrededor del dominante de la fase para
   *  que dos dias seguidos no repitan estimulo metabolico. Los slots sin WOD (recuperacion de n=6)
   *  llevan el dominante como relleno inocuo. */
  energySystem: EnergySystem[];
}

/** Los 4 patrones que el bloque de fuerza cicla (STRENGTH_PATTERN_CYCLE). */
type StrengthPattern = 'squat' | 'hinge' | 'verticalPush' | 'horizontalPush';
const STRENGTH_PATTERNS: StrengthPattern[] = ['squat', 'hinge', 'verticalPush', 'horizontalPush'];
const isStrengthPattern = (p: MovementPattern): p is StrengthPattern =>
  (STRENGTH_PATTERNS as MovementPattern[]).includes(p);

/**
 * Peso relativo de cada patron por fase — cuanto "presupuesto" de sesiones de fuerza se lleva a la
 * semana. Acumulacion carga mas la sentadilla y la bisagra (base de volumen); hacia el pico y en
 * descarga se aplana.
 */
const PATTERN_WEIGHT: Record<1 | 2 | 3 | 4, Record<StrengthPattern, number>> = {
  1: { squat: 4, hinge: 3, verticalPush: 2, horizontalPush: 2 },
  2: { squat: 3, hinge: 2, verticalPush: 2, horizontalPush: 2 },
  3: { squat: 3, hinge: 2, verticalPush: 2, horizontalPush: 2 },
  4: { squat: 2, hinge: 2, verticalPush: 2, horizontalPush: 2 },
};

/** Hash de string -> semilla de 32 bits (para el PRNG determinista de la semana). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG determinista pequeño. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Reordena la bolsa para que no queden dos elementos iguales seguidos siempre que sea posible. */
function spaceOut<T>(bag: T[]): T[] {
  const remaining = [...bag];
  const out: T[] = [];
  while (remaining.length > 0) {
    let pick = remaining.findIndex((p) => p !== out[out.length - 1]);
    if (pick === -1) pick = 0; // solo queda el mismo elemento: no hay mas remedio
    out.push(remaining[pick]);
    remaining.splice(pick, 1);
  }
  return out;
}

/**
 * Menu de sistemas energeticos por fase, en orden de prioridad. El primero es el dominante de la
 * fase (mismo que `PHASE_DOMINANT_ENERGY`); los siguientes son los contrastes que la semana rota
 * para no encadenar el mismo estimulo. La cobertura la marca el conjunto de sistemas distintos del
 * menu; los dias que sobren se rellenan con el dominante.
 *  - Acumulacion: base aerobica manda, con un dia de umbral y uno de potencia para no perder chispa.
 *  - Intensificacion: umbral manda, potencia arriba y un dia aerobico de descarga activa.
 *  - Pico: potencia manda, umbral como unico contraste — nada de dias largos aerobicos esta semana.
 *  - Descarga: casi todo recuperacion, algun dia de aerobico continuo algo mas largo.
 */
const PHASE_ENERGY_MENU: Record<1 | 2 | 3 | 4, EnergySystem[]> = {
  1: ['base-aerobica', 'umbral', 'potencia'],
  2: ['umbral', 'potencia', 'base-aerobica'],
  3: ['potencia', 'umbral'],
  4: ['recuperacion', 'base-aerobica'],
};

/**
 * Reordena por conteo: en cada paso coloca el elemento con mas repeticiones pendientes que no sea el
 * ultimo colocado. Optimo para "no dos iguales seguidos" cuando es alcanzable (el `spaceOut` greedy
 * de arriba, pensado para repartos casi planos como los patrones de fuerza, deja adyacencias
 * evitables cuando un elemento domina 3:1 como pasa en los menus de energia).
 */
function spaceOutByCount<T>(bag: T[]): T[] {
  const counts = new Map<T, number>();
  for (const x of bag) counts.set(x, (counts.get(x) ?? 0) + 1);
  const out: T[] = [];
  while (out.length < bag.length) {
    const last = out[out.length - 1];
    const live = [...counts.entries()].filter(([, c]) => c > 0);
    const avoidingLast = live.filter(([x]) => x !== last);
    const [pick] = (avoidingLast.length > 0 ? avoidingLast : live).sort((a, b) => b[1] - a[1])[0];
    out.push(pick);
    counts.set(pick, counts.get(pick)! - 1);
  }
  return out;
}

/** `trainingDayIndex` de los dias que haran WOD generado esta semana — todos menos el de recuperacion de n=6. */
function wodDoingSlots(n: 3 | 4 | 5 | 6): number[] {
  const recoveryIdx = n === 6 ? 3 : -1;
  const slots: number[] = [];
  for (let idx = 0; idx < n; idx++) if (idx !== recoveryIdx) slots.push(idx);
  return slots;
}

/**
 * Reparte los sistemas energeticos sobre los dias de WOD de la semana: cubre cada sistema del menu
 * de la fase, rellena los dias sobrantes con el dominante, baraja de forma determinista y separa
 * iguales adyacentes para que dos dias seguidos no lleven el mismo estimulo metabolico.
 */
function allocateEnergySystems(wodSlotCount: number, phase: 1 | 2 | 3 | 4, rand: () => number): EnergySystem[] {
  if (wodSlotCount <= 0) return [];
  const menu = PHASE_ENERGY_MENU[phase];
  const bag: EnergySystem[] = [...new Set(menu)].slice(0, wodSlotCount);
  while (bag.length < wodSlotCount) bag.push(menu[0]);
  return spaceOutByCount(shuffle(bag, rand));
}

/**
 * Sistema energetico del WOD por `trainingDayIndex` para una semana concreta del macrociclo. La fase
 * fija el dominante (`PHASE_DOMINANT_ENERGY`) y los dias de WOD rotan a su alrededor (ver
 * `PHASE_ENERGY_MENU`). Los slots sin WOD generado (dia de recuperacion de n=6) llevan el dominante
 * como relleno inocuo.
 *
 * PRNG propio sembrado en `${macroId}:${weekNumber}:energy` — NO comparte el flujo con el reparto de
 * fuerza/oly, asi que este resultado se puede reconstruir para cualquier semana pasada o futura solo
 * con `(macroId, weekNumber, phase, trainingDaysPerWeek)`, sin conocer el estado del atleta ese dia.
 * Eso lo usa el Dashboard (`conditioningBalance.ts`) para el reparto planificado del bloque.
 */
export function planEnergySystems(
  macroId: string,
  weekNumber: number,
  phase: 1 | 2 | 3 | 4,
  trainingDaysPerWeek: 3 | 4 | 5 | 6,
): EnergySystem[] {
  const rand = mulberry32(hashSeed(`${macroId}:${weekNumber}:energy`));
  const wodSlots = wodDoingSlots(trainingDaysPerWeek);
  const allocated = allocateEnergySystems(wodSlots.length, phase, rand);
  const out: EnergySystem[] = Array.from({ length: trainingDaysPerWeek }, () => PHASE_DOMINANT_ENERGY[phase]);
  wodSlots.forEach((slotIdx, i) => {
    out[slotIdx] = allocated[i];
  });
  return out;
}

/** `trainingDayIndex` de los slots que de verdad haran bloque de fuerza esta semana. */
function strengthDoingSlots(n: 3 | 4 | 5 | 6, phase: 1 | 2 | 3 | 4, weekNumber: number): number[] {
  const recoveryIdx = n === 6 ? 3 : -1;
  const slots: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    if (idx === recoveryIdx) continue;
    // La primera semana del macro va completa (mixto todos los dias); el resto sigue el reparto de fase.
    const emphasis = weekNumber === 1 ? 'mixto' : resolveDayEmphasis(phase, idx, n);
    if (emphasis !== 'metcon') slots.push(idx);
  }
  return slots;
}

function allocatePatterns(
  slotCount: number,
  phase: 1 | 2 | 3 | 4,
  responseProfile: ResponseProfile,
  avoidedPatterns: Set<MovementPattern>,
  goalForcedPattern: StrengthPattern | null,
  rand: () => number,
): StrengthPattern[] {
  if (slotCount <= 0) return [];

  const weight: Record<StrengthPattern, number> = { ...PATTERN_WEIGHT[phase] };
  for (const p of STRENGTH_PATTERNS) if (avoidedPatterns.has(p)) weight[p] = 0;
  const stalled = stalledStrengthPattern(responseProfile);
  if (stalled && isStrengthPattern(stalled) && weight[stalled] > 0) weight[stalled] += 2;
  if (goalForcedPattern && !avoidedPatterns.has(goalForcedPattern)) weight[goalForcedPattern] += 2;

  const avail = STRENGTH_PATTERNS.filter((p) => weight[p] > 0);
  if (avail.length === 0) {
    // Todos los patrones bajo aviso de dolor (extremo) — reparto plano, la sustitucion por dolor de
    // `buildStrengthBlock` se encarga dia a dia.
    return Array.from({ length: slotCount }, (_, i) => STRENGTH_PATTERNS[i % STRENGTH_PATTERNS.length]);
  }

  const totalW = avail.reduce((s, p) => s + weight[p], 0);
  const counts = new Map<StrengthPattern, number>();
  for (const p of avail) counts.set(p, Math.max(0, Math.round((weight[p] / totalW) * slotCount)));

  const sum = () => [...counts.values()].reduce((s, c) => s + c, 0);
  // Ajuste de redondeo hasta cuadrar con slotCount.
  while (sum() > slotCount) {
    const p = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    counts.set(p, counts.get(p)! - 1);
  }
  while (sum() < slotCount) {
    // Al patron con mas peso relativo por slot ya asignado (mayor deficit proporcional).
    const p = avail.sort((a, b) => weight[b] / (counts.get(b)! + 1) - weight[a] / (counts.get(a)! + 1))[0];
    counts.set(p, counts.get(p)! + 1);
  }
  // Garantiza al menos un slot para el patron del objetivo forzado.
  if (goalForcedPattern && !avoidedPatterns.has(goalForcedPattern) && (counts.get(goalForcedPattern) ?? 0) === 0) {
    const donor = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    counts.set(donor, counts.get(donor)! - 1);
    counts.set(goalForcedPattern, 1);
  }

  const bag: StrengthPattern[] = [];
  for (const [p, c] of counts) for (let i = 0; i < c; i++) bag.push(p);
  return spaceOut(shuffle(bag, rand));
}

export function buildMicrocyclePlan(input: {
  macroId: string;
  /** Semana del macrociclo, 1-indexada. */
  weekNumber: number;
  /** Fase de mesociclo ya resuelta (incluye descargas forzadas). */
  phase: 1 | 2 | 3 | 4;
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  responseProfile: ResponseProfile;
  /** Patrones bajo aviso de molestia activo. */
  avoidedPatterns: Set<MovementPattern>;
  /** Patron del levantamiento de un objetivo de fuerza intensivo, si lo hay — se le reserva sitio. */
  goalForcedPattern: MovementPattern | null;
  /** Familia de un objetivo de oly intensivo, si lo hay. */
  goalForcedFamily: OlyFamily | null;
}): MicrocyclePlan {
  const { macroId, weekNumber, phase, trainingDaysPerWeek: n, responseProfile, avoidedPatterns, goalForcedFamily } = input;
  // El patron del objetivo solo cuenta si es uno de los 4 que el bloque de fuerza cicla — un objetivo
  // sobre, p.ej., una dominada no reserva slot de barra.
  const goalForcedPattern: StrengthPattern | null =
    input.goalForcedPattern && isStrengthPattern(input.goalForcedPattern) ? input.goalForcedPattern : null;
  const rand = mulberry32(hashSeed(`${macroId}:${weekNumber}`));

  const strengthSlots = strengthDoingSlots(n, phase, weekNumber);
  const allocated = allocatePatterns(strengthSlots.length, phase, responseProfile, avoidedPatterns, goalForcedPattern, rand);

  // Patron por trainingDayIndex: el planificado para los slots de fuerza, y el del ciclo natural
  // como relleno inocuo para el resto (dia de solo metcon / recuperacion — no generan bloque de fuerza).
  const strengthPattern: MovementPattern[] = Array.from(
    { length: n },
    (_, idx) => STRENGTH_PATTERNS[idx % STRENGTH_PATTERNS.length],
  );
  strengthSlots.forEach((slotIdx, i) => {
    strengthPattern[slotIdx] = allocated[i];
  });

  // Familias de oly: se alternan estrictamente a lo largo de los slots de fuerza a partir de un
  // ancla. El ancla la fija un objetivo/estancamiento de oly; si no, alterna por semana para que el
  // mismo dia no lleve siempre la misma.
  const anchorFam: OlyFamily = goalForcedFamily ?? stalledOlyFamily(responseProfile) ?? (weekNumber % 2 === 0 ? 'snatch' : 'clean');
  const other = (f: OlyFamily): OlyFamily => (f === 'snatch' ? 'clean' : 'snatch');
  const olyFamily: OlyFamily[] = Array.from({ length: n }, (_, idx) => (idx % 2 === 0 ? 'snatch' : 'clean'));
  strengthSlots.forEach((slotIdx, i) => {
    olyFamily[slotIdx] = i % 2 === 0 ? anchorFam : other(anchorFam);
  });

  // Rotacion de dominios energeticos: la fase fija el sistema dominante y los dias de WOD rotan a su
  // alrededor para no encadenar el mismo estimulo metabolico dos dias seguidos. PRNG propio (ver
  // `planEnergySystems`), independiente del flujo de fuerza/oly.
  const energySystem = planEnergySystems(macroId, weekNumber, phase, n);

  return { weekNumber, phase, strengthPattern, olyFamily, energySystem };
}
