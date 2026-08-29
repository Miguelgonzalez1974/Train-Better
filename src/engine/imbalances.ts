import type { PersonalRecords, SessionHistoryEntry, VariantPersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { OlyFamily } from './periodization';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';

export type ImbalanceStatus = 'desbalance' | 'equilibrado' | 'faltan-datos';

export interface ImbalanceBar {
  label: string;
  /** null cuando no hay dato real todavia — se pinta como barra vacia, no como cero. */
  value: number | null;
  flagged: boolean;
}

export interface ImbalanceGroup {
  key: string;
  label: string;
  status: ImbalanceStatus;
  bars: ImbalanceBar[];
  note: string;
  /** Movimientos de este grupo que nunca se han probado de verdad — se muestra siempre que exista, independientemente del status. */
  missingLabels: string[];
}

interface TrackedLift {
  id: string;
  label: string;
  kind: 'root' | 'variant';
  value: (prs: PersonalRecords, variantPrs: VariantPersonalRecords | undefined) => number;
}

/**
 * Catalogo interno de los levantamientos que este modulo sabe comparar. Las claves coinciden a
 * proposito con los nombres reales de campo en `PersonalRecords`/`VariantPersonalRecords` para
 * poder indexar directamente sin una tabla de traduccion aparte.
 */
const LIFTS = {
  backSquat: { id: 'back-squat', label: 'Back Squat', kind: 'root', value: (p) => p.backSquat },
  frontSquat: { id: 'front-squat', label: 'Front Squat', kind: 'root', value: (p) => p.frontSquat },
  deadlift: { id: 'deadlift', label: 'Deadlift', kind: 'root', value: (p) => p.deadlift },
  benchPress: { id: 'bench-press', label: 'Bench Press', kind: 'root', value: (p) => p.benchPress },
  strictPress: { id: 'strict-press', label: 'Strict Press', kind: 'root', value: (p) => p.strictPress },
  clean: { id: 'clean', label: 'Clean', kind: 'root', value: (p) => p.clean },
  snatch: { id: 'snatch', label: 'Snatch', kind: 'root', value: (p) => p.snatch },
  cleanAndJerk: { id: 'clean-and-jerk', label: 'Clean & Jerk', kind: 'root', value: (p) => p.cleanAndJerk },
  overheadSquat: { id: 'overhead-squat', label: 'Overhead Squat', kind: 'variant', value: (_p, v) => v?.overheadSquat ?? 0 },
  powerSnatch: { id: 'power-snatch', label: 'Power Snatch', kind: 'variant', value: (_p, v) => v?.powerSnatch ?? 0 },
  powerClean: { id: 'power-clean', label: 'Power Clean', kind: 'variant', value: (_p, v) => v?.powerClean ?? 0 },
} satisfies Record<string, TrackedLift>;

type LiftKey = keyof typeof LIFTS;

interface RatioRule {
  targetKey: LiftKey;
  referenceKey: LiftKey;
  /** Que lado del ratio es el que preocupa: 'low' avisa si target/reference cae por debajo de minRatio, 'high' si lo supera. */
  direction: 'low' | 'high';
  minRatio: number;
  maxRatio: number;
  note: string;
}

interface ImbalanceGroupDef {
  key: string;
  label: string;
  /** Barras a mostrar, en el orden en que se dibujan — no todas tienen por que aparecer en `rules`. */
  lifts: LiftKey[];
  rules: RatioRule[];
}

/**
 * Rangos orientativos de coaching de halterofilia/powerlifting, no una ciencia exacta por atleta —
 * mismo espiritu que otras constantes de programacion ya hardcodeadas en el motor (WOD_BARBELL_LOAD_PERCENT,
 * STRENGTH_WEEK_SCHEMES). El objetivo es senalar un patron que merece la pena mirar, no diagnosticar.
 */
const GROUPS: ImbalanceGroupDef[] = [
  {
    key: 'sentadillas',
    label: 'Sentadillas',
    lifts: ['backSquat', 'frontSquat', 'overheadSquat'],
    rules: [
      {
        targetKey: 'frontSquat',
        referenceKey: 'backSquat',
        direction: 'low',
        minRatio: 0.82,
        maxRatio: 0.97,
        note: 'Tu Front Squat va por detrás de tu Back Squat — puede ser un límite de core o de posición del torso, no solo de piernas.',
      },
      {
        targetKey: 'overheadSquat',
        referenceKey: 'backSquat',
        direction: 'low',
        minRatio: 0.55,
        maxRatio: 0.75,
        note: 'Tu Overhead Squat va muy por debajo de lo esperado para tu Back Squat — probable límite de movilidad de hombro o estabilidad, no de fuerza de piernas.',
      },
    ],
  },
  {
    key: 'fuerza-basica',
    label: 'Fuerza básica',
    lifts: ['backSquat', 'deadlift', 'benchPress', 'strictPress'],
    rules: [
      {
        targetKey: 'deadlift',
        referenceKey: 'backSquat',
        direction: 'low',
        minRatio: 0.95,
        maxRatio: 1.25,
        note: 'Tu Peso Muerto va por detrás de tu Back Squat — cadena posterior (isquios, glúteo, espalda baja) como posible punto a reforzar.',
      },
      {
        targetKey: 'strictPress',
        referenceKey: 'benchPress',
        direction: 'low',
        minRatio: 0.55,
        maxRatio: 0.7,
        note: 'Tu Strict Press va por detrás de lo esperado para tu Bench Press — fuerza de empuje vertical y core a trabajar.',
      },
    ],
  },
  {
    key: 'olimpicos',
    label: 'Levantamientos Olímpicos',
    lifts: ['snatch', 'clean', 'cleanAndJerk'],
    rules: [
      {
        targetKey: 'snatch',
        referenceKey: 'clean',
        direction: 'low',
        minRatio: 0.72,
        maxRatio: 0.88,
        note: 'Tu Snatch va muy por detrás de tu Clean — la técnica de recibo o la velocidad bajo la barra puede ser tu límite ahora mismo, más que la fuerza.',
      },
      {
        targetKey: 'cleanAndJerk',
        referenceKey: 'clean',
        direction: 'low',
        minRatio: 0.9,
        maxRatio: 1.02,
        note: 'Tu Clean & Jerk va notablemente por detrás de tu Clean — el jerk (recepción o empuje) puede ser tu límite ahora mismo, no el clean.',
      },
    ],
  },
  {
    key: 'tecnica-potencia',
    label: 'Técnica: potencia vs. completo',
    lifts: ['powerSnatch', 'snatch', 'powerClean', 'clean'],
    rules: [
      {
        targetKey: 'powerSnatch',
        referenceKey: 'snatch',
        direction: 'high',
        minRatio: 0,
        maxRatio: 0.92,
        note: 'Tu Power Snatch está muy cerca de tu Snatch completo — indica que tu técnica o movilidad al recibir en sentadilla no está aprovechando toda tu fuerza real.',
      },
      {
        targetKey: 'powerClean',
        referenceKey: 'clean',
        direction: 'high',
        minRatio: 0,
        maxRatio: 0.92,
        note: 'Tu Power Clean está muy cerca de tu Clean completo — la recepción en sentadilla puede estar limitando más que tu fuerza de tirón.',
      },
    ],
  },
];

/**
 * Movimientos raiz con un test 1RM real registrado en el historial — un `PersonalRecords` es solo
 * un numero editable con un valor por defecto de fabrica, no prueba que el atleta lo haya probado
 * de verdad alguna vez. Mismo criterio ya usado por `computePrTrends`, reutilizado aqui en vez de
 * reinventarlo.
 */
function getTestedRootKeys(history: SessionHistoryEntry[]): Set<keyof PersonalRecords> {
  const tested = new Set<keyof PersonalRecords>();
  for (const entry of history) {
    if (entry.testLoadKg == null) continue;
    for (const id of entry.movementIds) {
      if (id.startsWith('benchmark:')) continue;
      const movement = getMovementById(id);
      const key = movement && (resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement));
      if (key) tested.add(key);
    }
  }
  return tested;
}

