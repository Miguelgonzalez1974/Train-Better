import type { AthleteProfile, Macrocycle, StrengthProgram } from '../data/athlete/types';
import { goalTargetStatus } from './goalTarget';
import { addDaysIso, currentWeekInRange, getWeekdayIndex, isoDiffDays, totalMacrocycleWeeks } from './periodization';
import { PR_KEY_LABEL } from './responseProfile';
import { companionWeeks, isCompanionProgram } from './strengthCompanion';
import { STRENGTH_METHOD_LABEL } from './strengthPrograms';

/**
 * El mapa de la temporada: una línea de tiempo con lo que el coach tiene montado (macros, programa de fuerza, rampa de vuelta, modo
 * competición) y las fechas que importan (competición, metas en kilos), con un marcador de hoy. Se calcula entero del perfil, sin guardar
 * nada. Puro: la fecha entra por parámetro.
 */

export type MapKind = 'macro' | 'programa' | 'rampa' | 'modo';

export interface MapBar {
  id: string;
  kind: MapKind;
  label: string;
  /** Dónde empieza y cuánto ocupa, en % del ancho total. */
  startPct: number;
  widthPct: number;
  /** Fila en la que va (0 = la de arriba). */
  lane: number;
  /** Es un bloque de pico (se pinta en el tono de atención). */
  peak: boolean;
  /** Es el que está en marcha hoy. */
  current: boolean;
  /** Lo que se cuenta al tocarlo. */
  detail: string;
}

export interface MapFlag {
  id: string;
  kind: 'competicion' | 'meta';
  label: string;
  pct: number;
  /** Fila de banderas (0 o 1) para que dos fechas cercanas no se pisen. */
  row: 0 | 1;
  detail: string;
}

export interface SeasonMap {
  startIso: string;
  endIso: string;
  weeks: number;
  todayPct: number;
  months: { label: string; pct: number }[];
  bars: MapBar[];
  flags: MapFlag[];
  lanes: number;
  flagRows: number;
  /** Frase de arriba: el bloque en el que estás y, si hay competición, lo que falta. */
  now: string;
  toCompetition: string | null;
}

const MAX_WEEKS = 53;
const MIN_WEEKS = 8;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const dayText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
const mondayOf = (iso: string) => addDaysIso(iso, -getWeekdayIndex(new Date(`${iso}T00:00:00`)));
const weeksText = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;
const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

interface Raw {
  id: string;
  kind: MapKind;
  label: string;
  start: string;
  end: string;
  peak: boolean;
  detail: string;
}

/** Reparte los elementos en filas que no se solapan, empezando por `first`; devuelve cuántas filas ocupan. */
function assignLanes(items: Raw[], first: number, into: Map<string, number>): number {
  const ends: string[] = [];
  for (const it of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    let lane = ends.findIndex((end) => end < it.start);
    if (lane === -1) {
      lane = ends.length;
      ends.push(it.end);
    } else ends[lane] = it.end;
    into.set(it.id, first + lane);
  }
  return ends.length;
}

function macroDetail(m: Macrocycle): string {
  const p = m.phaseWeeks;
  const phases = p ? ` Acumulación ${p[0]}, intensificación ${p[1]}, pico ${p[2]}, descarga ${p[3]}.` : ' Fases de 4 semanas en bucle.';
  return `${m.label}. Del ${dayText(m.startDate)} al ${dayText(m.endDate)}, ${weeksText(totalMacrocycleWeeks(m))}.${phases}`;
}

function programEnd(p: StrengthProgram): string {
  if (isCompanionProgram(p)) {
    const weeks = companionWeeks(p);
    if (weeks !== null) return addDaysIso(p.startDate, weeks * 7 - 1);
  }
  return p.endDate;
}

