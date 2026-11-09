/**
 * Rex y las marcas (los PR): leer una marca escrita («mi back squat es 140», «nuevo PR en banca 92,5», «cuánto levanto en snatch», «mis
 * marcas», «100 x 3 en sentadilla») y contestarla. Pura: la lectura del texto, las frases y el perfil con la marca cambiada; guardar lo hace
 * quien lo usa (`rexAskRouter.ts`). Una marca guardada mueve todas las cargas, así que Rex enseña lo que ha entendido antes de apuntarla.
 */
import type { AthleteProfile, PersonalRecords, VariantPersonalRecords } from '../../data/athlete/types';
import { estimateE1RM } from '../../engine/e1rm';
import type { AskAnswer } from './rexAsk';
import type { RexTarget } from './rexDashboard';

export type MarkKey = keyof PersonalRecords | keyof VariantPersonalRecords;

export interface MarkLift {
  key: MarkKey;
  /** El nombre con el que se ve en la app. */
  label: string;
  /** Las seis variantes opcionales (sumo, push press…) frente a los ocho levantamientos base. */
  variant: boolean;
}

export const MARK_LIFTS: MarkLift[] = [
  { key: 'backSquat', label: 'Back Squat', variant: false },
  { key: 'frontSquat', label: 'Front Squat', variant: false },
  { key: 'benchPress', label: 'Bench Press', variant: false },
  { key: 'deadlift', label: 'Deadlift', variant: false },
  { key: 'strictPress', label: 'Strict Press', variant: false },
  { key: 'clean', label: 'Clean', variant: false },
  { key: 'snatch', label: 'Snatch', variant: false },
  { key: 'cleanAndJerk', label: 'Clean & Jerk', variant: false },
  { key: 'sumoDeadlift', label: 'Sumo Deadlift', variant: true },
  { key: 'pushPress', label: 'Push Press', variant: true },
  { key: 'splitJerk', label: 'Split Jerk', variant: true },
  { key: 'overheadSquat', label: 'Overhead Squat', variant: true },
  { key: 'powerSnatch', label: 'Power Snatch', variant: true },
  { key: 'powerClean', label: 'Power Clean', variant: true },
];

/** Cómo se dice cada levantamiento, ya sin acentos y en minúsculas. Lo más concreto va primero («power snatch» antes que «snatch»). */
const ALIASES: [MarkKey, RegExp][] = [
  ['powerSnatch', /\b(power snatch|arrancada de potencia|snatch de potencia)\b/],
  ['powerClean', /\b(power clean|cargada de potencia|clean de potencia)\b/],
  ['cleanAndJerk', /(\bclean (and|&|y) jerk\b|\bc ?& ?j\b|\bc and j\b|\bclean jerk\b|\bdos tiempos\b|\benvion\b)/],
  ['splitJerk', /\b(split jerk|jerk)\b/],
  ['pushPress', /\bpush press\b/],
  ['overheadSquat', /\b(overhead squat|sentadilla overhead|ohs)\b/],
  ['sumoDeadlift', /\b(sumo|peso muerto sumo)\b/],
  ['frontSquat', /\b(front squat|sentadilla frontal|sentadilla delantera)\b/],
  ['strictPress', /\b(strict press|press militar|press estricto|military press|press de hombro)\b/],
  ['benchPress', /\b(bench|press banca|press de banca|banca)\b/],
  ['deadlift', /\b(deadlift|peso muerto)\b/],
  ['backSquat', /\b(back squat|sentadilla trasera|sentadilla|squat)\b/],
  ['snatch', /\b(snatch|arrancada)\b/],
  ['clean', /\b(clean|cargada)\b/],
];

/** El levantamiento que se nombra en una frase ya normalizada (`normalizeAsk`), o null. */
export function findMarkLift(norm: string): MarkLift | null {
  const hit = ALIASES.find(([, re]) => re.test(norm));
  return hit ? (MARK_LIFTS.find((l) => l.key === hit[0]) ?? null) : null;
}

export function markLiftByKey(key: string): MarkLift | null {
  return MARK_LIFTS.find((l) => l.key === key) ?? null;
}

