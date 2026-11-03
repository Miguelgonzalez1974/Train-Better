import type { AthleteProfile, DailySession, EmphasisItem, EmphasisPlan, EmphasisReviewEntry, SessionHistoryEntry } from '../data/athlete/types';
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

/** Cuántas cosas a la vez como mucho: un empujón, no una reescritura. */
export const MAX_EMPHASIS_ITEMS = 2;
/** Con esto o más frente a lo esperable (1 = en lo esperable) una cosa se da por lograda y pasa a mantener. */
export const GRADUATE_AT = 0.93;
/** Cuánto tiene que subir entre revisiones para contar como mejora (en puntos de ratio). */
export const IMPROVE_BY = 0.03;
/** Datos nuevos mínimos desde la última vez para decidir algo; con menos, se espera. */
export const MIN_NEW_SAMPLES = 3;
/** Revisiones seguidas sin mejora (8 semanas) tras las que se deja de insistir. */
export const STALLED_LIMIT = 2;
/** Si no había datos para decidir, se vuelve a revisar antes. */
export const WAIT_REVIEW_DAYS = 14;
/** Lo que se rotó no vuelve en este tiempo. */
export const ROTATED_PAUSE_DAYS = 56;

type Diagnosis = ReturnType<typeof computeAthleteDiagnosis>;

/** Cómo está una fila del diagnóstico ahora: su ratio frente a lo esperable y con cuántos datos. null si ya no hay fila. */
function rowNow(diagnosis: Diagnosis, area: EmphasisItem['area'], row: string): { ratio: number; samples: number } | null {
  const a = diagnosis.areas.find((x) => x.key === area);
  const r = a?.rows.find((x) => x.id === row);
  return a && r && r.ratio !== null ? { ratio: r.ratio, samples: r.n ?? a.samples } : null;
}

/** De qué se habla al avisar de una revisión ("tu motor largo", "tu empuje horizontal"). */
export function emphasisSubject(area: EmphasisItem['area'], row: string): string {
  const l = leverFor(area, row);
  if (l?.engine === 'base-aerobica') return 'tu motor largo';
  if (l?.engine === 'umbral') return 'tu trabajo a umbral';
  if (l?.engine === 'potencia') return 'tu potencia';
  if (l?.pattern === 'horizontalPush') return 'tu empuje horizontal';
  if (l?.pattern === 'verticalPush') return 'tu empuje vertical';
  if (l?.pattern === 'hinge') return 'tu bisagra de cadera';
  if (l?.pattern === 'squat') return 'tu sentadilla';
  if (l?.olyFamily) return l.olyFamily === 'snatch' ? 'tu arrancada' : 'tu clean y jerk';
  if (l?.gymnastics) return 'tus gimnásticos';
  return 'este punto';
}