/**
 * Para las variant PRs (Overhead Squat, Power Snatch, Power Clean...) basta con que el campo tenga
 * un numero: a diferencia de los 8 PRs raiz, estas no vienen con un valor de fabrica — nacen vacias
 * y el atleta las rellena a proposito (a menudo con una marca real que ya conoce, no necesariamente
 * probada dentro de la app), asi que "definido" ya es una senal real, sin el riesgo de "valor de
 * fabrica sin tocar" que si existe en los 8 PRs raiz.
 */
function hasRealData(liftKey: LiftKey, variantPrs: VariantPersonalRecords | undefined, testedRootKeys: Set<keyof PersonalRecords>): boolean {
  const lift = LIFTS[liftKey];
  if (lift.kind === 'variant') {
    const value = variantPrs?.[liftKey as keyof VariantPersonalRecords];
    return typeof value === 'number' && value > 0;
  }
  return testedRootKeys.has(liftKey as keyof PersonalRecords);
}

/**
 * Evalua una regla de ratio: si hay datos reales en ambos lados y, en tal caso, si esta marcada.
 * Extraido para que `computeImbalances` (dashboard) y `getImbalanceBias` (motor de sesion)
 * compartan exactamente el mismo criterio, sin que uno derive del otro.
 */
function evaluateRule(
  rule: RatioRule,
  prs: PersonalRecords,
  variantPrs: VariantPersonalRecords | undefined,
  testedRootKeys: Set<keyof PersonalRecords>,
): { targetHasData: boolean; referenceHasData: boolean; evaluated: boolean; flagged: boolean } {
  const targetHasData = hasRealData(rule.targetKey, variantPrs, testedRootKeys);
  const referenceHasData = hasRealData(rule.referenceKey, variantPrs, testedRootKeys);
  if (!targetHasData || !referenceHasData) return { targetHasData, referenceHasData, evaluated: false, flagged: false };

  const referenceValue = LIFTS[rule.referenceKey].value(prs, variantPrs);
  if (referenceValue <= 0) return { targetHasData, referenceHasData, evaluated: false, flagged: false };

  const ratio = LIFTS[rule.targetKey].value(prs, variantPrs) / referenceValue;
  const flagged = rule.direction === 'low' ? ratio < rule.minRatio : ratio > rule.maxRatio;
  return { targetHasData, referenceHasData, evaluated: true, flagged };
}

