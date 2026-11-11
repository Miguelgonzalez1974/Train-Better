import type { Goal, GoalType, SessionHistoryEntry, WodLogEntry, WodScalingEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { SKILL_PROGRESSIONS } from '../data/movements/skillProgressions';
import { addDaysIso, isoDiffDays } from './periodization';

/**
 * «Tu WOD por zonas»: cómo haces los WODs a lo largo del tiempo (Rx, escalado por peso, escalado por movimiento o no terminado) por zona
 * del WOD y movimiento a movimiento, y de ahí qué hay que mejorar. Solo lee lo que tú anotas al cerrar el WOD (`wodScaling`): no adivina
 * nada. No cambia la programación; lo único que puede hacer es ofrecer «Trabajarlo», que crea un objetivo normal que se quita en Objetivos.
 * Puro: la fecha entra por parámetro.
 */

export type WodZone = 'gimnasticos' | 'barra' | 'cardio' | 'corporal';

export const ZONE_LABEL: Record<WodZone, string> = { gimnasticos: 'Gimnásticos', barra: 'Barra y cargas', cardio: 'Cardio', corporal: 'Peso corporal' };
export const ZONE_EXAMPLES: Record<WodZone, string> = { gimnasticos: 'Dominadas, HSPU, T2B', barra: 'Thruster, clean, snatch', cardio: 'Remo, bici, carrera', corporal: 'Burpee, box jump' };
export const ZONE_ORDER: WodZone[] = ['gimnasticos', 'barra', 'cardio', 'corporal'];

const LOAD_EQUIPMENT = /barbell|barra(?! de dominadas)|dumbbell|mancuerna|kettlebell|pesa rusa|balón|balon|medicine|wall ?ball|disco|plate/i;

/** La zona del WOD a la que pertenece un movimiento, o null si no encaja en ninguna. */
export function zoneOf(movementId: string): WodZone | null {
  const m = getMovementById(movementId);
  if (!m) return null;
  if (m.tags.includes('gimnasia') || m.tags.includes('gymnastics')) return 'gimnasticos';
  if (m.tags.includes('cardio') || m.pattern === 'monostructural') return 'cardio';
  if (m.equipment.some((e) => LOAD_EQUIPMENT.test(e)) || m.tags.includes('funcional') || m.pattern === 'olyLift') return 'barra';
  if (m.tags.includes('bodyweight') || m.pattern === 'jump') return 'corporal';
  return null;
}

/** Por qué movimientos se puede cambiar uno (los «más fáciles» del catálogo que existen). */
export function scalingAlternatives(movementId: string): { id: string; name: string }[] {
  const m = getMovementById(movementId);
  if (!m) return [];
  return m.scaling.easier.map((id) => getMovementById(id)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => ({ id: x.id, name: x.name }));
}

export type WodClass = 'rx' | 'peso' | 'movimiento' | 'cap';

export interface ZoneStat {
  zone: WodZone;
  label: string;
  examples: string;
  /** WODs de esa zona en el periodo. */
  wods: number;
  /** Porcentajes enteros que suman 100: Rx, escalado por peso, escalado por movimiento y no terminado (cap). */
  rx: number;
  peso: number;
  movimiento: number;
  cap: number;
  /** % de WODs Rx en la primera y la segunda mitad del periodo; null si no hay datos suficientes en alguna. */
  trend: { before: number; now: number } | null;
}

export interface MovementFlag {
  movementId: string;
  name: string;
  kind: 'movimiento' | 'peso';
  zone: WodZone | null;
  /** Veces que salió en un WOD del periodo y cuántas se escaló. */
  n: number;
  scaled: number;
  detail: string;
  /** Hay un objetivo que se puede crear para trabajarlo. */
  workable: boolean;
}

export interface WodMovementsReport {
  /** WODs con movimientos y con el escalado anotado dentro del periodo. */
  wods: number;
  zones: ZoneStat[];
  improve: MovementFlag[];
  good: string[];
}

/** Un WOD del historial listo para analizar: sus movimientos y qué se hizo con cada uno. Las entradas sin anotar el escalado no cuentan (salvo las Rx de antes). */
interface WodSample {
  date: string;
  movementIds: string[];
  scaling: WodScalingEntry[];
  capped: boolean;
}

function samplesOf(history: SessionHistoryEntry[], wodLog: WodLogEntry[] = []): WodSample[] {
  const out: WodSample[] = wodLog
    .filter((e) => e.movementIds.length > 0)
    .map((e) => ({ date: e.date, movementIds: [...new Set(e.movementIds)].filter((id) => getMovementById(id)), scaling: e.scaling, capped: Boolean(e.capped) }));
  const logged = new Set(wodLog.map((e) => e.date));
  for (const h of history) {
    // Lo anotado en el registro largo manda; el historial solo aporta lo que no está ahí (las Rx de antes).
    if (logged.has(h.date)) continue;
    const ids = [...new Set(h.wodMovementIds ?? [])].filter((id) => getMovementById(id));
    if (ids.length === 0) continue;
    // Anotado: el detalle de lo que se escaló. Sin él, solo se sabe que fue todo Rx cuando la entrada decía «rx»; un «escalado» sin detalle no dice qué.
    const scaling = h.wodScaling ?? (h.rxOrScaled === 'rx' ? [] : null);
    if (scaling === null) continue;
    out.push({ date: h.date, movementIds: ids, scaling, capped: Boolean(h.wodResult?.capped || h.wodResult2?.capped) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function classify(sample: WodSample, inZone: (id: string) => boolean): WodClass {
  if (sample.capped) return 'cap';
  const mine = sample.scaling.filter((s) => inZone(s.movementId));
  if (mine.some((s) => s.kind === 'movimiento')) return 'movimiento';
  if (mine.some((s) => s.kind === 'peso')) return 'peso';
  return 'rx';
}

/** Reparte porcentajes enteros que suman 100. */
function percents(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    floor[o.i] += 1;
    left -= 1;
  }
  return floor;
}

const rxShare = (cls: WodClass[]) => (cls.length === 0 ? null : Math.round((cls.filter((c) => c === 'rx').length / cls.length) * 100));

function nameOf(id: string): string {
  return getMovementById(id)?.name ?? id;
}

const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/** Cuántas veces salió y se escaló un movimiento en unos WODs. */
function movementCounts(samples: WodSample[], id: string): { n: number; mov: number; peso: number; substitutes: string[]; pcts: number[]; loads: number[]; rxKgs: number[]; capped: number } {
  const r = { n: 0, mov: 0, peso: 0, substitutes: [] as string[], pcts: [] as number[], loads: [] as number[], rxKgs: [] as number[], capped: 0 };
  for (const s of samples) {
    if (!s.movementIds.includes(id)) continue;
    r.n += 1;
    if (s.capped) r.capped += 1;
    for (const e of s.scaling.filter((x) => x.movementId === id)) {
      if (e.kind === 'movimiento') {
        r.mov += 1;
        if (e.substituteId) r.substitutes.push(e.substituteId);
      } else {
        r.peso += 1;
        if (e.loadKg && e.rxKg) {
          r.pcts.push(e.loadKg / e.rxKg);
          r.loads.push(e.loadKg);
          r.rxKgs.push(e.rxKg);
        }
      }
    }
  }
  return r;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function mostCommon(xs: string[]): string | null {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Qué hay que mejorar y cómo vas por zonas. `weeks` = ventana en semanas hasta hoy; null = todo el historial. */
export function analyzeWodMovements(history: SessionHistoryEntry[], todayIso: string, weeks: number | null, wodLog: WodLogEntry[] = []): WodMovementsReport {
  const all = samplesOf(history, wodLog).filter((s) => s.date <= todayIso);
  const since = weeks === null ? (all[0]?.date ?? todayIso) : addDaysIso(todayIso, -weeks * 7 + 1);
  const samples = all.filter((s) => s.date >= since);
  const previous = weeks === null ? [] : all.filter((s) => s.date < since && s.date >= addDaysIso(since, -weeks * 7));
  const mid = addDaysIso(since, Math.floor(isoDiffDays(since, todayIso) / 2));

  const zones: ZoneStat[] = [];
  for (const zone of ZONE_ORDER) {
    const inZone = (id: string) => zoneOf(id) === zone;
    const mine = samples.filter((s) => s.movementIds.some(inZone));
    if (mine.length === 0) continue;
    const cls = mine.map((s) => classify(s, inZone));
    const counts = (['rx', 'peso', 'movimiento', 'cap'] as WodClass[]).map((c) => cls.filter((x) => x === c).length);
    const [rx, peso, movimiento, cap] = percents(counts);
    const firstHalf = mine.filter((s) => s.date < mid).map((s) => classify(s, inZone));
    const secondHalf = mine.filter((s) => s.date >= mid).map((s) => classify(s, inZone));
    const before = firstHalf.length >= 2 ? rxShare(firstHalf) : null;
    const now = secondHalf.length >= 2 ? rxShare(secondHalf) : null;
    zones.push({ zone, label: ZONE_LABEL[zone], examples: ZONE_EXAMPLES[zone], wods: mine.length, rx, peso, movimiento, cap, trend: before !== null && now !== null ? { before, now } : null });
  }

  const ids = [...new Set(samples.flatMap((s) => s.movementIds))];
  const improve: MovementFlag[] = [];
  const good: { id: string; n: number }[] = [];
  for (const id of ids) {
    const c = movementCounts(samples, id);
    const p = movementCounts(previous, id);
    const zone = zoneOf(id);
    const name = nameOf(id);
    if (c.mov >= 2 && c.mov / c.n >= 0.4) {
      const sub = mostCommon(c.substitutes);
      const before = p.n > 0 ? ` · antes ${p.mov} de ${p.n}` : '';
      improve.push({ movementId: id, name, kind: 'movimiento', zone, n: c.n, scaled: c.mov, detail: `Cambiado${sub ? ` por ${nameOf(sub).toLowerCase()}` : ''} en ${c.mov} de ${c.n}${before}`, workable: workGoalFor(id) !== null });
    } else if (c.peso >= 3 && c.peso / c.n >= 0.5) {
      let detail = `Peso escalado en ${c.peso} de ${c.n}`;
      if (c.pcts.length > 0) {
        const pct = Math.round(avg(c.pcts) * 100);
        const before = p.pcts.length > 0 ? ` · antes ${Math.round(avg(p.pcts) * 100)} %` : '';
        detail = `${kgText(avg(c.loads))} de ${kgText(avg(c.rxKgs))} · ${pct} % del Rx${before}`;
      }
      improve.push({ movementId: id, name, kind: 'peso', zone, n: c.n, scaled: c.peso, detail, workable: workGoalFor(id) !== null });
    } else if (c.n >= 3 && c.mov === 0 && c.peso === 0 && c.capped === 0) good.push({ id, n: c.n });
  }
  improve.sort((a, b) => (a.kind === b.kind ? b.scaled / b.n - a.scaled / a.n : a.kind === 'movimiento' ? -1 : 1));
  good.sort((a, b) => b.n - a.n);
  return { wods: samples.length, zones, improve, good: good.slice(0, 5).map((g) => nameOf(g.id)) };
}

/** Los movimientos de WOD que tienen un objetivo para trabajarlos: la habilidad (con su progresión por escalones) o el levantamiento de fuerza u oly de detrás. */
export interface WorkGoal {
  type: GoalType;
  movementId: string;
  /** De dónde parte el atleta en una habilidad (0 = desde cero). */
  skillLevel?: number;
  /** Frase para confirmar: qué se crea. */
  summary: string;
}

const SKILL_TARGETS = new Set(SKILL_PROGRESSIONS.map((p) => p.targetMovementId));

/** El objetivo que crea «Trabajarlo» para un movimiento, o null si no hay uno que encaje. */
export function workGoalFor(movementId: string): WorkGoal | null {
  const skill = (id: string): WorkGoal | null => {
    const target = getMovementById(id);
    return target ? { type: 'mejorar-gimnasticos', movementId: id, skillLevel: 0.25, summary: `Creo el objetivo «Mejorar gimnásticos · ${target.name}» a 8 semanas: la habilidad lidera un WOD más a la semana y se progresa por escalones.` } : null;
  };
  if (SKILL_TARGETS.has(movementId)) return skill(movementId);
  const id = movementId;
  if (/chest-to-bar/.test(id)) return skill('chest-to-bar-pull-up');
  if (/muscle-up/.test(id)) return skill(SKILL_TARGETS.has('bar-muscle-up') ? 'bar-muscle-up' : 'ring-muscle-up');
  if (/pull-up|chin-up/.test(id)) return skill('strict-pull-up');
  if (/toes-to-bar|knees-to-elbow/.test(id)) return skill('toes-to-bar');
  if (/handstand-push-up|hspu/.test(id)) return skill('handstand-push-up');
  if (/handstand-walk/.test(id)) return skill('handstand-walk');
  if (/double-under/.test(id)) return skill('double-under');
  if (/rope-climb/.test(id)) return skill('rope-climb');
  const lift = (type: GoalType, liftId: string): WorkGoal | null => {
    const target = getMovementById(liftId);
    return target ? { type, movementId: liftId, summary: `Creo el objetivo «${type === 'mejorar-potencia' ? 'Halterofilia' : 'Subir PR'} · ${target.name}» a 8 semanas: ese levantamiento sale más como principal.` } : null;
  };
  if (/thruster|wall-ball|front-squat|cluster/.test(id)) return lift('subir-pr', 'front-squat');
  if (/snatch/.test(id)) return lift('mejorar-potencia', 'snatch');
  if (/clean|jerk/.test(id)) return lift('mejorar-potencia', 'clean-and-jerk');
  if (/deadlift/.test(id)) return lift('elevar-fuerza', 'deadlift');
  return null;
}

/** El objetivo listo para guardar de «Trabajarlo»: a 8 semanas, con el énfasis moderado. */
export function buildWorkGoal(movementId: string, todayIso: string, newId: () => string = () => crypto.randomUUID()): Goal | null {
  const w = workGoalFor(movementId);
  if (!w) return null;
  return { id: newId(), type: w.type, movementId: w.movementId, targetDate: addDaysIso(todayIso, 56), emphasis: 'moderado', createdAt: todayIso, ...(w.skillLevel !== undefined ? { skillLevel: w.skillLevel } : {}) };
}

/**
 * Lo que se guarda del WOD al cerrar la sesión: Rx (un array vacío) o lo que se escaló, y la dureza. `asked` son los movimientos por los
 * que se preguntó (sin las partes del WOD marcadas como no hechas); sin ninguno no se guarda nada. «Escalé algo» sin decir qué no dice
 * nada del escalado: se guarda solo la dureza.
 */
export function buildWodDetail(
  asked: { movementId: string; part: 1 | 2 }[],
  rxOrScaled: 'rx' | 'scaled',
  scaling: WodScalingEntry[],
  feel: SessionHistoryEntry['wodFeel'],
): { scaling?: WodScalingEntry[]; feel?: SessionHistoryEntry['wodFeel'] } | undefined {
  if (asked.length === 0) return undefined;
  const kept = scaling.filter((e) => asked.some((m) => m.movementId === e.movementId && m.part === (e.part ?? 1)));
  return { ...(rxOrScaled === 'rx' ? { scaling: [] } : kept.length > 0 ? { scaling: kept } : {}), ...(feel ? { feel } : {}) };
}
