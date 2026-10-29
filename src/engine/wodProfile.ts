/**
 * El perfil de esfuerzo de cada WOD del catálogo: cuánto dura de verdad, qué sistema energético trabaja, cuánto cuesta (RPE y
 * esfuerzo con la misma escala que el resto de la app) y qué carga mecánica pone sobre el cuerpo (barra, impacto, agarre,
 * hombros, dificultad técnica). Sustituye, para quien lo use, la duración "declarada o estimada a ojo", la etiqueta de energía
 * que salía solo de la duración (casi todo caía en "umbral") y el "lleva barra: sí/no".
 *
 * FASES A y B — solo lectura. Ningún código del coach lo usa todavía: sirve para medir (informe `npm run wods:report`) y, más
 * adelante, para elegir el WOD que encaje con el objetivo de esfuerzo del día. Todo se DEDUCE de lo que el texto dice y lleva su
 * confianza: `alta` (duración declarada o estructura leída entera), `media` (estructura leída en parte) o `baja` (solo la lista
 * de movimientos). Nunca se inventan cifras: lo que no se puede leer se marca.
 */
import { getLibraryWod, libraryWods } from '../data/library/libraryWods';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import type { CatalogWod } from './wodCatalog';
import { getWodCatalog, parseGoalMinutes } from './wodCatalog';
import { strainFromSrpe } from './strain';
import { getWodDomain } from './wodDomains';
import { structureFromBenchmark, structureFromLibrary, type WodLine, type WodStructure } from './wodStructure';

export type Confidence = 'alta' | 'media' | 'baja';
export type DurationSource = 'declarada' | 'modelo' | 'tope' | 'etiqueta' | 'sin-datos';

/** Cuatro sistemas, no tres: lo que antes era casi todo "umbral" se reparte entre glucolítico y mixto. */
export type EnergyKind = 'potencia' | 'glucolitico' | 'mixto' | 'aerobico';
export const ENERGY_LABEL: Record<EnergyKind, string> = { potencia: 'Potencia', glucolitico: 'Glucolítico', mixto: 'Mixto', aerobico: 'Aeróbico' };

export type LoadLabel = 'ligera' | 'media' | 'alta' | 'muy-alta';

export interface LoadDemand {
  /** 0-100: la carga mecánica total (no el esfuerzo cardiovascular). */
  score: number;
  label: LoadLabel;
  /** Kilos movidos en total (repeticiones x carga Rx masculina) por barra, mancuernas, kettlebells o balón. */
  tonnageKg: number;
  /** Unidades de impacto (saltos, carrera, burpees): lo que notan rodillas y tobillos. */
  impact: number;
  /** Unidades de agarre (dominadas, peso muerto, kettlebell, cuerda). */
  grip: number;
  /** Unidades de trabajo sobre la cabeza (thrusters, snatch, jerk, HSPU…): lo que nota el hombro. */
  overhead: number;
  /** Dificultad técnica: 0 ninguna, 1 media (dominadas, DU, cajón), 2 alta (halterofilia, HSPU), 3 muy alta (muscle-up, cuerda, handstand walk). */
  skill: 0 | 1 | 2 | 3;
}

export interface WodProfile {
  id: string;
  structure: WodStructure['coverage'];
  /** Duración esperada en minutos para un atleta Rx normal; null si no se puede saber. */
  expectedMin: number | null;
  durationSource: DurationSource;
  confidence: Confidence;
  energy: EnergyKind | null;
  /** Trabajo por minuto (repeticiones equivalentes): densidad del WOD. */
  density: number | null;
  /** Esfuerzo percibido esperado (RPE 1-10) del WOD solo. */
  expectedRpe: number | null;
  /** Esfuerzo del WOD solo en la escala 0-100 de la app (RPE x minutos -> `strainFromSrpe`). */
  strain: number | null;
  load: LoadDemand;
}

// ---------------------------------------------------------------------------------------------
// Tiempo por movimiento
// ---------------------------------------------------------------------------------------------

