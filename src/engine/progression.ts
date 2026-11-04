import type {
  EmphasisPlan,
  PrLogEntry,
  ProgressionRecord,
  ProgressionSettings,
  ProgressionVerdict,
  SessionBlockResult,
  SetFeedbackEntry,
  WorkSetEntry,
} from '../data/athlete/types';
import { roundToNearestPlate } from './oneRepMaxTables';
import { parseWorkingReps } from './setFeedback';

/**
 * Progresión por resultados. Al cerrar la sesión se anota cómo salió el levantamiento principal de fuerza y el de oly (limpia,
 * hecha, dura o fallo). Con unas cuantas sesiones limpias seguidas la carga de ese levantamiento sube un paso; con dos con
 * fallos baja. El estado NO se guarda: se calcula siempre desde el registro (`progressionLog`), así que borrar una sesión o
 * sincronizar dos dispositivos nunca lo deja a medias. Cada decisión se revisa con la sesión siguiente (¿acertó?), y ese
 * libro de aciertos es lo que enseña la pantalla "¿Acierta el coach?".
 *
 * La calidad de cada serie la marca el atleta en el modo entreno (bien por defecto, justa, fallada): sin esa marca el motor
 * solo vería el peso, y un intento fallado no deja rastro en un registro de kilos y repeticiones.
 *
 * Fuerza y oly tienen reglas distintas: en oly el mismo porcentaje pesa mucho más y un fallo es técnico, así que sube con
 * pasos más pequeños, pide más sesiones limpias y baja antes. Convive con el ajuste que ya hace el perfil de respuesta
 * (`perLiftLoad`, que mide tu nivel con el 1RM estimado): este factor es un empujón acotado por encima, y se apaga solo si el
 * empujón pasa de largo (las sesiones dejan de salir limpias y la regla de bajar lo recoge).
 */

export type ProgressionKind = 'strength' | 'oly';

export interface ProgressionRule {
  /** Cuánto sube la carga cada vez que se cumple la regla de subir. */
  up: number;
  /** Cuánto baja con las sesiones con fallos seguidas. */
  down: number;
  /** Tope del factor acumulado (por encima y por debajo de lo que dice el resto del perfil). */
  max: number;
  min: number;
  /** Sesiones limpias seguidas para subir (en fuerza el atleta puede aceptar 3, ver `ProgressionSettings`). */
  cleanNeeded: number;
  /** Sesiones con fallos seguidas para bajar. */
  failNeeded: number;
}

export const PROGRESSION_RULES: Record<ProgressionKind, ProgressionRule> = {
  // 2,5 %: un disco pequeño en una barra de 100 kg.
  strength: { up: 0.025, down: 0.05, max: 1.05, min: 0.92, cleanNeeded: 2, failNeeded: 2 },
  oly: { up: 0.02, down: 0.04, max: 1.04, min: 0.92, cleanNeeded: 3, failNeeded: 2 },
};

export const PROGRESSION_UP_STEP = PROGRESSION_RULES.strength.up;
export const PROGRESSION_DOWN_STEP = PROGRESSION_RULES.strength.down;
export const PROGRESSION_MAX = PROGRESSION_RULES.strength.max;
export const PROGRESSION_MIN = PROGRESSION_RULES.strength.min;
/** Sesiones limpias seguidas para subir en fuerza (2 por defecto; el atleta puede aceptar 3). */
export const DEFAULT_CLEAN_NEEDED = PROGRESSION_RULES.strength.cleanNeeded;
/** Sesiones con fallos seguidas para bajar. */
export const FAIL_NEEDED = PROGRESSION_RULES.strength.failNeeded;
/** RPE de la serie más pesada hasta el que una sesión cuenta como limpia. */
export const CLEAN_RPE_MAX = 8.5;
/** Si el peso más alto movido queda por debajo de este tramo de lo prescrito, la sesión cuenta como fallo (no se pudo con el peso pedido). */
export const LIGHTER_TOLERANCE = 0.95;
/** Casos con resultado que necesita una regla para tener veredicto. */
export const VERDICT_MIN_CASES = 5;
/** Porcentaje de aciertos desde el que una regla "funciona". */
export const RULE_WORKS_AT = 0.7;
/** Días que no vuelve a salir una propuesta que el atleta dejó como estaba. */
export const PROPOSAL_PAUSE_DAYS = 28;

