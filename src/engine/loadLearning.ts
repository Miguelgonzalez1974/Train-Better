import type { PersonalRecords, SetFeedbackEntry } from '../data/athlete/types';
import { SETFEEL_MIN_OBS, SETLOAD_MIN_OBS, type ResponseProfile } from './responseProfile';

/**
 * "Tus cargas": lo que el coach ya ha aprendido de cómo te van los pesos, levantamiento a levantamiento, para enseñarlo.
 * No calcula nada nuevo — lee la calibración que `responseProfile` ya aplica al prescribir (`perLiftLoad` por series reales
 * con RPE o del modo entreno, y `setFeel` por la valoración de la 1ª serie) y la traduce a: tu referencia, tu 1RM
 * estimado hoy, cuánto mueve el coach las cargas y por qué.
 */

export type LoadSource = 'series' | 'sensacion' | null;
export type LoadDirection = 'sube' | 'baja' | 'igual';

export interface LoadRow {
  key: string;
  label: string;
  /** Con qué señal se ajusta: series reales (más precisa), la sensación de la 1ª serie o ninguna aún. */
  source: LoadSource;
  /** El máximo que el coach asume al prescribir este levantamiento (tu referencia). */
  reference: number;
  /** Tu 1RM estimado hoy con las series reales; null si solo hay sensación o no hay datos. */
  estimated: number | null;
  /** Cuánto mueve el coach las cargas, en % (positivo = sube). 0 si no hay ajuste. */
  adjustPct: number;
  direction: LoadDirection;
  /** Series o valoraciones en las que se apoya. */
  samples: number;
  /** Con `source` null: las series con peso real que ya hay y las que hacen falta para empezar a ajustar. */
  have: number;
  need: number;
  text: string;
}

const LIFTS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'clean', label: 'Clean' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'cleanAndJerk', label: 'Clean & Jerk' },
];

/** Por debajo de este % no se considera ajuste (ruido). */
const NO_CHANGE_PCT = 1;

function directionOf(pct: number): LoadDirection {
  if (pct >= NO_CHANGE_PCT) return 'sube';
  if (pct <= -NO_CHANGE_PCT) return 'baja';
  return 'igual';
}

function textFor(source: Exclude<LoadSource, null>, direction: LoadDirection, pct: number, estimated: number | null): string {
  const how = source === 'series' ? 'por tus series con peso real' : 'por cómo valoras tu primera serie';
  if (direction === 'sube') return `Te sobra margen ${how}: el coach sube las cargas un ${Math.abs(pct)} %.`;
  if (direction === 'baja') return `Te cuesta más de lo previsto ${how}: el coach baja las cargas un ${Math.abs(pct)} %.`;
  return estimated !== null ? 'Va al punto: tu 1RM estimado coincide con la referencia, sin cambios.' : 'Va al punto: sin cambios.';
}

/** Un renglón por levantamiento con PR: los que ya se ajustan primero (los de más cambio arriba), luego los que aún no tienen datos. */
export function buildLoadRows(prs: PersonalRecords, profile: ResponseProfile, setFeedbackLog: SetFeedbackEntry[] = []): LoadRow[] {
  const rows: LoadRow[] = [];
  for (const { key, label } of LIFTS) {
    const pr = prs[key];
    if (!(pr > 0)) continue;
    const load = profile.perLiftLoad.find((c) => c.key === key);
    const feel = profile.setFeel.find((c) => c.key === key);
    const have = setFeedbackLog.filter((e) => e.prKey === key && e.estimated1rm != null && e.pctOf1rm).length;
    if (load) {
      const adjustPct = Math.round((load.loadFactor - 1) * 100);
      const direction = directionOf(adjustPct);
      rows.push({ key, label, source: 'series', reference: Math.round(load.assumedMax), estimated: Math.round(load.measuredMax), adjustPct, direction, samples: load.samples, have, need: SETLOAD_MIN_OBS, text: textFor('series', direction, adjustPct, load.measuredMax) });
    } else if (feel) {
      const adjustPct = Math.round((feel.loadFactor - 1) * 100);
      const direction = directionOf(adjustPct);
      rows.push({ key, label, source: 'sensacion', reference: pr, estimated: null, adjustPct, direction, samples: feel.observations, have, need: SETLOAD_MIN_OBS, text: textFor('sensacion', direction, adjustPct, null) });
    } else {
      const left = Math.max(0, SETLOAD_MIN_OBS - have);
      rows.push({
        key,
        label,
        source: null,
        reference: pr,
        estimated: null,
        adjustPct: 0,
        direction: 'igual',
        samples: 0,
        have,
        need: SETLOAD_MIN_OBS,
        text: left > 0 ? `Aún sin ajuste: faltan ${left} ${left === 1 ? 'serie' : 'series'} con el peso real y el RPE (o ${SETFEEL_MIN_OBS} valoraciones de la 1ª serie).` : 'Aún sin ajuste.',
      });
    }
  }
  const rank = (r: LoadRow) => (r.source === null ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || Math.abs(b.adjustPct) - Math.abs(a.adjustPct));
}