/** Segundos por repetición de cada movimiento a ritmo de WOD (no de serie de fuerza). */
const SEC_PER_REP: Record<string, number> = {
  thruster: 3.0, 'dumbbell-thruster': 3.0, 'wall-ball': 3.0, 'shoulder-to-overhead': 3.0, 'push-press': 2.8, 'push-jerk': 3.0,
  'kipping-pull-up': 2.2, 'butterfly-pull-up': 1.8, 'strict-pull-up': 3.2, 'chest-to-bar-pull-up': 2.6,
  'push-up': 1.6, 'hand-release-push-up': 2.0, 'handstand-push-up': 4.0, 'kipping-hspu': 3.0, 'ring-dip': 3.0,
  'toes-to-bar': 2.4, 'knees-to-elbow': 2.0, 'bar-muscle-up': 9, 'ring-muscle-up': 10, 'rope-climb': 28, 'wall-walk': 6, 'handstand-walk': 1.2,
  burpee: 3.5, 'bar-facing-burpee': 3.8, 'burpee-box-jump-over': 5, 'burpee-pull-up': 5, 'burpee-to-target': 3.8, 'lateral-burpee': 3.6,
  'box-jump': 2.4, 'box-jump-over': 2.8, 'air-squat': 1.4, 'abmat-situp': 1.8, 'ghd-situp': 2.2, 'back-extension': 2.0,
  deadlift: 2.5, 'sumo-deadlift-high-pull': 2.6, 'power-clean': 3.6, 'hang-power-clean': 3.6, 'hang-clean': 4.0, clean: 5.0, 'hang-squat-clean': 5.0,
  snatch: 5.0, 'power-snatch': 3.8, 'hang-power-snatch': 3.5, 'hang-snatch': 4.2, 'hang-squat-snatch': 5.0, 'clean-and-jerk': 7.0,
  'front-squat': 3.2, 'back-squat': 3.2, 'overhead-squat': 4.5, 'power-clean-and-jerk': 6.0,
  'kettlebell-swing-russian': 1.8, 'kettlebell-swing-american': 1.9, 'kettlebell-snatch': 3.0, 'kettlebell-front-squat': 3.0,
  'dumbbell-snatch': 2.6, 'dumbbell-power-snatch': 2.8, 'dumbbell-clean-and-jerk': 3.5, 'dumbbell-hang-clean': 2.8, 'dumbbell-push-jerk': 3.0,
  'walking-lunge': 1.8, 'reverse-lunge': 1.8, 'step-up': 1.6, 'devils-press': 5.0, 'man-maker': 6.0, 'ring-row': 2.4, 'sled-row': 3.0,
  'double-under': 0.85, 'single-under': 0.5,
};
/** Segundos por metro / caloría de los movimientos cíclicos. */
const SEC_PER_METER: Record<string, number> = { run: 0.27, row: 0.24, 'ski-erg': 0.27, 'shuttle-run': 0.32, 'air-bike': 0.2, 'sled-push': 0.6, 'farmers-carry': 0.8, 'handstand-walk': 1.2 };
const SEC_PER_CAL: Record<string, number> = { row: 3.3, 'air-bike': 3.4, 'ski-erg': 3.5 };

function secondsOf(line: WodLine): number {
  const id = line.movementId;
  if (line.unit === 's') return line.amount;
  if (line.unit === 'm') return line.amount * ((id && SEC_PER_METER[id]) || 0.3);
  if (line.unit === 'cal') return line.amount * ((id && SEC_PER_CAL[id]) || 3.4);
  const known = id ? SEC_PER_REP[id] : undefined;
  if (known) return line.amount * known;
  const domain = id ? getWodDomain(id) : 'gymnastics';
  return line.amount * (domain === 'weighted' ? 3.2 : 2.6);
}

/** Parámetros del modelo de duración "for time" (calibrados contra los WODs de biblioteca con duración declarada; ver el informe). */
export interface TimeModel {
  /** Factor global sobre el tiempo de trabajo puro (transiciones, ritmo real, pausas para respirar). */
  scale: number;
  /** Cuánto se alarga por la fatiga: cada 10 minutos de trabajo suma esta fracción. */
  fatiguePer10: number;
  /** Segundos de preparación por cambio de movimiento. */
  transitionSec: number;
}
export const DEFAULT_TIME_MODEL: TimeModel = { scale: 1.05, fatiguePer10: 0.15, transitionSec: 4 };