/** Un ratio como se enseña: el motor, como "−22 %" frente a lo estimado; el resto, como "78 % de lo esperable". */
export function formatRatio(area: EmphasisItem['area'], ratio: number): string {
  if (area === 'motor') {
    const p = Math.round((ratio - 1) * 100);
    return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`;
  }
  return `${Math.round(ratio * 100)} % de lo esperable`;
}

/** Lo que aplica según el diagnóstico de hoy: las prioridades de áreas fiables con palanca, con el punto de partida de cada una. */
export function buildEmphasisItems(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date, diagnosis?: Diagnosis): EmphasisItem[] {
  const d = diagnosis ?? computeAthleteDiagnosis({ profile, history, today });
  const items: EmphasisItem[] = [];
  for (const f of d.focus) {
    if (f.kind !== 'prioridad' || !leverFor(f.key, f.row)) continue;
    const area = d.areas.find((a) => a.key === f.key);
    if (!area || area.confidence !== 'fiable') continue;
    const start = rowNow(d, f.key, f.row);
    items.push({ key: `${f.key}:${f.row}`, area: f.key, row: f.row, action: f.action, why: f.why, ...(start ? { baseline: start } : {}), stalled: 0 });
  }
  return items;
}

/**
 * La revisión de las 4 semanas: compara cada cosa que se priorizó con cómo estaba al empezar y decide, con reglas fijas, qué hacer:
 * graduar (ya está en lo esperable: pasa a mantener), seguir (mejora pero aún por detrás, o aún no hay prueba de que no sirva),
 * rotar (sin mejora en 8 semanas: se deja de insistir y se pasa a otra cosa) o esperar (menos de `MIN_NEW_SAMPLES` datos nuevos: no se
 * decide nada). Lo que sigue y lo nuevo suman como mucho `MAX_EMPHASIS_ITEMS`.
 */
function reviewPlan(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date, plan: EmphasisPlan): EmphasisPlan {
  const todayIso = toIso(today);
  const diagnosis = computeAthleteDiagnosis({ profile, history, today });
  const entries: EmphasisReviewEntry[] = [];
  const continuing: EmphasisItem[] = [];
  const maintained = [...(plan.maintained ?? [])];
  const rotated = { ...(plan.rotated ?? {}) };

  for (const item of plan.items) {
    if (plan.removed.includes(item.key)) continue; // lo que quitó el atleta no se revisa
    const cur = rowNow(diagnosis, item.area, item.row);
    const base = { key: item.key, area: item.area, label: item.action };
    if (!item.baseline || !cur) {
      entries.push({ ...base, before: item.baseline?.ratio ?? null, now: cur?.ratio ?? null, newSamples: 0, decision: 'esperar', reason: 'Aún sin datos para comparar.' });
      continuing.push({ ...item, ...(cur && !item.baseline ? { baseline: cur } : {}) });
      continue;
    }
    const newSamples = cur.samples - item.baseline.samples;
    const common = { ...base, before: item.baseline.ratio, now: cur.ratio, newSamples };
    if (newSamples < MIN_NEW_SAMPLES) {
      entries.push({ ...common, decision: 'esperar', reason: `Solo ${Math.max(0, newSamples)} ${newSamples === 1 ? 'dato nuevo' : 'datos nuevos'}: hacen falta ${MIN_NEW_SAMPLES} para decidir.` });
      continuing.push(item);
    } else if (cur.ratio >= GRADUATE_AT) {
      entries.push({ ...common, decision: 'graduar', reason: 'Ya está cerca de lo esperable. Pasa a mantener: se vuelve a la programación habitual, sin el refuerzo.' });
      maintained.unshift({ key: item.key, action: item.action });
    } else if (cur.ratio - item.baseline.ratio >= IMPROVE_BY) {
      entries.push({ ...common, decision: 'seguir', reason: 'Mejora, pero aún por detrás de lo esperable. Se mantiene 4 semanas más.' });
      continuing.push({ ...item, baseline: cur, stalled: 0 });
    } else if ((item.stalled ?? 0) + 1 >= STALLED_LIMIT) {
      entries.push({ ...common, decision: 'rotar', reason: 'No mejora tras 8 semanas. Dejo de insistir y paso a otra cosa; se vuelve a mirar más adelante.' });
      rotated[item.key] = todayIso;
    } else {
      entries.push({ ...common, decision: 'seguir', reason: 'Todavía no mejora. Se mantiene 4 semanas más antes de decidir si hace falta otra cosa.' });
      continuing.push({ ...item, baseline: cur, stalled: (item.stalled ?? 0) + 1 });
    }
  }

  const taken = new Set([...continuing.map((i) => i.key), ...maintained.map((m) => m.key)]);
  const paused = (key: string) => rotated[key] !== undefined && daysBetween(rotated[key], todayIso) < ROTATED_PAUSE_DAYS;
  const fresh = buildEmphasisItems(profile, history, today, diagnosis).filter((i) => !taken.has(i.key) && !plan.removed.includes(i.key) && !paused(i.key));
  const items = [...continuing, ...fresh].slice(0, MAX_EMPHASIS_ITEMS);
  // Si no se pudo decidir nada, se vuelve a mirar pronto y no se avisa en el Resumen.
  const waitOnly = entries.length > 0 && entries.every((e) => e.decision === 'esperar');
  return {
    ...plan,
    computedOn: todayIso,
    reviewOn: addDaysIso(todayIso, waitOnly ? WAIT_REVIEW_DAYS : EMPHASIS_REVIEW_DAYS),
    items,
    maintained: maintained.slice(0, 3),
    rotated,
    ...(entries.length > 0 ? { review: { date: todayIso, entries, seen: waitOnly, noticed: waitOnly } } : {}),
  };
}

/** Cuándo toca revisar el plan: la fecha guardada o, sin ella, 28 días tras calcularlo (7 si no había nada que aplicar). */
export function nextReviewOn(plan: EmphasisPlan): string | null {
  if (plan.reviewOn) return plan.reviewOn;
  return plan.computedOn ? addDaysIso(plan.computedOn, plan.items.length === 0 ? EMPTY_REVIEW_DAYS : EMPHASIS_REVIEW_DAYS) : null;
}

/**
 * Devuelve el perfil con lo que aplica al día, o el mismo si no hay nada que cambiar: la primera vez lo crea (encendido) y, cuando
 * toca (cada 28 días), hace la revisión (ver `reviewPlan`). Con el interruptor apagado no toca nada.
 */
export function ensureEmphasisPlan(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): AthleteProfile {
  const plan = profile.emphasisPlan;
  if (plan && !plan.enabled) return profile;
  const todayIso = toIso(today);
  const due = plan ? nextReviewOn(plan) : null;
  if (plan && due && todayIso < due) return profile;
  if (plan && plan.items.length > 0) return { ...profile, emphasisPlan: reviewPlan(profile, history, today, plan) };
  const rotatedNow = plan?.rotated ?? {};
  const items = buildEmphasisItems(profile, history, today)
    .filter((i) => !(plan?.removed ?? []).includes(i.key) && !(rotatedNow[i.key] !== undefined && daysBetween(rotatedNow[i.key], todayIso) < ROTATED_PAUSE_DAYS))
    .slice(0, MAX_EMPHASIS_ITEMS);
  const next: EmphasisPlan = {
    ...(plan ?? {}),
    enabled: true,
    computedOn: todayIso,
    reviewOn: addDaysIso(todayIso, items.length === 0 ? EMPTY_REVIEW_DAYS : EMPHASIS_REVIEW_DAYS),
    since: plan?.since ?? todayIso,
    items,
    removed: plan?.removed ?? [],
  };
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
    reviewOn: plan ? nextReviewOn(plan) ?? undefined : undefined,
    blocks,
  };
}
