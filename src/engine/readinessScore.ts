import { computeRecoverySummary, type RecoveryLevel, type RecoverySummary } from './recovery';
import type { HrvPart } from './hrv';
import { morningEnergy, shiftIso, type EnergyInput, type MorningEnergy } from './energy';

/**
 * La PREPARACIÓN de un día: la energía con la que sales esa mañana (ver `engine/energy.ts`), con su nivel y el desglose que se enseña. Es la
 * cifra que usa el coach para el semáforo, el objetivo de esfuerzo, el taper y la descarga. No cambia al entrenar: lo que se mueve durante
 * el día es la energía que te queda.
 */

export interface LoadPart {
  /** Puntos que la carga resta (0 mientras esté dentro de lo seguro). */
  penalty: number;
  /** Una línea con el porqué, en lenguaje de atleta. */
  detail: string;
}

export interface ReadinessScore {
  total: number | null;
  level: RecoveryLevel | null;
  /** true si aún no hay check-in de ese día: las horas de sueño se suponen. */
  estimated: boolean;
  /** De dónde sale la cifra, pieza a pieza; null si no hay datos. */
  energy: MorningEnergy | null;
  load: LoadPart;
  loadPenalty: number;
  /** HRV y pulso de la mañana frente a tu rango y tu media: solo restan, y solo con rango (ver `computeHrvPart`). */
  hrv: HrvPart;
  pain: { count: number; areas: string[]; penalty: number };
  /** La lectura de los check-ins de la semana (barras por día, ejes...). */
  checkins: RecoverySummary;
}

const HIGH_FROM = 65;
const LOW_UNTIL = 40;
/** Para dar una cifra hacen falta al menos estos días con datos (check-in o entreno) en la ventana reciente. */
const RECENT_DAYS = 14;
const MIN_DATA_DAYS = 2;

const es1 = (n: number) => n.toFixed(1).replace('.', ',');
const ZONE_TEXT = { baja: 'carga baja', optima: 'dentro de lo seguro', moderada: 'carga algo alta', alta: 'carga muy alta' } as const;

function loadPart(energy: MorningEnergy): LoadPart {
  const { acwr, penalty } = energy.load;
  if (acwr.coldStart || acwr.acwr === null) return { penalty: 0, detail: 'Aún sin sesiones suficientes para medir tu carga.' };
  return { penalty, detail: `ACWR ${es1(acwr.acwr)} · ${ZONE_TEXT[acwr.zone]}` };
}

export function computeReadinessScore(input: EnergyInput & { today: Date }): ReadinessScore {
  const { today } = input;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const checkins = computeRecoverySummary(input.readinessLog, todayIso);
  const since = shiftIso(todayIso, -RECENT_DAYS);
  const dataDays = new Set([
    ...(input.readinessLog ?? []).filter((c) => c.date > since && c.date <= todayIso).map((c) => c.date),
    ...input.history.filter((h) => h.date > since && h.date < todayIso).map((h) => h.date),
  ]);
  const hasData = dataDays.size >= MIN_DATA_DAYS;

  const energy = morningEnergy(input, todayIso);
  const load = loadPart(energy);
  const pain = { count: energy.pain.areas.length, areas: energy.pain.areas, penalty: energy.pain.penalty };
  const base = { estimated: !energy.hasCheckIn, load, loadPenalty: load.penalty, hrv: energy.hrv, pain, checkins };
  if (!hasData) return { total: null, level: null, energy: null, ...base };
  const level: RecoveryLevel = energy.total >= HIGH_FROM ? 'alta' : energy.total <= LOW_UNTIL ? 'baja' : 'normal';
  return { total: energy.total, level, energy, ...base };
}