/** Unos kilos de levantamiento (20-500), escritos «140», «92,5» o «92.5». */
export function findMarkKg(norm: string): number | null {
  const m = norm.match(/(?:^|[^\d.,])(\d{2,3})(?:[.,](\d{1,2}))?(?!\d)/);
  if (!m) return null;
  const kg = Number(`${m[1]}${m[2] ? `.${m[2]}` : ''}`);
  return kg >= 20 && kg <= 500 ? kg : null;
}

/** «100 x 3», «100 kg por 3», «100×3»: una serie con carga y repeticiones. */
export function findLoadReps(norm: string): { loadKg: number; reps: number } | null {
  const m = norm.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg|kgs|kilos?)?\s*(?:x|×|por)\s*(\d{1,2})\b/);
  if (!m) return null;
  const loadKg = Number(m[1].replace(',', '.'));
  const reps = Number(m[2]);
  return loadKg >= 20 && loadKg <= 500 && reps >= 1 ? { loadKg, reps } : null;
}

export function currentMark(profile: Pick<AthleteProfile, 'prs' | 'variantPrs'>, key: MarkKey): number {
  const base = (profile.prs as unknown as Record<string, number | undefined>)[key];
  const variant = (profile.variantPrs as Record<string, number | undefined> | undefined)?.[key];
  return base ?? variant ?? 0;
}

