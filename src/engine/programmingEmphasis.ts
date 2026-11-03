import type { AthleteProfile, DailySession, EmphasisItem, EmphasisPlan, SessionHistoryEntry } from '../data/athlete/types';
import { computeAthleteDiagnosis } from './athleteDiagnosis';
import type { EmphasisLevers } from './weekPlan';

/**
 * La programación según el perfil: el diagnóstico del atleta (ver `athleteDiagnosis.ts`) inclina la semana hacia lo que más margen
 * tiene, dentro de la estructura que ya hay (mismos días, mismo objetivo de esfuerzo, mismo macrociclo). Es un empujón, no una
 * reescritura:
 *  - Solo entran áreas con datos fiables, y las que el atleta dijo que no cuadran se quedan fuera.
 *  - Lo que aplica se calcula una vez y se revisa cada 28 días (`EMPHASIS_REVIEW_DAYS`), así que la programación no se reescribe
 *    cada semana.
 *  - Ninguna sesión anterior a `since` cambia, y con el interruptor apagado todo vuelve a como era.
 *  - El motor de la semana lo usa a través de `EmphasisLevers` (ver `weekPlan.ts`); aquí solo se decide qué palancas mover y se
 *    cuenta por qué.
 */

/** Cada cuántos días se recalcula lo que aplica. */
export const EMPHASIS_REVIEW_DAYS = 28;
/** Sin nada que aplicar (pocos datos), se vuelve a mirar antes: en cuanto haya datos no hace falta esperar un mes. */
const EMPTY_REVIEW_DAYS = 7;

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (fromIso: string, toIsoDate: string) => Math.round((new Date(`${toIsoDate}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Qué palanca mueve cada fila del diagnóstico; null si esa fila no tiene palanca (no se aplica). */
export function leverFor(area: EmphasisItem['area'], row: string): EmphasisLevers | null {
  if (area === 'motor') return row === 'base-aerobica' || row === 'umbral' || row === 'potencia' ? { engine: row } : null;
  if (area === 'fuerza') {
    if (row === 'deadlift') return { pattern: 'hinge' };
    if (row === 'benchPress') return { pattern: 'horizontalPush' };
    if (row === 'strictPress') return { pattern: 'verticalPush' };
    return null;
  }
  if (area === 'halterofilia') {
    if (row === 'snatch') return { olyFamily: 'snatch' };
    if (row === 'jerk' || row === 'clean') return { olyFamily: 'clean' };
    return null;
  }
  if (area === 'gimnasticos') return row === 'rx' ? { gymnastics: true } : null;
  return null;
}

/** Lo que cada palanca cambia, dicho en una frase (para la pantalla de Objetivos → Perfil). */
export function describeLever(item: EmphasisItem): string {
  const l = leverFor(item.area, item.row);
  if (l?.engine === 'base-aerobica') return 'Dos WODs largos y a ritmo sostenido por semana, en lugar de uno.';
  if (l?.engine === 'umbral') return 'Dos WODs a umbral por semana, en lugar de uno.';
  if (l?.engine === 'potencia') return 'Dos WODs de potencia por semana, en lugar de uno.';
  if (l?.pattern) return 'El día libre de fuerza va a este patrón, y el accesorio lo refuerza dos días a la semana.';
  if (l?.olyFamily) return 'La halterofilia de la semana empieza por esta familia.';
  if (l?.gymnastics) return 'Un WOD más a la semana lo lideran los gimnásticos.';
  return '';
}

/** Lo que aplica según el diagnóstico de hoy: las prioridades de áreas fiables con palanca, y que el atleta no haya dicho que no cuadran. */
export function buildEmphasisItems(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): EmphasisItem[] {
  const diagnosis = computeAthleteDiagnosis({ profile, history, today });
  const items: EmphasisItem[] = [];
  for (const f of diagnosis.focus) {
    if (f.kind !== 'prioridad' || !leverFor(f.key, f.row)) continue;
    const area = diagnosis.areas.find((a) => a.key === f.key);
    if (!area || area.confidence !== 'fiable') continue;
    items.push({ key: `${f.key}:${f.row}`, area: f.key, row: f.row, action: f.action, why: f.why });
  }
  return items;
}

/**
 * Devuelve el perfil con lo que aplica al día, o el mismo si no hay nada que cambiar: la primera vez lo crea (encendido), y cada
 * `EMPHASIS_REVIEW_DAYS` días lo recalcula. Con el interruptor apagado no toca nada.
 */
export function ensureEmphasisPlan(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): AthleteProfile {
  const plan = profile.emphasisPlan;
  if (plan && !plan.enabled) return profile;
  const todayIso = toIso(today);
  if (plan?.computedOn) {
    const age = daysBetween(plan.computedOn, todayIso);
    if (age < (plan.items.length === 0 ? EMPTY_REVIEW_DAYS : EMPHASIS_REVIEW_DAYS)) return profile;
  }
  const items = buildEmphasisItems(profile, history, today);
  const next: EmphasisPlan = { enabled: true, computedOn: todayIso, since: plan?.since ?? todayIso, items, removed: plan?.removed ?? [] };
  return { ...profile, emphasisPlan: next };
}

/** Lo que aplica de verdad ahora: sin lo que el atleta quitó ni las áreas que dijo que no cuadran. */
export function activeEmphasisItems(profile: AthleteProfile): EmphasisItem[] {
  const plan = profile.emphasisPlan;
  if (!plan?.enabled) return [];
  return plan.items.filter((i) => !plan.removed.includes(i.key) && profile.diagnosisChecks?.[i.area]?.verdict !== 'no-cuadra');
}

/** Las palancas de un día: nada antes de `since` ni sin interruptor. null = el motor sale como siempre. */
export function emphasisLevers(profile: AthleteProfile, dateIso: string): (EmphasisLevers & { items: EmphasisItem[] }) | null {
  const plan = profile.emphasisPlan;
  if (!plan?.enabled || !plan.since || dateIso < plan.since) return null;
  const items = activeEmphasisItems(profile);
  const levers: EmphasisLevers = {};
  for (const i of items) Object.assign(levers, leverFor(i.area, i.row));
  return Object.keys(levers).length === 0 ? null : { ...levers, items };
}

// ---------- Lo que se cuenta en la sesión ----------

const PHRASE_ENGINE: Record<NonNullable<EmphasisLevers['engine']>, string> = {
  'base-aerobica': 'más motor largo',
  umbral: 'más trabajo a umbral',
  potencia: 'más potencia',
};
const PHRASE_PATTERN: Record<NonNullable<EmphasisLevers['pattern']>, string> = {
  horizontalPush: 'más empuje horizontal',
  verticalPush: 'más empuje vertical',
  hinge: 'más bisagra de cadera',
  squat: 'más sentadilla',
};
const LABEL_PATTERN: Record<NonNullable<EmphasisLevers['pattern']>, string> = {
  horizontalPush: 'empuje horizontal',
  verticalPush: 'empuje vertical',
  hinge: 'bisagra de cadera',
  squat: 'sentadilla',
};

/** Rol de accesorio que refuerza cada patrón de fuerza (ver `AccessoryRole` en generateSession). */
export const ACCESSORY_ROLE_FOR_PATTERN = { squat: 'unilateralLeg', hinge: 'posterior', horizontalPush: 'hPush', verticalPush: 'vPush' } as const;

/** Qué pasó hoy en la sesión, para decidir qué etiquetas lleva. */
export interface EmphasisDayContext {
  strengthPattern: string | null;
  energySystem: string | null;
  wodDomain: string | null;
  olyFamily: string | null;
  accessoryReinforced: boolean;
}

function whyFor(items: EmphasisItem[], pick: (l: EmphasisLevers) => boolean): string {
  return items.find((i) => {
    const l = leverFor(i.area, i.row);
    return l ? pick(l) : false;
  })?.why ?? '';
}

/**
 * La parte del diagnóstico que se nota en una sesión: una frase para la cabecera, cuándo se revisa y una etiqueta con su porqué en
 * cada bloque que lleva el énfasis. null si hoy no hay nada que contar.
 */
export function sessionEmphasis(profile: AthleteProfile, dateIso: string, ctx: EmphasisDayContext): DailySession['profileEmphasis'] | null {
  const levers = emphasisLevers(profile, dateIso);
  if (!levers) return null;
  const phrases: string[] = [];
  if (levers.engine) phrases.push(PHRASE_ENGINE[levers.engine]);
  if (levers.pattern) phrases.push(PHRASE_PATTERN[levers.pattern]);
  if (levers.olyFamily) phrases.push(levers.olyFamily === 'snatch' ? 'más arrancada' : 'más clean y jerk');
  if (levers.gymnastics) phrases.push('más gimnásticos');
  const blocks: NonNullable<DailySession['profileEmphasis']>['blocks'] = {};
  if (levers.pattern && ctx.strengthPattern === levers.pattern) {
    blocks.strength = { label: `Énfasis · ${LABEL_PATTERN[levers.pattern]}`, why: whyFor(levers.items, (l) => l.pattern === levers.pattern) };
  }
  if (levers.engine && ctx.energySystem === levers.engine) {
    blocks.wod = { label: `Énfasis · ${PHRASE_ENGINE[levers.engine].replace('más ', '')}`, why: whyFor(levers.items, (l) => l.engine === levers.engine) };
  } else if (levers.gymnastics && ctx.wodDomain === 'gymnastics') {
    blocks.wod = { label: 'Énfasis · gimnásticos', why: whyFor(levers.items, (l) => Boolean(l.gymnastics)) };
  }
  if (levers.pattern && ctx.accessoryReinforced) {
    blocks.accessory = { label: `Énfasis · ${LABEL_PATTERN[levers.pattern]}`, why: whyFor(levers.items, (l) => l.pattern === levers.pattern) };
  }
  if (levers.olyFamily && ctx.olyFamily === levers.olyFamily) {
    blocks.oly = { label: `Énfasis · ${levers.olyFamily === 'snatch' ? 'arrancada' : 'clean y jerk'}`, why: whyFor(levers.items, (l) => l.olyFamily === levers.olyFamily) };
  }
  const plan = profile.emphasisPlan;
  return {
    summary: `Estas semanas: ${phrases.join(' y ')}.`,
    reviewOn: plan?.computedOn ? addDaysIso(plan.computedOn, EMPHASIS_REVIEW_DAYS) : undefined,
    blocks,
  };
}