/** Minutos que cuesta un WOD "for time" con esa estructura, sin acotar. */
export function modelMinutes(s: WodStructure, m: TimeModel = DEFAULT_TIME_MODEL): number {
  const work = s.work.reduce((sum, l) => sum + secondsOf(l) + m.transitionSec, 0);
  const fatigue = 1 + m.fatiguePer10 * (work / 600);
  return ((work * fatigue * m.scale) / 60) + s.restMinutes;
}

// ---------------------------------------------------------------------------------------------
// Carga mecánica
// ---------------------------------------------------------------------------------------------

/** Carga Rx típica (kg, masculino) por repetición cuando el texto no la dice: barra a 61/43, mancuerna 22, kettlebell 24, balón 9. */
const TYPICAL_KG: Record<string, number> = {
  thruster: 43, 'shoulder-to-overhead': 43, 'push-press': 43, 'push-jerk': 43, 'front-squat': 61, 'back-squat': 70, 'overhead-squat': 43,
  deadlift: 102, 'sumo-deadlift-high-pull': 34, 'power-clean': 61, 'hang-power-clean': 61, 'hang-clean': 61, clean: 61, 'hang-squat-clean': 61,
  snatch: 43, 'power-snatch': 43, 'hang-power-snatch': 43, 'hang-snatch': 43, 'hang-squat-snatch': 43, 'clean-and-jerk': 61, 'power-clean-and-jerk': 61,
  'wall-ball': 9, 'kettlebell-swing-russian': 24, 'kettlebell-swing-american': 24, 'kettlebell-snatch': 24, 'kettlebell-front-squat': 24,
  'dumbbell-snatch': 22, 'dumbbell-power-snatch': 22, 'dumbbell-clean-and-jerk': 22, 'dumbbell-hang-clean': 22, 'dumbbell-push-jerk': 22, 'dumbbell-thruster': 22,
  'devils-press': 22, 'man-maker': 22, 'sandbag-clean': 36, 'walking-lunge': 0,
};
const IMPACT: Record<string, number> = { 'box-jump': 1, 'box-jump-over': 1, burpee: 1, 'bar-facing-burpee': 1, 'burpee-box-jump-over': 1.6, 'burpee-pull-up': 1, 'burpee-to-target': 1, 'lateral-burpee': 1, 'jumping-lunge': 1, 'shuttle-run': 0.1, 'double-under': 0.15, 'single-under': 0.08, 'walking-lunge': 0.25, 'step-up': 0.3, 'wall-ball': 0.3 };
const IMPACT_PER_METER_RUN = 0.015; // 400 m ≈ 6 unidades
const GRIP = new Set(['kipping-pull-up', 'butterfly-pull-up', 'strict-pull-up', 'chest-to-bar-pull-up', 'toes-to-bar', 'knees-to-elbow', 'bar-muscle-up', 'ring-muscle-up', 'rope-climb', 'deadlift', 'sumo-deadlift-high-pull', 'kettlebell-swing-russian', 'kettlebell-swing-american', 'kettlebell-snatch', 'dumbbell-snatch', 'dumbbell-power-snatch', 'clean', 'power-clean', 'hang-clean', 'hang-power-clean', 'snatch', 'power-snatch', 'hang-power-snatch', 'burpee-pull-up', 'farmers-carry']);
const OVERHEAD = new Set(['thruster', 'dumbbell-thruster', 'shoulder-to-overhead', 'push-press', 'push-jerk', 'handstand-push-up', 'kipping-hspu', 'snatch', 'power-snatch', 'hang-power-snatch', 'hang-snatch', 'hang-squat-snatch', 'overhead-squat', 'clean-and-jerk', 'power-clean-and-jerk', 'dumbbell-snatch', 'dumbbell-power-snatch', 'dumbbell-push-jerk', 'dumbbell-clean-and-jerk', 'wall-ball', 'wall-walk', 'devils-press', 'man-maker', 'kettlebell-snatch', 'handstand-walk']);
const SKILL3 = /muscle-up|rope-climb|handstand-walk|legless|ring-handstand/;
const SKILL2 = /handstand-push-up|hspu|snatch|clean-and-jerk|overhead-squat|bar-facing|burpee-box|toes-to-bar|chest-to-bar|butterfly|ring-dip|wall-walk/;
const SKILL1 = /pull-up|double-under|box-jump|thruster|clean|knees-to-elbow|devils|man-maker/;