const kindOf = (r: Pick<ProgressionRecord, 'block'>): ProgressionKind => r.block ?? 'strength';

/** Las reps del primer técnico de un día de oly (antes del levantamiento principal): sirve para reconocerlo. */
export const OLY_PRIMER_REPS = '2-3';

/**
 * El levantamiento principal de un tipo de bloque. En fuerza es el primero; un día de oly lleva, tras el calentamiento de barra,
 * el primer técnico (reps "2-3"), el principal, el tirón y a veces un toque de la otra familia: el principal es el que sigue al primer.
 */
export function mainLiftBlock(blocks: SessionBlockResult[], kind: ProgressionKind): SessionBlockResult | undefined {
  const own = blocks.filter((b) => b.block === kind && !b.subgroup);
  if (kind === 'strength') return own[0];
  return own[0]?.reps === OLY_PRIMER_REPS ? own[1] : own[0];
}

// ---------- Evaluar una sesión ----------

export interface EvaluateInput {
  date: string;
  /** Fuerza u oly: de dónde sale el bloque. */
  kind?: ProgressionKind;
  /** El bloque principal tal como se prescribió. */
  block: Pick<SessionBlockResult, 'movementId' | 'sets' | 'reps' | 'loadKg' | 'logAsSingle' | 'setPlan' | 'complex'>;
  /** Clave de PR del levantamiento; sin ella no hay a qué atribuir el resultado. */
  key: string | null | undefined;
  /** Las series registradas ese día de ese movimiento. */
  sets: WorkSetEntry[];
  /** El check-in de esfuerzo de ese día y movimiento, si lo dio. */
  feedback?: SetFeedbackEntry;
}

/**
 * Cómo salió un levantamiento. null cuando no se puede juzgar: sin clave de PR, series sueltas, rampas, olas, complejos o reps
 * que no son un número limpio, o cuando no se registraron todas las series (no se juzga con datos a medias).
 *
 * Una serie marcada `fallada` (o con menos reps de las pedidas, o un peso más bajo de lo prescrito) hace la sesión `fallo`;
 * una `justa` la deja en `dura`; sin marcas, manda el RPE de la serie más pesada (o la sensación de la primera serie).
 */
export function evaluateLiftSession(input: EvaluateInput): ProgressionRecord | null {
  const { block, feedback, date } = input;
  const kind = input.kind ?? 'strength';
  if (!input.key || block.logAsSingle || block.setPlan || block.complex) return null;
  const prescribedSets = feedback?.prescribedSets || block.sets || 0;
  // Las reps salen del propio bloque: si no son un número limpio no se juzga, diga lo que diga el check-in.
  const prescribedReps = parseWorkingReps(block.reps ?? '') ?? 0;
  const prescribedKg = feedback?.prescribedKg || block.loadKg || 0;
  if (prescribedSets < 2 || prescribedReps < 1 || prescribedKg <= 0) return null;

  const done = input.sets.filter((s) => s.kg > 0);
  if (done.length < prescribedSets || done.some((s) => s.reps < 1)) return null;

  const topKg = Math.max(...done.map((s) => s.kg));
  const falladas = done.filter((s) => s.quality === 'fallada').length;
  const justas = done.filter((s) => s.quality === 'justa').length;
  const short = done.some((s) => s.reps < prescribedReps);
  const lighter = topKg < prescribedKg * LIGHTER_TOLERANCE;
  const rpe = feedback?.actualRpe;

  let verdict: ProgressionVerdict;
  if (falladas > 0 || short || lighter) verdict = 'fallo';
  else if (justas > 0) verdict = 'dura';
  else if (rpe !== undefined) verdict = rpe <= CLEAN_RPE_MAX ? 'limpia' : 'dura';
  else if (feedback) verdict = feedback.feel === 'sobro' || feedback.feel === 'justo' ? 'limpia' : 'dura';
  else verdict = 'hecha';

  return {
    date,
    movementId: block.movementId,
    key: input.key,
    block: kind,
    verdict,
    prescribedKg,
    topKg,
    prescribedSets,
    prescribedReps,
    ...(rpe !== undefined ? { rpe } : {}),
    ...(justas > 0 ? { justas } : {}),
    ...(falladas > 0 ? { falladas } : {}),
  };
}