/** El perfil con la marca cambiada. El historial de marcas (`prLog`) lo añade `saveProfile` solo. */
export function applyMark(profile: AthleteProfile, lift: MarkLift, kg: number): AthleteProfile {
  return lift.variant
    ? { ...profile, variantPrs: { ...profile.variantPrs, [lift.key]: kg } }
    : { ...profile, prs: { ...profile.prs, [lift.key]: kg } };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const signed = (n: number) => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;

/** Un salto mayor que esto sobre la marca actual se confirma como posible errata. */
const BIG_JUMP = 0.15;

function viewAction(target: RexTarget): { label: string; target: RexTarget }[] {
  return [{ label: 'Ver la gráfica', target }];
}

/** «¿Cuánto levanto en…?» / «mis marcas»: la marca de un levantamiento con su fecha y cambio, o todas en una frase. */
export function markViewAnswer(profile: AthleteProfile, key: MarkKey | null, analysis: RexTarget): AskAnswer {
  if (key === null) {
    const base = MARK_LIFTS.filter((l) => !l.variant && currentMark(profile, l.key) > 0).map((l) => `${l.label} ${fmt(currentMark(profile, l.key))}`);
    const variants = MARK_LIFTS.filter((l) => l.variant && currentMark(profile, l.key) > 0).map((l) => `${l.label} ${fmt(currentMark(profile, l.key))}`);
    if (base.length === 0 && variants.length === 0) return { lead: 'Aún no tienes marcas.', tone: 'info', text: 'Dime una, por ejemplo «Back Squat 140», y la apunto.', actions: [] };
    return { lead: 'Tus marcas.', tone: 'info', text: `${[...base, ...variants].join(' · ')} (kg).`, actions: viewAction(analysis) };
  }
  const lift = markLiftByKey(key);
  const label = lift?.label ?? key;
  const kg = currentMark(profile, key);
  if (kg <= 0) return { lead: `${label}: sin marca.`, tone: 'mid', text: `Dime cuánto levantas, por ejemplo «${label} 100», y la apunto.`, actions: [] };
  const log = (profile.prLog ?? []).filter((e) => e.key === key).sort((a, b) => a.date.localeCompare(b.date));
  const last = log[log.length - 1];
  const before = log.length > 1 ? log[log.length - 2] : null;
  const when = last ? ` Apuntada el ${shortDate(last.date)}${before && before.kg !== last.kg ? `, ${signed(last.kg - before.kg)} kg desde ${fmt(before.kg)}` : ''}.` : '';
  return { lead: `${label}: ${fmt(kg)} kg.`, tone: 'info', text: when.trim() || 'Es tu marca actual.', actions: viewAction(analysis) };
}

/** Lo que Rex ha entendido antes de guardar: el cambio, con aviso si es un salto raro, y el botón para confirmarlo. */
export function markProposalAnswer(profile: AthleteProfile, lift: MarkLift, kg: number, analysis: RexTarget): AskAnswer {
  const current = currentMark(profile, lift.key);
  if (current === kg) return { lead: 'Ya la tienes.', tone: 'info', text: `${lift.label} ya está en ${fmt(kg)} kg.`, actions: viewAction(analysis) };
  const confirm = { label: current > 0 && kg < current ? 'Sí, bajarla' : 'Sí, apuntar', target: analysis, ask: `confirmo marca ${lift.label} ${kg}` };
  if (current <= 0) return { lead: 'Primera marca.', tone: 'info', text: `${lift.label}: ${fmt(kg)} kg. ¿La apunto?`, actions: [confirm] };
  const diff = kg - current;
  if (kg < current) return { lead: 'Es menos que tu marca.', tone: 'mid', text: `${lift.label}: ${fmt(current)} → ${fmt(kg)} kg (${signed(diff)}). ¿La bajo? Cambia los pesos que te calculo.`, actions: [confirm] };
  if (kg > current * (1 + BIG_JUMP)) {
    const pct = Math.round((diff / current) * 100);
    return { lead: 'Es un salto grande.', tone: 'mid', text: `${lift.label}: ${fmt(current)} → ${fmt(kg)} kg (+${pct} %). ¿Seguro que no es una errata?`, actions: [{ ...confirm, label: 'Sí, es correcta' }] };
  }
  return { lead: `${lift.label}.`, tone: 'good', text: `${fmt(current)} → ${fmt(kg)} kg (${signed(diff)}). ¿Lo apunto?`, actions: [confirm] };
}

/** Tras guardar. */
export function markSavedAnswer(previous: number, lift: MarkLift, kg: number, analysis: RexTarget): AskAnswer {
  const text = previous > 0 ? `${lift.label}: ${fmt(previous)} → ${fmt(kg)} kg (${signed(kg - previous)}). Tus cargas se recalculan con la nueva marca.` : `${lift.label}: ${fmt(kg)} kg.`;
  return { lead: 'Apuntada.', tone: 'good', text, actions: viewAction(analysis) };
}

/** «Apunta una marca» sin decir cuál: se elige el levantamiento. */
export function markPickAnswer(analysis: RexTarget): AskAnswer {
  return {
    lead: 'Una marca.',
    tone: 'info',
    text: '¿De qué levantamiento? Elige uno, o escríbelo con los kilos: «Back Squat 140».',
    actions: MARK_LIFTS.filter((l) => !l.variant).map((l) => ({ label: l.label, target: analysis, ask: `apuntar marca de ${l.label}` })),
  };
}

/** Falta el peso. */
export function markAskKgAnswer(profile: AthleteProfile, lift: MarkLift): AskAnswer {
  const current = currentMark(profile, lift.key);
  return { lead: `${lift.label}.`, tone: 'info', text: `${current > 0 ? `Ahora tienes ${fmt(current)} kg. ` : ''}¿Cuántos kilos? Escríbelo, por ejemplo «${lift.label} ${current > 0 ? fmt(current + 2.5).replace(',', '.') : 100}».`, actions: [] };
}

/** «100 x 3»: una estimación de tu 1RM, que no se guarda como marca sin que lo confirmes. */
export function markEstimateAnswer(profile: AthleteProfile, lift: MarkLift, loadKg: number, reps: number, analysis: RexTarget): AskAnswer {
  if (reps === 1) return markProposalAnswer(profile, lift, loadKg, analysis);
  if (reps > 6) return { lead: 'Demasiadas repeticiones.', tone: 'mid', text: 'Con más de 6 repeticiones no estimo bien tu máximo. Prueba con una serie de 1 a 6.', actions: [] };
  const e1rm = Math.floor(estimateE1RM(loadKg, reps) / 2.5) * 2.5;
  const current = currentMark(profile, lift.key);
  if (e1rm <= current) return { lead: 'No pasa tu marca.', tone: 'info', text: `${fmt(loadKg)} × ${reps} en ${lift.label} equivale a un 1RM de unos ${fmt(e1rm)} kg; tu marca es ${fmt(current)} kg.`, actions: [] };
  return {
    lead: 'Eso da un 1RM de unos ' + `${fmt(e1rm)} kg.`,
    tone: 'good',
    text: `${fmt(loadKg)} × ${reps} en ${lift.label}${current > 0 ? `, frente a tu marca de ${fmt(current)} kg` : ''}. Es una estimación: ¿la apunto como marca?`,
    actions: [{ label: 'Sí, apuntarla', target: analysis, ask: `confirmo marca ${lift.label} ${e1rm}` }],
  };
}
