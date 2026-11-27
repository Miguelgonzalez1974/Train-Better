import type { AthleteProfile, LevelTestKey, PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import powerlifting from '../data/reference/powerliftingPercentiles.json';
import run5k from '../data/reference/run5kAgeStandards.json';
import { toLocalIsoDate } from './periodization';
import { historyWodKey, parseTimeSeconds } from './wodGhost';

/**
 * «Tu nivel» frente a referencias de fuera: en qué escalón (Principiante → Élite) caen tus marcas comparadas con hombres de tu edad y peso.
 * Es lo contrario de `levelCategories.ts`, que mide tu progreso contra ti mismo. Cada categoría dice de dónde sale su referencia y cuánto fiarse:
 *  - Fuerza: percentiles de competición (OpenPowerlifting / OpenIPF) por edad y peso corporal. «medido».
 *  - Olímpicos: escala propia por peso corporal y edad. «orientativo».
 *  - Fran: puntuaciones de atletas de CrossFit de 35 años o más (Mangine, Cebulla y Feito, 2018, CC BY 4.0). «orientativo».
 *  - 5 km: porcentaje corregido por edad (tablas de Alan Jones, CC0). «medido».
 *  - Remo 2 km: sin referencia que se pueda usar; solo contra ti.
 * Solo hay tablas de hombres. Puro: lee el perfil y el historial.
 */
export const ZONES = ['Principiante', 'Novato', 'Intermedio', 'Avanzado', 'Élite'] as const;

/** Categorías con datos que hacen falta para dar un nivel global. */
export const MIN_FOR_OVERALL = 3;
/** Un test de resistencia vale 12 meses. */
export const TEST_WINDOW_DAYS = 365;

export const TEST_LABEL: Record<LevelTestKey, string> = { row2k: 'Remo 2 km', run5k: 'Carrera 5 km', fran: 'Fran' };
/** Tiempos creíbles de cada test (segundos): fuera de aquí casi seguro es un error al teclear. */
export const TEST_RANGE: Record<LevelTestKey, [number, number]> = { row2k: [320, 1500], run5k: [750, 3600], fran: [100, 1800] };
/** Los WODs del historial que son ese mismo test. */
const TEST_WOD_KEYS: Record<LevelTestKey, string[]> = {
  row2k: ['benchmark:2k-row', 'bm:2k-row', 'benchmark:comptrain-2017-open-103', 'bm:comptrain-2017-open-103'],
  run5k: [],
  fran: ['benchmark:fran', 'bm:fran'],
};

export interface Placement {
  /** 0 (Principiante) a 4 (Élite). */
  zone: number;
  /** Dónde cae en la barra entera, de 0 a 1 (cinco tramos iguales). */
  position: number;
}

export interface RefMark {
  key: string;
  label: string;
  /** Lo que tienes: «120 kg», «24:10». */
  value: string;
  /** Escalón y posición; null si no hay con qué compararlo. */
  placement: Placement | null;
  /** «a 3 kg de Novato»; null arriba del todo o sin comparación. */
  next: string | null;
  /** Una línea más: el percentil, el porcentaje por edad, de cuándo es el test. */
  detail: string | null;
}

export type RefKey = 'fuerza' | 'olimpicos' | 'velocidad' | 'largo' | 'resistencia';
export type RefTag = 'medido' | 'orientativo' | 'solo contra ti';

export interface RefCategory {
  key: RefKey;
  label: string;
  tag: RefTag;
  placement: Placement | null;
  marks: RefMark[];
  /** Con quién se compara, en una frase. */
  against: string | null;
  /** Lo que falta para medirla. */
  missing: string | null;
  /** Algo de tus datos que conviene revisar. */
  warning: string | null;
  /** El test que se puede apuntar aquí. */
  test: LevelTestKey | null;
}

export interface ReferenceLevel {
  /** Años que cumples este año (como en las categorías de competición); null si no has dicho cuándo naciste. */
  age: number | null;
  bodyweightKg: number | null;
  categories: RefCategory[];
  /** Categorías con escalón. */
  measured: number;
  /** Categorías que tienen referencia para ti. */
  measurable: number;
  overall: Placement | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const comma = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
export const timeText = (seconds: number) => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const gapText = (seconds: number) => (seconds < 60 ? `${seconds} s` : timeText(seconds));

/** Un percentil sin decimales, hacia abajo: por debajo del corte del 10 nunca se lee «10 %». */
const wholePct = (p: number) => Math.floor(p + 1e-6);
/** El escalón de una posición en la barra (0-1). */
export const zoneOfPosition = (position: number) => clamp(Math.floor(position * 5 + 1e-9), 0, 4);

/**
 * Coloca un valor en la barra de cinco escalones. `cuts` son los cuatro valores donde empiezan Novato, Intermedio, Avanzado y Élite; `floor` y
 * `top` son los extremos de la barra. Para tiempos (menos es mejor) los valores van de mayor a menor.
 */
export function placeOnScale(value: number, cuts: [number, number, number, number], floor: number, top: number): Placement {
  const sign = cuts[3] >= cuts[0] ? 1 : -1;
  const v = sign * value;
  const c = cuts.map((x) => sign * x);
  const zone = c.filter((x) => v >= x).length;
  const lo = zone === 0 ? sign * floor : c[zone - 1];
  const hi = zone === 4 ? sign * top : c[zone];
  const frac = hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0;
  // Pegado al corte de arriba no se redondea al escalón siguiente.
  return { zone, position: (zone + Math.min(frac, 0.999)) / 5 };
}

/** Interpolación lineal en una lista de puntos (x creciente); fuera de ella devuelve null. */
function interpolate(points: [number, number][], x: number): number | null {
  if (x < points[0][0] || x > points[points.length - 1][0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Fuerza: percentiles de competición
// ---------------------------------------------------------------------------------------------

type LiftName = 'squat' | 'bench' | 'deadlift';
type PowerTable = Record<LiftName, Record<string, Record<string, [number, number[]]>>>;
const POWER = powerlifting.lifts as unknown as PowerTable;

const POWER_LIFTS: { key: keyof PersonalRecords; table: LiftName; label: string }[] = [
  { key: 'backSquat', table: 'squat', label: 'Sentadilla' },
  { key: 'deadlift', table: 'deadlift', label: 'Peso muerto' },
  { key: 'benchPress', table: 'bench', label: 'Press banca' },
];

/** La franja de edad de la tabla que te toca (la más cercana si la tuya no está). */
export function ageBandOf(age: number): string {
  const bands = Object.keys(POWER.squat).map((id) => ({ id, lo: Number(id.split('-')[0]), hi: Number(id.split('-')[1]) }));
  const inside = bands.find((b) => age >= b.lo && age <= b.hi);
  if (inside) return inside.id;
  const distance = (b: { lo: number; hi: number }) => (age < b.lo ? b.lo - age : age - b.hi);
  return bands.reduce((a, b) => (distance(b) < distance(a) ? b : a)).id;
}

/** Los percentiles (1, 10, 35, 65, 90, 99) de un levantamiento para tu edad y tu peso, interpolando entre los pesos de la tabla. */
export function powerPercentiles(lift: LiftName, age: number, bodyweightKg: number): { values: number[]; sample: number } {
  const cells = POWER[lift][ageBandOf(age)];
  const centers = Object.keys(cells)
    .map(Number)
    .sort((a, b) => a - b);
  const bw = clamp(bodyweightKg, centers[0], centers[centers.length - 1]);
  const upper = centers.find((c) => c >= bw)!;
  const lower = [...centers].reverse().find((c) => c <= bw)!;
  const t = upper === lower ? 0 : (bw - lower) / (upper - lower);
  const [nLo, lo] = cells[String(lower)];
  const [nHi, hi] = cells[String(upper)];
  return { values: lo.map((v, i) => v + (hi[i] - v) * t), sample: t < 0.5 ? nLo : nHi };
}

function aheadText(values: number[], kg: number): string {
  const pcts = powerlifting.percentiles;
  if (kg < values[0]) return `por delante de menos del ${pcts[0]} %`;
  if (kg > values[values.length - 1]) return `por delante de más del ${pcts[pcts.length - 1]} %`;
  const p = interpolate(
    values.map((v, i) => [v, pcts[i]] as [number, number]),
    kg,
  )!;
  return `por delante del ${wholePct(p)} %`;
}

/** «a 3 kg de Novato» (redondeado hacia arriba al medio kilo). */
function kgToNext(kg: number, cuts: number[], zone: number): string | null {
  if (zone >= 4) return null;
  const gap = Math.max(0.5, Math.ceil((cuts[zone] - kg) * 2 - 1e-9) / 2);
  return `a ${comma(gap)} kg de ${ZONES[zone + 1]}`;
}

const meanPlacement = (marks: RefMark[]): Placement | null => {
  const placed = marks.flatMap((m) => (m.placement ? [m.placement.position] : []));
  if (placed.length === 0) return null;
  const position = placed.reduce((s, v) => s + v, 0) / placed.length;
  return { zone: zoneOfPosition(position), position };
};

const kgMark = (key: string, label: string, kg: number): RefMark => ({ key, label, value: `${comma(kg)} kg`, placement: null, next: null, detail: null });

/** «más de 600»: la muestra más pequeña de los levantamientos, redondeada hacia abajo. */
function sampleText(samples: number[]): string {
  const least = Math.min(...samples);
  return least >= 100 ? `más de ${Math.floor(least / 100) * 100}` : `${least}`;
}

function strengthCategory(prs: PersonalRecords, age: number | null, bw: number | null): RefCategory {
  const have = POWER_LIFTS.filter((l) => prs[l.key] > 0);
  const samples: number[] = [];
  const marks = have.map(({ key, table, label }): RefMark => {
    const kg = prs[key];
    if (age === null || bw === null) return kgMark(key, label, kg);
    const { values, sample: n } = powerPercentiles(table, age, bw);
    samples.push(n);
    // Percentiles de la tabla: 1, 10, 35, 65, 90 y 99. Los cortes son 10, 35, 65 y 90.
    const cuts: [number, number, number, number] = [values[1], values[2], values[3], values[4]];
    const placement = placeOnScale(kg, cuts, values[0], values[5]);
    return { key, label, value: `${comma(kg)} kg`, placement, next: kgToNext(kg, cuts, placement.zone), detail: aheadText(values, kg) };
  });
  return {
    key: 'fuerza',
    label: 'Fuerza',
    tag: 'medido',
    placement: meanPlacement(marks),
    marks,
    against:
      age === null || bw === null
        ? null
        : `Frente a hombres de ${ageBandOf(age).replace('-', ' a ')} años y peso parecido que compiten en powerlifting sin equipo de apoyo (${sampleText(samples)} en tu peso). Son competidores: salir bajo es lo normal.`,
    missing: have.length === 0 ? 'Apunta tu sentadilla, peso muerto o press banca en Marcas.' : null,
    warning: null,
    test: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Olímpicos: escala propia, orientativa
// ---------------------------------------------------------------------------------------------

/** Veces el peso corporal donde empiezan Novato, Intermedio, Avanzado y Élite a los 30 años o menos. Es una escala propia, no una medición. */
export const OLY_RATIOS: Record<'snatch' | 'cleanAndJerk', [number, number, number, number]> = {
  snatch: [0.6, 0.85, 1.1, 1.35],
  cleanAndJerk: [0.8, 1.1, 1.4, 1.7],
};
/** La corrección por edad de esa escala: un 1 % menos por año a partir de los 30, con suelo en el 60 %. */
export const olyAgeFactor = (age: number) => clamp(1 - 0.01 * (age - 30), 0.6, 1);

function olympicCategory(profile: AthleteProfile, age: number | null, bw: number | null): RefCategory {
  const lifts = [
    { key: 'snatch' as const, label: 'Snatch' },
    { key: 'cleanAndJerk' as const, label: 'Clean & jerk' },
  ].filter((l) => profile.prs[l.key] > 0);
  const marks = lifts.map(({ key, label }): RefMark => {
    const kg = profile.prs[key];
    if (age === null || bw === null) return kgMark(key, label, kg);
    const cuts = OLY_RATIOS[key].map((r) => Math.round(r * bw * olyAgeFactor(age) * 2) / 2) as [number, number, number, number];
    const placement = placeOnScale(kg, cuts, cuts[0] * 0.5, cuts[3] * 1.25);
    return { key, label, value: `${comma(kg)} kg`, placement, next: kgToNext(kg, cuts, placement.zone), detail: `${comma(kg / bw)} veces tu peso` };
  });
  const over = (
    [
      ['powerSnatch', 'snatch', 'power snatch', 'snatch'],
      ['powerClean', 'clean', 'power clean', 'clean'],
    ] as const
  ).filter(([variant, full]) => (profile.variantPrs?.[variant] ?? 0) > profile.prs[full] && profile.prs[full] > 0);
  return {
    key: 'olimpicos',
    label: 'Olímpicos',
    tag: 'orientativo',
    placement: meanPlacement(marks),
    marks,
    against: age === null || bw === null ? null : 'Escala mía según tu peso y tu edad: sirve para orientarte, no es una medición.',
    missing: lifts.length === 0 ? 'Apunta tu snatch o tu clean & jerk en Marcas.' : null,
    warning:
      over.length === 0
        ? null
        : over.map(([variant, full, vName, fName]) => `Tu ${vName} (${comma(profile.variantPrs![variant]!)} kg) pasa a tu ${fName} (${comma(profile.prs[full])} kg).`).join(' ') + ' Revisa esas marcas.',
    test: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Tests de tiempo
// ---------------------------------------------------------------------------------------------

export interface TestResult {
  date: string;
  seconds: number;
  /** Apuntado aquí (se puede quitar) o sacado de un WOD del historial. */
  manual: boolean;
}

/** Los resultados conocidos de un test, del más reciente al más antiguo: los apuntados a mano y los WODs en Rx que son ese test. */
export function testResults(profile: AthleteProfile, history: SessionHistoryEntry[], key: LevelTestKey): TestResult[] {
  const byDate = new Map<string, TestResult>();
  const keys = new Set(TEST_WOD_KEYS[key]);
  const capped = new Set<string>();
  for (const r of profile.levelLog ?? []) if (keys.has(r.key) && r.scoreType === 'time' && r.value > 0) byDate.set(r.date, { date: r.date, seconds: r.value, manual: false });
  for (const e of history) {
    const id = historyWodKey(e);
    if (!id || !keys.has(id) || !e.wodResult || e.wodResult.scoreType !== 'time') continue;
    if (e.wodResult.capped) {
      capped.add(e.date);
      continue;
    }
    const seconds = e.rxOrScaled === 'rx' ? parseTimeSeconds(e.wodResult.value) : null;
    if (seconds !== null) byDate.set(e.date, { date: e.date, seconds, manual: false });
  }
  for (const date of capped) byDate.delete(date);
  for (const t of profile.levelTests ?? []) if (t.key === key && t.seconds > 0) byDate.set(t.date, { date: t.date, seconds: t.seconds, manual: true });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const dayNumber = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
const SHORT_DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
export const testDateText = (iso: string) => SHORT_DATE.format(new Date(`${iso}T12:00:00`)).replace('.', '');

/** El mejor resultado vigente de un test (últimos 12 meses), o por qué no hay. */
function currentTest(profile: AthleteProfile, history: SessionHistoryEntry[], key: LevelTestKey, todayIso: string): { best: TestResult | null; previous: TestResult | null; missing: string | null } {
  const all = testResults(profile, history, key);
  const live = all.filter((r) => r.date <= todayIso && dayNumber(todayIso) - dayNumber(r.date) <= TEST_WINDOW_DAYS);
  if (live.length === 0) {
    return { best: null, previous: null, missing: all.length > 0 ? `Tu último test es del ${testDateText(all[0].date)}: tiene más de un año, repítelo.` : 'Falta el test.' };
  }
  const best = live.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const others = live.filter((r) => r !== best);
  const previous = others.length > 0 ? others.reduce((a, b) => (b.seconds < a.seconds ? b : a)) : null;
  return { best, previous, missing: null };
}

/** Fran en atletas de CrossFit de 35 años o más: [segundos, percentil]. Más percentil es más rápido. Mangine, Cebulla y Feito (2018), tabla 2. */
export const FRAN_MASTERS: [number, number][] = [
  [134, 90],
  [201, 80],
  [239, 70],
  [276, 60],
  [311, 50],
  [346, 40],
  [383, 30],
  [421, 20],
  [488, 10],
];
export const FRAN_MIN_AGE = 35;
/** Los segundos que dejan por detrás a ese porcentaje. */
const franAt = (pct: number) =>
  interpolate(
    [...FRAN_MASTERS].reverse().map(([seconds, p]): [number, number] => [p, seconds]),
    pct,
  )!;

function franCategory(profile: AthleteProfile, history: SessionHistoryEntry[], age: number | null, todayIso: string): RefCategory {
  const { best, missing } = currentTest(profile, history, 'fran', todayIso);
  const comparable = age !== null && age >= FRAN_MIN_AGE;
  const marks: RefMark[] = [];
  if (best) {
    const mark: RefMark = { key: 'fran', label: 'Fran', value: timeText(best.seconds), placement: null, next: null, detail: testDateText(best.date) };
    if (comparable) {
      const cuts: [number, number, number, number] = [franAt(10), franAt(35), franAt(65), franAt(90)];
      const placement = placeOnScale(best.seconds, cuts, 660, 100);
      const pct = interpolate(FRAN_MASTERS, best.seconds);
      const ahead = pct !== null ? `por delante del ${wholePct(pct)} %` : best.seconds < FRAN_MASTERS[0][0] ? 'por delante de más del 90 %' : 'por delante de menos del 10 %';
      mark.placement = placement;
      mark.next = placement.zone >= 4 ? null : `a ${gapText(Math.max(1, Math.ceil(best.seconds - cuts[placement.zone])))} de ${ZONES[placement.zone + 1]}`;
      mark.detail = `${ahead} · ${testDateText(best.date)}`;
    }
    marks.push(mark);
  }
  return {
    key: 'velocidad',
    label: 'Velocidad',
    tag: age !== null && !comparable ? 'solo contra ti' : 'orientativo',
    placement: meanPlacement(marks),
    marks,
    against: comparable ? 'Frente a tiempos que declararon atletas de CrossFit de 35 años o más (Rx).' : null,
    missing,
    warning: null,
    test: 'fran',
  };
}

// 5 km: porcentaje corregido por edad (marca patrón de tu edad entre tu tiempo).
const RUN_STANDARDS = run5k.standardSeconds as Record<string, number>;
/** Porcentajes por edad donde empiezan Novato, Intermedio, Avanzado y Élite (60, 70 y 80 son las bandas habituales: local, regional y nacional). */
export const RUN_CUTS: [number, number, number, number] = [50, 60, 70, 80];
export function runStandard(age: number): number {
  const ages = Object.keys(RUN_STANDARDS).map(Number);
  return RUN_STANDARDS[String(clamp(Math.round(age), Math.min(...ages), Math.max(...ages)))];
}

function runCategory(profile: AthleteProfile, history: SessionHistoryEntry[], age: number | null, todayIso: string): RefCategory {
  const { best, missing } = currentTest(profile, history, 'run5k', todayIso);
  const marks: RefMark[] = [];
  if (best) {
    const mark: RefMark = { key: 'run5k', label: '5 km', value: timeText(best.seconds), placement: null, next: null, detail: testDateText(best.date) };
    if (age !== null) {
      const std = runStandard(age);
      const pct = (100 * std) / best.seconds;
      const placement = placeOnScale(pct, RUN_CUTS, 35, 100);
      mark.placement = placement;
      mark.next = placement.zone >= 4 ? null : `a ${gapText(Math.max(1, Math.ceil(best.seconds - (100 * std) / RUN_CUTS[placement.zone])))} de ${ZONES[placement.zone + 1]}`;
      mark.detail = `${Math.round(pct)} % por edad · ${testDateText(best.date)}`;
    }
    marks.push(mark);
  }
  return {
    key: 'largo',
    label: 'Largo',
    tag: 'medido',
    placement: meanPlacement(marks),
    marks,
    against: age === null ? null : `Corregido por edad: el 100 % a los ${age} años serían ${timeText(runStandard(age))}.`,
    missing,
    warning: null,
    test: 'run5k',
  };
}

function rowCategory(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): RefCategory {
  const { best, previous, missing } = currentTest(profile, history, 'row2k', todayIso);
  const marks: RefMark[] = [];
  if (best) {
    let detail = `Tu mejor del año · ${testDateText(best.date)}`;
    if (previous && previous.seconds > best.seconds) detail += ` · ${gapText(Math.round(previous.seconds - best.seconds))} menos que tu segundo mejor`;
    marks.push({ key: 'row2k', label: '2 km', value: timeText(best.seconds), placement: null, next: null, detail });
  }
  return {
    key: 'resistencia',
    label: 'Resistencia',
    tag: 'solo contra ti',
    placement: null,
    marks,
    against: 'Aún no tengo una referencia de remo que se pueda usar: se compara contigo.',
    missing,
    warning: null,
    test: 'row2k',
  };
}

// ---------------------------------------------------------------------------------------------

export function ageOf(profile: AthleteProfile, today: Date): number | null {
  return profile.birthYear ? today.getFullYear() - profile.birthYear : null;
}

export function computeReferenceLevel(input: { profile: AthleteProfile; history: SessionHistoryEntry[]; today?: Date }): ReferenceLevel {
  const { profile, history } = input;
  const today = input.today ?? new Date();
  const todayIso = toLocalIsoDate(today);
  const age = ageOf(profile, today);
  const bodyweightKg = [...(profile.bodyweightLog ?? [])].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg ?? null;
  const categories = [
    strengthCategory(profile.prs, age, bodyweightKg),
    olympicCategory(profile, age, bodyweightKg),
    franCategory(profile, history, age, todayIso),
    runCategory(profile, history, age, todayIso),
    rowCategory(profile, history, todayIso),
  ];
  const placed = categories.flatMap((c) => (c.placement ? [c.placement.position] : []));
  const position = placed.length >= MIN_FOR_OVERALL ? placed.reduce((s, v) => s + v, 0) / placed.length : null;
  return {
    age,
    bodyweightKg,
    categories,
    measured: placed.length,
    measurable: categories.filter((c) => c.tag !== 'solo contra ti').length,
    overall: position === null ? null : { zone: zoneOfPosition(position), position },
  };
}