/** Cuánto pesa cada componente en la puntuación 0-100 de carga mecánica. */
const LOAD_WEIGHTS = { tonnage: 0.3, impact: 0.18, grip: 0.12, overhead: 0.14, volume: 0.14, skill: 0.12 };
const SCALE = { tonnage: 3500, impact: 120, grip: 130, overhead: 140, volume: 450 };

/** Repeticiones de una línea; en una estación por tiempo ("1 min de wall balls") se estiman por el ritmo del movimiento. */
function repsOf(l: WodLine): number {
  if (l.unit === 'reps') return l.amount;
  if (l.unit === 's' && l.movementId) return (l.amount / (SEC_PER_REP[l.movementId] ?? 3)) * 0.8;
  return 0;
}

/** `factor`: cuántas veces se repite lo de `lines` (en un AMRAP, las rondas que caben en el tiempo). */
function loadDemand(lines: WodLine[], fallbackIds: string[], factor = 1): LoadDemand {
  let tonnage = 0;
  let impact = 0;
  let grip = 0;
  let overhead = 0;
  let volume = 0;
  const ids = new Set<string>(fallbackIds);
  const usable = lines.filter((l) => l.movementId);
  for (const l of usable) {
    const id = l.movementId!;
    ids.add(id);
    const reps = repsOf(l);
    const kg = l.loadKg ?? TYPICAL_KG[id] ?? 0;
    tonnage += reps * kg * factor;
    volume += repEquivalents(l) * factor;
    if (l.unit === 'm' && (id === 'run' || id === 'shuttle-run')) impact += l.amount * IMPACT_PER_METER_RUN * factor;
    else if (l.unit === 'm' && id === 'farmers-carry') grip += l.amount * 0.2 * factor;
    else if (IMPACT[id]) impact += reps * IMPACT[id] * factor;
    if (GRIP.has(id)) grip += reps * factor;
    if (OVERHEAD.has(id)) overhead += reps * factor;
  }
  // Sin estructura leída: se estima con una pasada típica de cada movimiento (menos fiable, por eso la confianza baja).
  if (usable.length === 0) {
    for (const id of fallbackIds) {
      tonnage += 40 * (TYPICAL_KG[id] ?? 0);
      if (IMPACT[id]) impact += 40 * IMPACT[id];
      if (id === 'run') impact += 400 * IMPACT_PER_METER_RUN * 3;
      if (GRIP.has(id)) grip += 40;
      if (OVERHEAD.has(id)) overhead += 40;
      volume += 40;
    }
  }
  const idList = [...ids];
  const skill: 0 | 1 | 2 | 3 = idList.some((i) => SKILL3.test(i)) ? 3 : idList.some((i) => SKILL2.test(i)) ? 2 : idList.some((i) => SKILL1.test(i)) ? 1 : 0;
  const part = (v: number, s: number) => 100 * (1 - Math.exp(-v / s));
  const score = Math.round(
    LOAD_WEIGHTS.tonnage * part(tonnage, SCALE.tonnage) + LOAD_WEIGHTS.impact * part(impact, SCALE.impact) + LOAD_WEIGHTS.grip * part(grip, SCALE.grip) + LOAD_WEIGHTS.overhead * part(overhead, SCALE.overhead) + LOAD_WEIGHTS.volume * part(volume, SCALE.volume) + LOAD_WEIGHTS.skill * (skill * 100) / 3,
  );
  const label: LoadLabel = score < 25 ? 'ligera' : score < 45 ? 'media' : score < 65 ? 'alta' : 'muy-alta';
  return { score, label, tonnageKg: Math.round(tonnage), impact: Math.round(impact), grip: Math.round(grip), overhead: Math.round(overhead), skill };
}

// ---------------------------------------------------------------------------------------------
// Energía, densidad y esfuerzo
// ---------------------------------------------------------------------------------------------

/** Repeticiones equivalentes de una línea (metros y calorías se pasan a repeticiones por lo que cuestan en tiempo). */
function repEquivalents(l: WodLine): number {
  if (l.unit === 'reps') return l.amount;
  return secondsOf(l) / 2.5;
}