/** Compatibilidad: la evaluación de fuerza de siempre. */
export const evaluateStrengthSession = evaluateLiftSession;

// ---------- El estado, calculado desde el registro ----------

export type DecisionKind = 'subir' | 'bajar';

export interface ProgressionDecision {
  date: string;
  key: string;
  kind: DecisionKind;
  /** De qué tipo de levantamiento es la decisión. */
  block: ProgressionKind;
  /** Si la sesión siguiente confirmó la decisión; sin valor mientras no haya sesión siguiente. */
  outcome?: 'acierto' | 'fallo';
  outcomeDate?: string;
}

export interface LiftProgression {
  key: string;
  /** Multiplicador acumulado sobre la carga que sale del resto del perfil (1 = sin efecto). */
  factor: number;
  /** Sesiones limpias seguidas que lleva (se reinicia al subir o al salir una que no es limpia). */
  cleanStreak: number;
  failStreak: number;
  /** Sesiones limpias necesarias ahora mismo para subir. */
  needed: number;
  decisions: ProgressionDecision[];
  lastRecord: ProgressionRecord | null;
}

/** Sesiones limpias que hacían falta en una fecha: lo aceptado (solo en fuerza) vale desde su fecha, hacia delante. */
export function cleanNeededOn(date: string, settings?: ProgressionSettings, kind: ProgressionKind = 'strength'): number {
  if (kind === 'oly') return PROGRESSION_RULES.oly.cleanNeeded;
  if (settings?.cleanNeeded && settings.cleanNeededSince && date >= settings.cleanNeededSince) return settings.cleanNeeded;
  return DEFAULT_CLEAN_NEEDED;
}

/** Los registros de un levantamiento que valen: los posteriores al último cambio de su PR (con otra base, lo anterior ya no cuenta). */
function relevantRecords(records: ProgressionRecord[], key: string, prLog: PrLogEntry[] | undefined): ProgressionRecord[] {
  const lastPrChange = (prLog ?? []).filter((e) => e.key === key).reduce((m, e) => (e.date > m ? e.date : m), '');
  return records.filter((r) => r.key === key && r.date > lastPrChange).sort((a, b) => a.date.localeCompare(b.date));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function liftProgression(
  records: ProgressionRecord[] | undefined,
  key: string,
  prLog?: PrLogEntry[],
  settings?: ProgressionSettings,
  /** Si se da, solo cuentan las sesiones hasta esta fecha (incluida). */
  upTo?: string,
): LiftProgression {
  let list = relevantRecords(records ?? [], key, prLog);
  if (upTo) list = list.filter((r) => r.date <= upTo);

  let factor = 1;
  let cleanStreak = 0;
  let failStreak = 0;
  const decisions: ProgressionDecision[] = [];

  for (const r of list) {
    const kind = kindOf(r);
    const rule = PROGRESSION_RULES[kind];
    const pending = decisions[decisions.length - 1];
    if (pending && pending.outcome === undefined) {
      pending.outcome = pending.kind === 'subir' ? (r.verdict === 'limpia' ? 'acierto' : 'fallo') : r.verdict === 'fallo' ? 'fallo' : 'acierto';
      pending.outcomeDate = r.date;
    }
    cleanStreak = r.verdict === 'limpia' ? cleanStreak + 1 : 0;
    failStreak = r.verdict === 'fallo' ? failStreak + 1 : 0;

    if (cleanStreak >= cleanNeededOn(r.date, settings, kind)) {
      cleanStreak = 0;
      if (factor < rule.max) {
        factor = round3(clamp(factor + rule.up, rule.min, rule.max));
        decisions.push({ date: r.date, key, kind: 'subir', block: kind });
      }
    } else if (failStreak >= rule.failNeeded) {
      failStreak = 0;
      if (factor > rule.min) {
        factor = round3(clamp(factor - rule.down, rule.min, rule.max));
        decisions.push({ date: r.date, key, kind: 'bajar', block: kind });
      }
    }
  }

  const last = list[list.length - 1] ?? null;
  const lastKind = last ? kindOf(last) : 'strength';
  return { key, factor, cleanStreak, failStreak, needed: cleanNeededOn(upTo ?? '9999-12-31', settings, lastKind), decisions, lastRecord: last };
}

/** Los factores de todos los levantamientos con registro, para que el generador los aplique (solo los que se apartan de 1). */
export function progressionFactors(records: ProgressionRecord[] | undefined, prLog?: PrLogEntry[], settings?: ProgressionSettings): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set((records ?? []).map((r) => r.key))) {
    const f = liftProgression(records, key, prLog, settings).factor;
    if (f !== 1) out[key] = f;
  }
  return out;
}