/**
 * Compara levantamientos relacionados entre si usando ratios de coaching conocidos (halterofilia/
 * powerlifting) — complementario a `computeWeakPoints`, que mira RPE/escalado/tendencia dentro de
 * un mismo patron, no entre levantamientos distintos. Los 4 grupos se devuelven siempre (nunca una
 * lista vacia): un desequilibrio real es una señal a corregir, pero un grupo bien equilibrado
 * tambien merece verse — es un refuerzo positivo real, no ruido a esconder.
 */
export function computeImbalances(
  prs: PersonalRecords,
  variantPrs: VariantPersonalRecords | undefined,
  history: SessionHistoryEntry[],
): ImbalanceGroup[] {
  const testedRootKeys = getTestedRootKeys(history);

  return GROUPS.map((group) => {
    const flaggedNotes: string[] = [];
    const flaggedBarKeys = new Set<LiftKey>();
    const missingLabels = new Set<string>();
    let evaluatedAny = false;

    for (const rule of group.rules) {
      const { targetHasData, referenceHasData, evaluated, flagged } = evaluateRule(rule, prs, variantPrs, testedRootKeys);
      if (!targetHasData) missingLabels.add(LIFTS[rule.targetKey].label);
      if (!referenceHasData) missingLabels.add(LIFTS[rule.referenceKey].label);
      if (!evaluated) continue;
      evaluatedAny = true;
      if (flagged) {
        flaggedNotes.push(rule.note);
        flaggedBarKeys.add(rule.targetKey);
      }
    }

    const status: ImbalanceStatus = flaggedNotes.length > 0 ? 'desbalance' : evaluatedAny ? 'equilibrado' : 'faltan-datos';
    const note =
      flaggedNotes[0] ??
      (status === 'equilibrado'
        ? 'Tus marcas guardan la proporción esperada entre sí — nada que corregir aquí, sigue así.'
        : 'Registra un test real de estos movimientos para que el coach pueda comparar.');

    const bars: ImbalanceBar[] = group.lifts.map((liftKey) => ({
      label: LIFTS[liftKey].label,
      value: hasRealData(liftKey, variantPrs, testedRootKeys) ? LIFTS[liftKey].value(prs, variantPrs) : null,
      flagged: flaggedBarKeys.has(liftKey),
    }));

    return { key: group.key, label: group.label, status, bars, note, missingLabels: Array.from(missingLabels) };
  });
}