function monoShare(lines: WodLine[]): number {
  const total = lines.reduce((s, l) => s + secondsOf(l), 0);
  if (total <= 0) return 0;
  const mono = lines.filter((l) => l.movementId && getWodDomain(l.movementId) === 'monostructural').reduce((s, l) => s + secondsOf(l), 0);
  return mono / total;
}

export function energyFor(min: number, density: number | null, mono: number, restShare: number): EnergyKind {
  // Mucho descanso dentro (intervalos, EMOM con pausa): el esfuerzo es repetible, se queda un escalón por debajo.
  const eff = restShare >= 0.3 ? min * 1.35 : min;
  if (eff <= 4) return 'potencia';
  if (eff <= 12) return density !== null && density < 5 && mono >= 0.6 && eff > 8 ? 'mixto' : 'glucolitico';
  if (eff <= 20) return mono >= 0.67 && eff >= 14 ? 'aerobico' : 'mixto';
  return 'aerobico';
}

/** RPE esperado del WOD solo: corto y denso aprieta más; largo y cíclico se dosifica. */
export function expectedRpeFor(min: number, mono: number, restShare: number, skill: number, loadScore: number): number {
  let rpe = min <= 5 ? 9.0 : min <= 10 ? 8.6 : min <= 15 ? 8.2 : min <= 20 ? 7.8 : min <= 30 ? 7.2 : 6.6;
  if (restShare >= 0.3) rpe -= 0.6;
  if (mono >= 0.6) rpe -= 0.5;
  if (loadScore >= 65) rpe += 0.3;
  if (skill >= 3) rpe += 0.2;
  return Math.round(Math.min(9.5, Math.max(5, rpe)) * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// Perfil de un WOD
// ---------------------------------------------------------------------------------------------

/** Cuántas veces se repite el trabajo de s.work en un formato de tiempo fijo (AMRAP, intervalos): las rondas que caben en minutes. En un "for time" y en un EMOM (ya expandido) vale 1. */
function repeatFactor(s: WodStructure | null, minutes: number): number {
  if (!s || (s.kind !== 'amrap' && s.kind !== 'interval' && s.kind !== 'maxReps')) return 1;
  const pass = s.work.reduce((sum, l) => sum + secondsOf(l) + 4, 0);
  return pass > 0 ? Math.min(60, Math.max(1, (minutes * 60) / (pass * 1.1))) : 1;
}

const benchById = new Map(benchmarkWorkouts.map((w) => [w.id, w]));

function structureOf(w: CatalogWod): WodStructure | null {
  if (w.origin === 'library') {
    const lw = getLibraryWod(w.refId);
    return lw ? structureFromLibrary(lw) : null;
  }
  const bm = benchById.get(w.refId);
  return bm ? structureFromBenchmark(bm.format, bm.movements.filter((id) => getMovementById(id)), bm.timeCapMinutes ?? null) : null;
}

/** La duración esperada y de dónde sale: lo declarado manda; si no, el modelo; el tope solo acota; la etiqueta es el último recurso. */
function durationOf(w: CatalogWod, s: WodStructure | null): { min: number | null; source: DurationSource } {
  // Lo que declara la fuente manda (cabecera, formato, objetivo): incluye series con descanso ("5 rondas de AMRAP 3 con 1 min de descanso").
  if (w.durationBasis === 'goal' || w.durationBasis === 'header') return { min: w.durationMin, source: 'declarada' };
  if (s && s.fixedMinutes !== null) return { min: s.fixedMinutes, source: 'declarada' };
  if (w.durationBasis === 'format') return { min: w.durationMin, source: 'declarada' };
  const cap = w.durationBasis === 'cap' ? w.durationMin : null;
  // Un AMRAP o EMOM sin minutos escritos ("EMOM hasta completar 100 thrusters") no es un "for time": el modelo no vale.
  const openEnded = s !== null && (s.kind === 'amrap' || s.kind === 'emom') && s.fixedMinutes === null;
  if (s && !openEnded && s.coverage !== 'none' && s.work.length > 0) {
    const m = modelMinutes(s) * (s.partner ? 0.6 : 1);
    const bounded = cap !== null ? Math.min(m, cap * 0.95) : m;
    return { min: Math.min(90, Math.max(2, Math.round(bounded * 2) / 2)), source: 'modelo' };
  }
  if (cap !== null) return { min: Math.round(cap * 0.75 * 2) / 2, source: 'tope' };
  if (w.durationMin !== null) return { min: w.durationMin, source: 'etiqueta' };
  return { min: null, source: 'sin-datos' };
}

export function profileWod(w: CatalogWod): WodProfile {
  const s = structureOf(w);
  const dur = durationOf(w, s);
  const lines = s?.work ?? [];
  const factor = dur.min !== null ? repeatFactor(s, dur.min) : 1;
  const load = loadDemand(lines, w.movementIds, factor);
  const confidence: Confidence =
    dur.source === 'sin-datos' ? 'baja' : dur.source === 'declarada' && (s?.coverage ?? 'none') !== 'none' ? 'alta' : dur.source === 'declarada' ? 'media' : dur.source === 'modelo' && s?.coverage === 'full' ? 'media' : 'baja';
  if (dur.min === null) {
    return { id: w.id, structure: s?.coverage ?? 'none', expectedMin: null, durationSource: dur.source, confidence, energy: null, density: null, expectedRpe: null, strain: null, load };
  }
  const reps = lines.reduce((sum, l) => sum + repEquivalents(l), 0) * factor;
  const density = reps > 0 ? Math.round((reps / dur.min) * 10) / 10 : null;
  const mono = lines.length > 0 ? monoShare(lines) : w.domainCounts.monostructural / Math.max(1, w.domainCounts.gymnastics + w.domainCounts.monostructural + w.domainCounts.weighted);
  const work = lines.reduce((sum, l) => sum + secondsOf(l), 0) / 60;
  // Cuánto del tiempo es pausa: el descanso explícito (entre rondas, entre series) y, en un EMOM, lo que sobra de cada minuto.
  const explicitRest = s && dur.min > 0 ? s.restMinutes / dur.min : 0;
  const emomSlack = s && s.kind === 'emom' && s.fixedMinutes !== null && s.fixedMinutes > 0 ? Math.max(0, 1 - Math.min(1, work / s.fixedMinutes)) : 0;
  const restShare = Math.min(1, Math.max(explicitRest, emomSlack));  const energy = energyFor(dur.min, density, mono, restShare);
  const rpe = expectedRpeFor(dur.min, mono, restShare, load.skill, load.score);
  return { id: w.id, structure: s?.coverage ?? 'none', expectedMin: dur.min, durationSource: dur.source, confidence, energy, density, expectedRpe: rpe, strain: strainFromSrpe(rpe * dur.min), load };
}

let profileCache: Map<string, WodProfile> | null = null;

/** El perfil de un WOD del catálogo por su id (`lib:…` / `bm:…`), con caché. */
export function getWodProfile(id: string): WodProfile | undefined {
  if (!profileCache) {
    profileCache = new Map();
    for (const w of getWodCatalog()) profileCache.set(w.id, profileWod(w));
  }
  return profileCache.get(id);
}

export function allWodProfiles(): WodProfile[] {
  getWodProfile('');
  return [...profileCache!.values()];
}

// ---------------------------------------------------------------------------------------------
// Cuánto acierta el modelo de duración
// ---------------------------------------------------------------------------------------------

/**
 * ¿Cuánto acierta el modelo de duración? Se compara con los WODs "for time" de biblioteca que declaran su duración (objetivo de
 * la fuente). `medianRatio` ≈ 1 es una estimación sin sesgo; `within30` es la fracción que cae a ±30 %. Es la misma medida que
 * usa `volumeEstimateAccuracy` (la estimación antigua por volumen), para poder compararlas.
 */
export function durationModelAccuracy(model: TimeModel = DEFAULT_TIME_MODEL): { n: number; medianRatio: number; within30: number } {
  const ratios: number[] = [];
  for (const w of libraryWods) {
    const declared = parseGoalMinutes(w.goal);
    if (declared === null) continue;
    const s = structureFromLibrary(w);
    if (s.kind !== 'forTime' || s.work.length === 0) continue;
    ratios.push(modelMinutes(s, model) / declared);
  }
  ratios.sort((a, b) => a - b);
  const within = ratios.filter((r) => r >= 0.7 && r <= 1.3).length;
  return { n: ratios.length, medianRatio: ratios[Math.floor(ratios.length / 2)] ?? 0, within30: ratios.length ? within / ratios.length : 0 };
}