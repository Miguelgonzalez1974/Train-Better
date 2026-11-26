/**
 * TU ENERGÍA, de 0 a 100: una sola cifra que se sigue día a día.
 *
 *   - Por la mañana sales con lo que te quedó anoche, más lo que has recuperado durmiendo (una parte de lo que te falta hasta 100, según las
 *     horas), menos lo que arrastras (parte de lo entrenado los dos últimos días o las agujetas, lo mayor), tu estrés y tu ánimo, un HRV
 *     bajo, una carga fuera de lo seguro y las molestias. Esa cifra es tu PREPARACIÓN y no se mueve en todo el día.
 *   - Cada entreno resta: 1 punto por cada 20 de RPE × minutos.
 *   - Por la noche, si contestas cómo acabas el día, tu respuesta corrige la cifra con la que te vas a dormir.
 *
 * Es una ESTIMACIÓN, no una medición: las proporciones son de partida (orientadas por la literatura sobre RPE de sesión, recuperación y sueño)
 * y están juntas aquí para poder ajustarlas. Puro.
 */
import type { HrvHistoryEntry, NightEntry, NightFeel, PainFlag, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { nightHours } from './formCurve';
import { computeHrvPart, hrvLogWith, type HrvPart } from './hrv';
import { computeAcwr, type AcwrResult } from './loadMetrics';
import { PAIN_AREA_LABEL } from './painFlags';

/** Cuánto RPE × minutos gasta un punto de energía: una hora a RPE 7 (420) son 21 puntos. */
export const SRPE_PER_POINT = 20;
/** La parte de lo que te falta hasta 100 que se recupera según las horas dormidas (entre dos puntos se interpola). */
export const SLEEP_CURVE: readonly (readonly [number, number])[] = [
  [0, 0],
  [4, 0.1],
  [5, 0.25],
  [6, 0.4],
  [7, 0.55],
  [8, 0.65],
  [9, 0.7],
];
/** Las horas que se suponen un día sin check-in. */
export const ASSUMED_SLEEP_HOURS = 7;
/** Lo que se arrastra a la mañana siguiente y a la segunda de lo gastado entrenando (un entreno duro no se borra en una noche). */
export const CARRY_SHARE = [0.25, 0.1] as const;
export const SORENESS_POINTS: Record<ReadinessCheck['soreness'], number> = { ninguno: 0, leve: 4, alto: 10 };
/** Cómo te levantas pesa: «Bien» suma 4, «Normal» resta 4 y «Mal» resta 20, para que una mala mañana se note aunque vengas descansado. */
export const STRESS_POINTS: Record<ReadinessCheck['stress'], number> = { bajo: 2, medio: -2, alto: -10 };
export const MOTIVATION_POINTS: Record<ReadinessCheck['motivation'], number> = { alta: 2, normal: -2, baja: -10 };
/** Lo que vale cada respuesta de la noche y cuánto pesa frente a lo calculado (a medias). */
export const NIGHT_VALUE: Record<NightFeel, number> = { reventado: 10, cansado: 30, normal: 50, bien: 70 };
export const NIGHT_WEIGHT = 0.5;
/** La carga solo resta cuando se sale de lo seguro (ACWR). */
export const LOAD_PENALTY: Record<AcwrResult['zone'], number> = { baja: 0, optima: 0, moderada: 10, alta: 20 };
export const PAIN_PENALTY_EACH = 8;
export const PAIN_PENALTY_MAX = 16;
/** Cuántos días hacia atrás se encadena: la recuperación es una parte de lo que falta, así que lo de antes apenas pesa. */
export const CHAIN_DAYS = 28;
/** La energía con la que se supone que acababas la víspera del primer día con datos. */
export const START_ENERGY = 70;

export const clampEnergy = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export function shiftIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La parte (0-1) de lo que falta hasta 100 que devuelve dormir esas horas. */
export function sleepFraction(hours: number): number {
  const first = SLEEP_CURVE[0];
  if (!(hours > first[0])) return first[1];
  for (let i = 1; i < SLEEP_CURVE.length; i++) {
    const [h1, f1] = SLEEP_CURVE[i];
    if (hours <= h1) {
      const [h0, f0] = SLEEP_CURVE[i - 1];
      return f0 + ((f1 - f0) * (hours - h0)) / (h1 - h0);
    }
  }
  return SLEEP_CURVE[SLEEP_CURVE.length - 1][1];
}

/** Los puntos que se recuperan durmiendo `hours` partiendo de `from`. */
export const sleepGain = (from: number, hours: number): number => Math.round((100 - from) * sleepFraction(hours));

/** La energía que gasta una carga (RPE × minutos). */
export const costOfSrpe = (srpe: number): number => (srpe > 0 ? Math.round(srpe / SRPE_PER_POINT) : 0);

/** Lo gastado en una entrada de la carga del día (la suma de todo lo entrenado, ver `withExtraLoad`). */
export const spendOfEntry = (entry: Pick<SessionHistoryEntry, 'rpe' | 'durationMin'> | undefined): number => (entry ? costOfSrpe(entry.rpe * entry.durationMin) : 0);

/** La energía con la que te vas a dormir: la calculada, corregida a medias por cómo dices que acabas. */
export function nightAdjust(computed: number, feel: NightFeel | undefined): number {
  return feel ? clampEnergy(computed + (NIGHT_VALUE[feel] - computed) * NIGHT_WEIGHT) : computed;
}

export interface EnergyInput {
  /** Una entrada por día con TODO lo entrenado (sesión, programa de fuerza y entrenos libres): ver `loadHistoryFor`. */
  history: SessionHistoryEntry[];
  readinessLog: ReadinessCheck[] | undefined;
  hrvHistory?: HrvHistoryEntry[];
  painFlags: PainFlag[] | undefined;
  nightLog?: NightEntry[];
}

/** De dónde sale la energía de una mañana, pieza a pieza (los restos van en positivo y se restan). */
export interface MorningEnergy {
  total: number;
  /** Con cuánta energía te fuiste a dormir (ya con tu respuesta de la noche). */
  from: number;
  /** Tu respuesta de anoche, si la diste. */
  nightFeel?: NightFeel;
  sleepHours: number;
  /** Las horas salen de tu check-in; si no, se suponen. */
  sleepKnown: boolean;
  sleepGain: number;
  /** Lo que arrastras: lo entrenado los dos últimos días o las agujetas, lo que reste más. */
  carry: number;
  carryFrom: 'entreno' | 'agujetas' | null;
  /** Estrés y ánimo del check-in (puede sumar o restar). */
  checkin: number;
  hrv: HrvPart;
  load: { acwr: AcwrResult; penalty: number };
  pain: { areas: string[]; penalty: number };
  hasCheckIn: boolean;
}

/** La energía con la que se acaba un día: la de la mañana menos lo gastado, y la respuesta de la noche si la hay. */
export function eveningEnergy(morning: number, spend: number, feel?: NightFeel): { computed: number; value: number } {
  const computed = clampEnergy(morning - spend);
  return { computed, value: nightAdjust(computed, feel) };
}

/** Las molestias que estaban activas un día: ya marcadas, sin caducar y aún sin quitar. */
const painOn = (flags: PainFlag[] | undefined, day: string): PainFlag[] =>
  (flags ?? []).filter((f) => f.createdDate <= day && (f.until === null || f.until >= day) && (!f.clearedDate || f.clearedDate > day));

/** La energía de la mañana de `dateIso`, encadenando los días anteriores. Solo mira entrenos ANTERIORES a ese día (el de hoy no la cambia). */
export function morningEnergy(input: EnergyInput, dateIso: string): MorningEnergy {
  const byDate = new Map(input.history.map((h) => [h.date, h]));
  const checks = new Map((input.readinessLog ?? []).map((c) => [c.date, c]));
  const nights = new Map((input.nightLog ?? []).map((n) => [n.date, n.feel]));
  const hrvLog = hrvLogWith(input.readinessLog, input.hrvHistory);
  const spend = (iso: string) => spendOfEntry(byDate.get(iso));

  // La cadena empieza en el primer día con datos dentro de la ventana (antes no hay nada que encadenar).
  const windowStart = shiftIso(dateIso, -CHAIN_DAYS);
  const dataDates = [...byDate.keys(), ...checks.keys()].filter((d) => d >= windowStart && d < dateIso).sort();
  let day = dataDates[0] ?? dateIso;
  let previous = START_ENERGY;

  for (;;) {
    const check = checks.get(day);
    const from = previous;
    const sleepHours = check ? nightHours(check) : ASSUMED_SLEEP_HOURS;
    const gain = sleepGain(from, sleepHours);
    const trained = Math.round(CARRY_SHARE[0] * spend(shiftIso(day, -1)) + CARRY_SHARE[1] * spend(shiftIso(day, -2)));
    const sore = check ? SORENESS_POINTS[check.soreness] : 0;
    const carry = Math.max(trained, sore);
    const checkin = check ? STRESS_POINTS[check.stress] + MOTIVATION_POINTS[check.motivation] : 0;
    const hrv = computeHrvPart(hrvLog, day);
    const noon = new Date(`${day}T12:00:00`);
    const acwr = computeAcwr(input.history.filter((h) => h.date < day), noon);
    const loadPenalty = !acwr.coldStart && acwr.acwr !== null ? LOAD_PENALTY[acwr.zone] : 0;
    const areas = [...new Set(painOn(input.painFlags, day).map((f) => PAIN_AREA_LABEL[f.area].toLowerCase()))];
    const painPenalty = Math.min(PAIN_PENALTY_MAX, areas.length * PAIN_PENALTY_EACH);
    const total = clampEnergy(from + gain - carry + checkin - hrv.penalty - loadPenalty - painPenalty);

    if (day >= dateIso) {
      const feel = nights.get(shiftIso(day, -1));
      return {
        total,
        from,
        ...(feel ? { nightFeel: feel } : {}),
        sleepHours,
        sleepKnown: check !== undefined,
        sleepGain: gain,
        carry,
        carryFrom: carry === 0 ? null : sore > trained ? 'agujetas' : 'entreno',
        checkin,
        hrv,
        load: { acwr, penalty: loadPenalty },
        pain: { areas, penalty: painPenalty },
        hasCheckIn: check !== undefined,
      };
    }
    previous = eveningEnergy(total, spend(day), nights.get(day)).value;
    day = shiftIso(day, 1);
  }
}

/** Cómo se dice cada respuesta de la noche. */
export const NIGHT_LABEL: Record<NightFeel, string> = { reventado: 'Reventado', cansado: 'Cansado', normal: 'Normal', bien: 'Bien' };

export interface MorningRow {
  key: 'anoche' | 'sueno' | 'arrastre' | 'animo' | 'hrv' | 'carga' | 'molestias';
  label: string;
  /** La primera fila es de dónde partes; las demás suman o restan puntos. */
  value: number;
  base?: boolean;
  detail?: string;
}

/** La hora del reloj como se guarda con un entreno: «09:05». */
export const clockTime = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** «6 h 24». */
export const hoursText = (h: number): string => {
  const minutes = Math.round(h * 60);
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};

/** El desglose de una mañana en filas: con cuánto te acostaste y lo que cada cosa suma o resta (solo las que hoy cuentan). */
export function morningRows(e: MorningEnergy): MorningRow[] {
  const rows: MorningRow[] = [
    { key: 'anoche', label: 'Anoche acabaste en', value: e.from, base: true, detail: e.nightFeel ? `Con tu respuesta: «${NIGHT_LABEL[e.nightFeel]}»` : undefined },
    { key: 'sueno', label: `Sueño · ${hoursText(e.sleepHours)}`, value: e.sleepGain, detail: e.sleepKnown ? undefined : 'Horas supuestas: falta el check-in' },
  ];
  if (e.carry > 0) rows.push({ key: 'arrastre', label: e.carryFrom === 'agujetas' ? 'Agujetas' : 'Lo entrenado estos días', value: -e.carry });
  if (e.checkin !== 0) rows.push({ key: 'animo', label: 'Estrés y ánimo', value: e.checkin });
  if (e.hrv.penalty > 0) rows.push({ key: 'hrv', label: 'HRV y pulso', value: -e.hrv.penalty, detail: e.hrv.detail || undefined });
  if (e.load.penalty > 0) rows.push({ key: 'carga', label: 'Carga fuera de lo seguro', value: -e.load.penalty });
  if (e.pain.penalty > 0) rows.push({ key: 'molestias', label: 'Molestias activas', value: -e.pain.penalty, detail: e.pain.areas.join(' y ') });
  return rows;
}