/** El mapa de la temporada de `todayIso`, o null si no hay nada que enseñar (sin macros, programa ni competición por delante). */
export function buildSeasonMap(profile: AthleteProfile, todayIso: string): SeasonMap | null {
  const startIso = mondayOf(todayIso);
  const raws: Raw[] = [];

  for (const m of profile.macrocycles.filter((x) => x.endDate >= startIso)) {
    raws.push({ id: `macro:${m.id}`, kind: 'macro', label: m.label, start: m.startDate, end: m.endDate, peak: /\bpico\b/i.test(m.label), detail: macroDetail(m) });
  }
  for (const p of profile.strengthPrograms ?? []) {
    const end = programEnd(p);
    if (end < startIso) continue;
    const weeks = isCompanionProgram(p) ? companionWeeks(p) : null;
    const label = `${STRENGTH_METHOD_LABEL[p.method]}${weeks ? ` · ${weeks} semanas` : ''}`;
    const companion = isCompanionProgram(p) ? ' Convive con el macro: se ofrece debajo de la sesión y el coach cuenta su carga.' : ' Mientras dura, manda sobre el macro.';
    raws.push({ id: `programa:${p.id}`, kind: 'programa', label, start: p.startDate, end, peak: false, detail: `${label}. Del ${dayText(p.startDate)} al ${dayText(end)}.${companion}` });
  }
  const ramp = profile.intensityRamp;
  if (ramp) {
    const weeks = Math.max(ramp.strengthWeeks, ramp.olyWeeks, ramp.wodWeeks);
    const end = addDaysIso(ramp.startDate, weeks * 7 - 1);
    if (end >= startIso) {
      raws.push({
        id: 'rampa',
        kind: 'rampa',
        label: 'Rampa',
        start: ramp.startDate,
        end,
        peak: false,
        detail: `Rampa de vuelta. Fuerza ${weeksText(ramp.strengthWeeks)}, oly ${ramp.olyWeeks} y WOD ${ramp.wodWeeks}: la carga sube poco a poco.`,
      });
    }
  }

  const flags: Omit<MapFlag, 'row'>[] = [];
  const flagIso = new Map<string, string>();
  const comps = profile.goals
    .filter((g) => g.type === 'preparar-competicion')
    .map((g) => ({ g, end: g.eventEndDate && g.eventEndDate >= g.targetDate ? g.eventEndDate : g.targetDate }))
    .filter((c) => c.end >= todayIso)
    .sort((a, b) => a.g.targetDate.localeCompare(b.g.targetDate));
  const comp = comps[0];
  if (comp) {
    const from = addDaysIso(comp.g.targetDate, -28);
    raws.push({
      id: 'modo',
      kind: 'modo',
      label: 'Modo competición',
      start: from < startIso ? startIso : from,
      end: comp.end,
      peak: true,
      detail: 'Modo competición: pico, simulacro unos 10 días antes, taper los últimos 7 días, activación y víspera.',
    });
    const when = comp.end > comp.g.targetDate ? `del ${dayText(comp.g.targetDate)} al ${dayText(comp.end)}` : `el ${dayText(comp.g.targetDate)}`;
    flags.push({
      id: 'comp',
      kind: 'competicion',
      label: `${dayText(comp.g.targetDate)}${comp.g.provisional ? ' · provisional' : ''}`,
      pct: 0,
      detail: `Competición ${when}.${comp.g.provisional ? ' La fecha es provisional: cámbiala en Objetivos cuando la sepas y los bloques se reajustan.' : ''}`,
    });
    flagIso.set('comp', comp.g.targetDate);
  }
  for (const g of profile.goals) {
    if (!g.targetKg || g.targetDate < todayIso) continue;
    const s = goalTargetStatus(g, profile.prs, profile.prLog, new Date(`${todayIso}T12:00:00`));
    if (!s) continue;
    const name = PR_KEY_LABEL[s.key] ?? s.key;
    flags.push({
      id: `meta:${g.id}`,
      kind: 'meta',
      label: `${kgText(g.targetKg)} · ${dayText(g.targetDate)}`,
      pct: 0,
      detail: `Meta: ${name} ${kgText(g.targetKg)} el ${dayText(g.targetDate)}. Hoy ${kgText(s.currentKg)}${s.kind === 'conseguida' ? ': conseguida.' : `, te faltan ${kgText(s.remainingKg)} y necesitas subir ${Number.isFinite(s.neededPerWeek) ? kgText(s.neededPerWeek) : '—'} por semana.`}`,
    });
    flagIso.set(`meta:${g.id}`, g.targetDate);
  }

  if (raws.length === 0) return null;

  // El rango: desde el lunes de esta semana hasta lo último que hay en el plan (mínimo 8 semanas, máximo un año).
  const lastIso = [...raws.map((r) => r.end), ...flagIso.values()].sort().pop() as string;
  const weeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.ceil((isoDiffDays(startIso, lastIso) + 1) / 7)));
  const endIso = addDaysIso(startIso, weeks * 7 - 1);
  const totalDays = weeks * 7;
  const pct = (iso: string) => Math.min(100, Math.max(0, (isoDiffDays(startIso, iso) / totalDays) * 100));

  const laneOf = new Map<string, number>();
  const macros = raws.filter((r) => r.kind === 'macro');
  const programs = raws.filter((r) => r.kind === 'programa');
  const extras = raws.filter((r) => r.kind === 'rampa' || r.kind === 'modo');
  let lane = 0;
  lane += assignLanes(macros, lane, laneOf);
  lane += assignLanes(programs, lane, laneOf);
  lane += assignLanes(extras, lane, laneOf);

  const bars: MapBar[] = raws.map((r) => {
    const left = pct(r.start < startIso ? startIso : r.start);
    const right = pct(addDaysIso(r.end > endIso ? endIso : r.end, 1));
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      startPct: left,
      widthPct: Math.max(0.8, right - left),
      lane: laneOf.get(r.id) ?? 0,
      peak: r.peak,
      current: r.start <= todayIso && todayIso <= r.end,
      detail: r.detail,
    };
  });

  // Banderas: dos fechas a menos de un 12 % una de otra van en filas distintas.
  const placed: MapFlag[] = [];
  const lastRowPct: [number, number] = [-100, -100];
  for (const f of flags.map((x) => ({ ...x, pct: pct(flagIso.get(x.id) as string) })).sort((a, b) => a.pct - b.pct)) {
    const row: 0 | 1 = f.pct - lastRowPct[0] >= 12 ? 0 : 1;
    lastRowPct[row] = f.pct;
    placed.push({ ...f, row });
  }

  const months: SeasonMap['months'] = [];
  for (let d = addDaysIso(startIso, 0); d <= endIso; d = addDaysIso(d, 1)) {
    if (d.endsWith('-01')) months.push({ label: MONTHS[Number(d.slice(5, 7)) - 1], pct: pct(d) });
  }
  if (months.length === 0 || months[0].pct > 6) months.unshift({ label: MONTHS[Number(startIso.slice(5, 7)) - 1], pct: 0 });

  const active = profile.macrocycles.find((m) => m.startDate <= todayIso && todayIso <= m.endDate);
  const now = active ? `${active.label} · semana ${currentWeekInRange(active, new Date(`${todayIso}T12:00:00`))} de ${totalMacrocycleWeeks(active)}` : 'Sin macro activo hoy';
  let toCompetition: string | null = null;
  if (comp) {
    const days = isoDiffDays(todayIso, comp.g.targetDate);
    toCompetition = days <= 0 ? 'La competición es ahora' : days < 14 ? `Faltan ${days} ${days === 1 ? 'día' : 'días'} para la competición` : `Faltan ${weeksText(Math.round(days / 7))} para la competición`;
  }

  return {
    startIso,
    endIso,
    weeks,
    todayPct: pct(todayIso),
    months,
    bars,
    flags: placed,
    lanes: lane,
    flagRows: placed.some((f) => f.row === 1) ? 2 : placed.length > 0 ? 1 : 0,
    now,
    toCompetition,
  };
}