// ---------- Lo que cuenta la tarjeta al cerrar la sesión ----------

export interface SessionProgressionView {
  record: ProgressionRecord;
  kind: ProgressionKind;
  change: 'subio' | 'bajo' | 'igual';
  /** Sesiones limpias seguidas tras esta sesión y las que hacen falta (para los puntos). */
  cleanStreak: number;
  needed: number;
  failStreak: number;
  /** Carga aproximada de la próxima vez, cuando el factor cambió con esta sesión. */
  nextKg?: number;
  /** Un porcentaje de cambio redondeado (2,5 o -5), si cambió. */
  deltaPct?: number;
}

/** Qué decidió el coach con el resultado de una fecha. null si ese día no hay registro de ese movimiento. */
export function sessionProgressionView(
  records: ProgressionRecord[] | undefined,
  prLog: PrLogEntry[] | undefined,
  settings: ProgressionSettings | undefined,
  date: string,
  movementId: string,
): SessionProgressionView | null {
  const record = (records ?? []).find((r) => r.date === date && r.movementId === movementId);
  if (!record) return null;
  const kind = kindOf(record);
  const dayBefore = new Date(`${date}T12:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const before = liftProgression(records, record.key, prLog, settings, dayBefore.toISOString().slice(0, 10));
  const after = liftProgression(records, record.key, prLog, settings, date);
  const change = after.factor > before.factor ? 'subio' : after.factor < before.factor ? 'bajo' : 'igual';
  return {
    record,
    kind,
    change,
    cleanStreak: after.cleanStreak,
    needed: cleanNeededOn(date, settings, kind),
    failStreak: after.failStreak,
    ...(change !== 'igual'
      ? {
          nextKg: roundToNearestPlate(record.prescribedKg * (after.factor / before.factor)),
          deltaPct: Math.round((after.factor / before.factor - 1) * 1000) / 10,
        }
      : {}),
  };
}

const pctText = (v: number) => String(Math.round(v * 1000) / 10).replace('.', ',');

/** La frase de por qué el coach decidió lo que decidió. */
export function progressionReason(view: SessionProgressionView): string {
  const { record, change, cleanStreak, needed, failStreak, kind } = view;
  const rule = PROGRESSION_RULES[kind];
  if (change === 'subio') return `Regla: ${needed} sesiones limpias seguidas.`;
  if (change === 'bajo') return 'Regla: dos sesiones seguidas con fallos.';
  if (record.verdict === 'limpia') return `Sesión limpia ${cleanStreak} de ${needed}. Con ${needed} seguidas, sube.`;
  if (record.verdict === 'fallo') {
    const base = 'Un fallo suelto no baja nada.';
    return failStreak >= 1 ? `${base} Con dos sesiones seguidas con fallos, bajaría un ${pctText(rule.down)} %.` : base;
  }
  if (record.verdict === 'dura') {
    return record.justas ? 'Una serie salió justa: no cuenta como limpia, se queda igual.' : 'Completa pero al límite: no cuenta como limpia, se queda igual.';
  }
  return 'Sin dato de esfuerzo: no cuenta como limpia, se queda igual.';
}

export const VERDICT_LABEL: Record<ProgressionVerdict, string> = {
  limpia: 'Sesión limpia',
  hecha: 'Hecha',
  dura: 'Al límite',
  fallo: 'Con fallos',
};

// ---------- El libro de aciertos ----------

export type RuleVerdict = 'funciona' | 'dudosa' | 'sin-datos';

export type RuleId = 'subir' | 'bajar' | 'subir-oly' | 'bajar-oly' | 'enfasis';

export interface RuleLedgerRow {
  rule: RuleId;
  label: string;
  /** Veces que se aplicó. */
  cases: number;
  /** De ellas, con resultado ya conocido. */
  resolved: number;
  hits: number;
  /** 0-1, o null sin casos resueltos. */
  rate: number | null;
  verdict: RuleVerdict;
  detail: string;
}

export function ruleVerdict(resolved: number, hits: number): RuleVerdict {
  if (resolved < VERDICT_MIN_CASES) return 'sin-datos';
  return hits / resolved >= RULE_WORKS_AT ? 'funciona' : 'dudosa';
}

function row(rule: RuleId, label: string, decisions: ProgressionDecision[], detail: (r: { cases: number; resolved: number; hits: number }) => string): RuleLedgerRow {
  const resolved = decisions.filter((d) => d.outcome !== undefined);
  const hits = resolved.filter((d) => d.outcome === 'acierto').length;
  const counts = { cases: decisions.length, resolved: resolved.length, hits };
  return { rule, label, ...counts, rate: resolved.length > 0 ? hits / resolved.length : null, verdict: ruleVerdict(resolved.length, hits), detail: detail(counts) };
}

/** La fila de la revisión del énfasis (4 semanas): solo se guarda la última revisión, así que cuenta lo que dijo esa. */
export function emphasisLedgerRow(plan: EmphasisPlan | undefined): RuleLedgerRow | null {
  const entries = (plan?.review?.entries ?? []).filter((e) => e.decision !== 'esperar');
  if (entries.length === 0) return null;
  const improved = entries.filter((e) => e.decision === 'graduar' || (e.decision === 'seguir' && e.before !== null && e.now !== null && e.now - e.before >= 0.03)).length;
  return {
    rule: 'enfasis',
    label: 'Énfasis de tu perfil (4 semanas)',
    cases: entries.length,
    resolved: entries.length,
    hits: improved,
    rate: improved / entries.length,
    verdict: ruleVerdict(entries.length, improved),
    detail: `Última revisión: ${improved} de ${entries.length} mejoraron`,
  };
}

export interface ProgressionLedger {
  /** Decisiones de carga registradas. */
  total: number;
  resolved: number;
  hits: number;
  rows: RuleLedgerRow[];
}

const times = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`;

export function buildProgressionLedger(records: ProgressionRecord[] | undefined, prLog?: PrLogEntry[], settings?: ProgressionSettings, plan?: EmphasisPlan): ProgressionLedger {
  const all: ProgressionDecision[] = [];
  for (const key of new Set((records ?? []).map((r) => r.key))) all.push(...liftProgression(records, key, prLog, settings).decisions);
  const pick = (kind: DecisionKind, block: ProgressionKind) => all.filter((d) => d.kind === kind && d.block === block);
  const upDetail = ({ cases, resolved, hits }: { cases: number; resolved: number; hits: number }) =>
    `${times(cases)} · ${resolved === 0 ? 'sin sesión siguiente todavía' : `${hits} de ${resolved} salieron limpias la vez siguiente`}`;
  const downDetail = ({ cases, resolved, hits }: { cases: number; resolved: number; hits: number }) =>
    `${times(cases)} · ${resolved === 0 ? 'sin sesión siguiente todavía' : `${hits} de ${resolved} sin fallos la vez siguiente`}`;

  const rows: RuleLedgerRow[] = [];
  const up = pick('subir', 'strength');
  if (up.length > 0) rows.push(row('subir', `Subir carga tras ${settings?.cleanNeeded ?? DEFAULT_CLEAN_NEEDED} sesiones limpias`, up, upDetail));
  const down = pick('bajar', 'strength');
  if (down.length > 0) rows.push(row('bajar', 'Bajar carga con dos sesiones con fallos', down, downDetail));
  const olyUp = pick('subir', 'oly');
  if (olyUp.length > 0) rows.push(row('subir-oly', `Subir carga de oly tras ${PROGRESSION_RULES.oly.cleanNeeded} sesiones limpias`, olyUp, upDetail));
  const olyDown = pick('bajar', 'oly');
  if (olyDown.length > 0) rows.push(row('bajar-oly', 'Bajar carga de oly con dos sesiones con fallos', olyDown, downDetail));
  const emphasis = emphasisLedgerRow(plan);
  if (emphasis) rows.push(emphasis);
  // Los totales cuentan solo las decisiones de carga (el énfasis es otra escala de tiempo).
  const resolvedAll = all.filter((d) => d.outcome !== undefined);
  return { total: all.length, resolved: resolvedAll.length, hits: resolvedAll.filter((d) => d.outcome === 'acierto').length, rows };
}

export interface ProgressionProposal {
  kind: 'tres-limpias';
  hits: number;
  resolved: number;
}

/**
 * Cuándo el coach propone un ajuste: la regla de subir (en fuerza) sale dudosa y aún pide solo dos sesiones limpias. Nunca se
 * aplica sola; si el atleta la deja como está, no vuelve a salir en `PROPOSAL_PAUSE_DAYS` días. El oly ya pide tres.
 */
export function progressionProposal(ledger: ProgressionLedger, settings: ProgressionSettings | undefined, todayIso: string): ProgressionProposal | null {
  const up = ledger.rows.find((r) => r.rule === 'subir');
  if (!up || up.verdict !== 'dudosa') return null;
  if ((settings?.cleanNeeded ?? DEFAULT_CLEAN_NEEDED) !== DEFAULT_CLEAN_NEEDED) return null;
  if (settings?.proposalDismissedOn) {
    const pausedUntil = new Date(`${settings.proposalDismissedOn}T12:00:00Z`);
    pausedUntil.setUTCDate(pausedUntil.getUTCDate() + PROPOSAL_PAUSE_DAYS);
    if (todayIso < pausedUntil.toISOString().slice(0, 10)) return null;
  }
  return { kind: 'tres-limpias', hits: up.hits, resolved: up.resolved };
}

/** Los ajustes tras aceptar la propuesta: desde hoy pide 3 sesiones limpias; lo anterior no cambia. */
export function acceptProposal(settings: ProgressionSettings | undefined, todayIso: string): ProgressionSettings {
  const next: ProgressionSettings = { ...(settings ?? {}), cleanNeeded: 3, cleanNeededSince: todayIso };
  delete next.proposalDismissedOn;
  return next;
}

/** Los ajustes tras dejar la propuesta como está. */
export function dismissProposal(settings: ProgressionSettings | undefined, todayIso: string): ProgressionSettings {
  return { ...(settings ?? {}), proposalDismissedOn: todayIso };
}

// ---------- Aplicar en el generador ----------

/** El factor de progresión de un levantamiento (1 sin registro). */
export function liftProgressionFactor(factors: Record<string, number> | undefined, key: string | null | undefined): number {
  if (!key || !factors) return 1;
  return factors[key] ?? 1;
}

/** Nota para la sesión cuando la progresión mueve la carga. */
export function progressionNote(factor: number): string {
  if (factor > 1) return ` Sube un ${pctText(factor - 1)} % por tus sesiones limpias en este levantamiento.`;
  if (factor < 1) return ` Baja un ${pctText(1 - factor)} % por tus últimas sesiones con fallos en este levantamiento.`;
  return '';
}