export interface ImbalanceBias {
  /** movementIds de levantamientos de fuerza infra-desarrollados: el lado 'low' de una regla en
   *  desbalance, con datos reales en ambos lados. El motor los prioriza dentro del patron que ya toca. */
  strengthLiftIds: string[];
  /** familias oly (snatch/clean) infra-desarrolladas, por la misma logica. */
  olyFamilies: OlyFamily[];
  /** familias oly donde una regla `direction: 'high'` esta marcada — la variante de potencia esta
   *  demasiado cerca del levantamiento completo, asi que el limite es la RECEPCION abajo, no la
   *  fuerza de tiron. El motor sesga hacia la version completa (sentadilla) + drills de recibo. */
  receivingFamilies: OlyFamily[];
}

const EMPTY_IMBALANCE_BIAS: ImbalanceBias = { strengthLiftIds: [], olyFamilies: [], receivingFamilies: [] };

/** targetKey de una regla oly -> familia que se debe reforzar. */
function olyFamilyForLiftKey(key: LiftKey): OlyFamily | null {
  if (key === 'snatch' || key === 'powerSnatch') return 'snatch';
  if (key === 'clean' || key === 'cleanAndJerk' || key === 'powerClean') return 'clean';
  return null;
}

/**
 * Traduce los desbalances detectados a un sesgo de seleccion para el motor de sesion:
 *  - reglas `direction: 'low'` (el target va genuinamente flojo respecto al reference) -> mas
 *    frecuencia de ese levantamiento (fuerza) o familia (oly) dentro de lo que ya toca hoy.
 *  - reglas `direction: 'high'` (p.ej. Power Clean demasiado cerca del Clean completo) -> el limite
 *    es recibir abajo, no la fuerza de tiron: se marca la familia como `receivingFamilies` para que
 *    el oly sesgue hacia la version completa y drills de recepcion, no mas trabajo de potencia.
 * Nunca fabrica una senal desde un PR por defecto: `evaluateRule` ya exige un test real en ambos lados.
 */
export function getImbalanceBias(
  prs: PersonalRecords,
  variantPrs: VariantPersonalRecords | undefined,
  history: SessionHistoryEntry[],
): ImbalanceBias {
  const testedRootKeys = getTestedRootKeys(history);
  const strengthLiftIds = new Set<string>();
  const olyFamilies = new Set<OlyFamily>();
  const receivingFamilies = new Set<OlyFamily>();

  for (const group of GROUPS) {
    for (const rule of group.rules) {
      if (!evaluateRule(rule, prs, variantPrs, testedRootKeys).flagged) continue;
      const family = olyFamilyForLiftKey(rule.targetKey);
      if (rule.direction === 'high') {
        if (family) receivingFamilies.add(family);
        continue;
      }
      if (family) olyFamilies.add(family);
      else strengthLiftIds.add(LIFTS[rule.targetKey].id);
    }
  }

  if (strengthLiftIds.size === 0 && olyFamilies.size === 0 && receivingFamilies.size === 0) return EMPTY_IMBALANCE_BIAS;
  return { strengthLiftIds: [...strengthLiftIds], olyFamilies: [...olyFamilies], receivingFamilies: [...receivingFamilies] };
}
