/**
 * La estructura de trabajo de un WOD del catálogo: qué movimientos, cuántas repeticiones (o metros, calorías, segundos) y con
 * qué carga, en cuántas rondas o escalones. La biblioteca PushJerk ya viene estructurada; los benchmarks y programaciones
 * (Mayhem, CompTrain, Invictus, clásicos) son texto libre, así que aquí se leen con un intérprete prudente: lo que no se entiende
 * no se inventa, se cuenta como lectura parcial (`coverage`) y los cálculos que dependen de ello lo tienen en cuenta.
 *
 * Es solo lectura de datos: nada del coach usa esto todavía (ver `wodProfile.ts`).
 */
import { getMovementById } from '../data/movements';
import type { LibraryWod } from '../data/library/libraryWods';

export type WorkUnit = 'reps' | 'm' | 'cal' | 's';

export interface WodLine {
  /** Movimiento del catálogo, o null si el texto no se pudo casar con ninguno. */
  movementId: string | null;
  label: string;
  /** Cantidad en `unit` (en un escalón de escalera, la de ese escalón). */
  amount: number;
  unit: WorkUnit;
  /** Carga externa por repetición en kg (Rx masculino), si el texto la dice. */
  loadKg?: number;
}

export type StructureKind = 'forTime' | 'amrap' | 'emom' | 'interval' | 'maxReps' | 'unknown';

export interface WodStructure {
  kind: StructureKind;
  /** Todo el trabajo de principio a fin, en orden (rondas y escalones ya expandidos). En un AMRAP, una sola vuelta. */
  work: WodLine[];
  /** Minutos fijados por el formato (AMRAP, EMOM, intervalos…), o null en un "for time". */
  fixedMinutes: number | null;
  /** Descanso total dentro del WOD (entre rondas, minutos de descanso de un EMOM…), en minutos. */
  restMinutes: number;
  /** Cuánto del texto se ha entendido: `full` (todas las líneas con cantidad y movimiento), `partial` (algo falta) o `none`. */
  coverage: 'full' | 'partial' | 'none';
  /** Pares/equipos: el trabajo se reparte, así que el tiempo y la carga de cada uno no son los del texto entero. */
  partner: boolean;
}

const LB_TO_KG = 0.4536;
const POOD_TO_KG = 16.38;

/** "21-15-9" -> [21, 15, 9]; null si no es una escalera de al menos dos números. */
export function parseLadder(s: string): number[] | null {
  const m = s.match(/^\d+(?:\s*-\s*\d+)+$/);
  return m ? s.split('-').map((n) => Number(n.trim())) : null;
}

// ---------------------------------------------------------------------------------------------
// Biblioteca PushJerk (ya estructurada)
// ---------------------------------------------------------------------------------------------

function parseQty(qty: string): { amount: number; unit: WorkUnit; ladder?: number[]; max?: boolean } | null {
  const q = qty.trim().toLowerCase();
  if (q.startsWith('máx') || q.startsWith('max')) return { amount: 15, unit: 'reps', max: true };
  const ladder = parseLadder(q.replace(/\s*m$/, ''));
  if (ladder) return { amount: ladder[0], unit: /\bm$/.test(q) ? 'm' : 'reps', ladder };
  const m = q.match(/^(\d+(?:[.,]\d+)?)(?:\/\d+(?:[.,]\d+)?)?\s*(m|cal|s|min)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (m[2] === 'min') return { amount: n * 60, unit: 's' };
  return { amount: n, unit: (m[2] as WorkUnit | undefined) ?? 'reps' };
}

export function structureFromLibrary(w: LibraryWod): WodStructure {
  const header = w.header.toLowerCase();
  const parsed = w.lines.map(([id, qty]) => ({ id, q: parseQty(qty), qty }));
  const unparsed = parsed.filter((p) => !p.q).length;
  const coverage: WodStructure['coverage'] = parsed.length === 0 ? 'none' : unparsed === 0 ? 'full' : unparsed < parsed.length ? 'partial' : 'none';
  const base = { fixedMinutes: null as number | null, restMinutes: 0, coverage, partner: /partner|pareja|team/.test(header + ' ' + w.original.toLowerCase()) };
  const lineOf = (p: (typeof parsed)[number], step?: number): WodLine | null => {
    if (!p.q) return null;
    const amount = p.q.ladder && step !== undefined ? p.q.ladder[step] : p.q.amount;
    return { movementId: p.id, label: p.id, amount, unit: p.q.unit };
  };

  const amrap = header.match(/(\d+)\s*(?:min(?:ute)?s?)\s*amrap/) ?? header.match(/amrap\s*(?:for\s*)?(\d+)/);
  if (amrap && !/rounds? for max/.test(header)) {
    return { ...base, kind: 'amrap', fixedMinutes: Number(amrap[1]), work: parsed.map((p) => lineOf(p)).filter((l): l is WodLine => l !== null) };
  }
  const emom = header.match(/(\d+)\s*min(?:ute)?s?\s*(?:alternating\s*)?(e\d?mom|emom)/);
  if (emom) {
    const every = Number(emom[2].match(/e(\d)mom/)?.[1] ?? 1);
    const minutes = Number(emom[1]);
    const rounds = Math.max(1, Math.floor(minutes / every));
    const alt = /alternating/.test(header) || every >= 2;
    const lines = parsed.map((p) => lineOf(p)).filter((l): l is WodLine => l !== null);
    // En un EMOM la pausa es lo que sobra de cada intervalo: no se puede saber, así que el descanso se deja en 0 y la duración la fija el formato.
    return { ...base, kind: 'emom', fixedMinutes: minutes, work: alt ? Array.from({ length: rounds }, () => lines).flat() : Array.from({ length: minutes }, () => lines).flat() };
  }
  const maxReps = header.match(/(\d+)\s*rounds?\s*for\s*max/);
  if (maxReps) {
    const rounds = Number(maxReps[1]);
    const stationSeconds = parsed.reduce((s, p) => s + (p.q && p.q.unit === 's' ? p.q.amount : 60), 0);
    return { ...base, kind: 'maxReps', fixedMinutes: (rounds * stationSeconds) / 60, work: parsed.map((p) => lineOf(p)).filter((l): l is WodLine => l !== null) };
  }
  const every = header.match(/every\s+(\d+)\s*(sec|min)[^f]*for\s+(\d+)\s*(min|rounds?)/);
  if (every) {
    const step = every[2] === 'sec' ? Number(every[1]) / 60 : Number(every[1]);
    const total = every[4].startsWith('min') ? Number(every[3]) : Number(every[3]) * step;
    return { ...base, kind: 'interval', fixedMinutes: total, work: parsed.map((p) => lineOf(p)).filter((l): l is WodLine => l !== null) };
  }

  // For time: rondas, escalera o una sola pasada.
  const rounds = Number(header.match(/(\d+)\s*rounds?/)?.[1] ?? 1);
  const ladderLen = Math.max(0, ...parsed.map((p) => p.q?.ladder?.length ?? 0));
  const headerLadder = parseLadder((header.match(/^(\d+(?:-\d+)+)/)?.[1] ?? '').trim());
  const steps = ladderLen || headerLadder?.length || 0;
  const work: WodLine[] = [];
  if (steps > 0) {
    for (let s = 0; s < steps; s++) {
      for (const p of parsed) {
        if (!p.q) continue;
        // Una línea sin escalera propia ("2020 m Row" antes de "10-9-8… reps") se hace una sola vez, no en cada escalón.
        if (!p.q.ladder && ladderLen > 0 && s > 0) continue;
        const amount = p.q.ladder ? p.q.ladder[s] : p.q.amount;
        work.push({ movementId: p.id, label: p.id, amount, unit: p.q.unit });
      }
    }
  } else {
    for (let r = 0; r < rounds; r++) for (const p of parsed) { const l = lineOf(p); if (l) work.push(l); }
  }
  const restMatch = w.original.toLowerCase().match(/rest\s*(\d+)\s*(?:min|:00)|(\d+)\s*min(?:utes)?\s*rest/);
  const rest = restMatch ? Number(restMatch[1] ?? restMatch[2]) * Math.max(0, rounds - 1) : 0;
  return { ...base, kind: 'forTime', restMinutes: rest, work };
}

// ---------------------------------------------------------------------------------------------
// Benchmarks y programaciones (texto libre)
// ---------------------------------------------------------------------------------------------

/** Alias de nombres que aparecen en los textos (español e inglés) -> palabras clave del movimiento del catálogo. */
const ALIASES: [RegExp, string[]][] = [
  [/dobles?\s*unders?|double[-\s]?unders?|dobles/, ['double-under']],
  [/singles?\s*unders?|single[-\s]?unders?/, ['single-under']],
  [/carrera|\brun(?:ning)?\b|correr/, ['run']],
  [/\bremo\b|\brow(?:ing)?\b|rower/, ['row']],
  [/assault\s*bike|air\s*bike|\bbike\b|bici/, ['air-bike']],
  [/ski\s*-?erg|\bskierg\b/, ['ski-erg']],
  [/wall[-\s]?balls?/, ['wall-ball']],
  [/thrusters?/, ['thruster', 'dumbbell-thruster']],
  [/chest[-\s]?to[-\s]?bar/, ['chest-to-bar-pull-up']],
  [/butterfly/, ['butterfly-pull-up']],
  [/pull[-\s]?ups?|dominadas?/, ['kipping-pull-up', 'strict-pull-up', 'butterfly-pull-up']],
  [/push[-\s]?ups?|flexiones/, ['push-up', 'hand-release-push-up']],
  [/handstand\s*push[-\s]?ups?|hspu/, ['handstand-push-up']],
  [/bar[-\s]?facing\s*burpees?/, ['bar-facing-burpee']],
  [/burpee\s*box\s*jump/, ['burpee-box-jump-over']],
  [/burpees?/, ['burpee', 'bar-facing-burpee', 'burpee-to-target', 'lateral-burpee']],
  [/box\s*jump[-\s]?overs?/, ['box-jump-over']],
  [/box\s*jumps?|saltos?\s*al\s*caj[oó]n/, ['box-jump', 'box-jump-over']],
  [/toes[-\s]?to[-\s]?bar|\bttb\b|t2b/, ['toes-to-bar']],
  [/knees[-\s]?to[-\s]?elbows?|\bk2e\b/, ['knees-to-elbow']],
  [/muscle[-\s]?ups?/, ['bar-muscle-up', 'ring-muscle-up']],
  [/ring\s*dips?/, ['ring-dip']],
  [/air\s*squats?|sentadillas?\s*(?:al aire|sin peso)|squats?\s*(?:sin|bodyweight)/, ['air-squat']],
  [/sit[-\s]?ups?|abmat/, ['abmat-situp', 'ghd-situp']],
  [/ghd/, ['ghd-situp', 'ghd-hip-extension']],
  [/overhead\s*squats?|\bohs\b/, ['overhead-squat']],
  [/front\s*squats?/, ['front-squat']],
  [/back\s*squats?/, ['back-squat']],
  [/deadlifts?|peso\s*muerto/, ['deadlift']],
  [/sumo\s*deadlift\s*high[-\s]?pull|\bsdhp\b/, ['sumo-deadlift-high-pull']],
  [/hang\s*power\s*cleans?/, ['hang-power-clean', 'hang-clean', 'power-clean', 'clean']],
  [/power\s*cleans?/, ['power-clean', 'hang-power-clean', 'hang-clean', 'clean']],
  
  [/squat\s*cleans?|\bcleans?\b/, ['clean', 'hang-squat-clean', 'power-clean', 'hang-clean', 'hang-power-clean']],
  [/clean\s*(?:and|&)\s*jerks?/, ['clean-and-jerk']],
  [/hang\s*power\s*snatch(?:es)?/, ['hang-power-snatch', 'power-snatch', 'hang-snatch', 'snatch']],
  [/power\s*snatch(?:es)?/, ['power-snatch', 'hang-power-snatch', 'snatch']],
  [/snatch(?:es)?/, ['snatch', 'power-snatch', 'hang-power-snatch', 'hang-snatch', 'dumbbell-snatch']],
  [/push\s*press/, ['push-press']],
  [/push\s*jerks?/, ['push-jerk']],
  [/shoulder[-\s]?to[-\s]?overhead|\bs2oh\b/, ['shoulder-to-overhead']],
  [/kettlebell\s*swings?|\bkb\s*swings?|swings?/, ['kettlebell-swing-russian', 'kettlebell-swing-american']],
  [/walking\s*lunges?|lunge\s*walk|lunges?/, ['walking-lunge', 'reverse-lunge']],
  [/step[-\s]?ups?/, ['step-up']],
  [/rope\s*climbs?/, ['rope-climb']],
  [/wall\s*walks?/, ['wall-walk']],
  [/devil'?s?\s*press/, ['devils-press']],
  [/dumbbell\s*snatch|db\s*snatch/, ['dumbbell-snatch', 'dumbbell-power-snatch']],
  [/ring\s*rows?/, ['ring-row']],
  [/back\s*extensions?/, ['back-extension']],
  [/sled/, ['sled-push', 'sled-row']],
  // Genéricos, al final: solo si ninguno de los anteriores casó ("300 squats", "3 jerks").
  [/\bjerks?\b/, ['push-jerk', 'split-jerk', 'clean-and-jerk']],
  [/\bsquats?\b/, ['air-squat', 'back-squat', 'front-squat']],
];

function stem(w: string): string {
  return w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
}
const tokens = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ0-9\s-]/g, ' ').split(/[\s-]+/).filter((t) => t.length > 1).map(stem);

/** Casa un nombre del texto con uno de los movimientos del WOD (o null). */
export function matchMovement(label: string, ids: string[]): string | null {
  const text = label.toLowerCase();
  for (const [re, keys] of ALIASES) {
    if (!re.test(text)) continue;
    const hit = keys.find((k) => ids.includes(k));
    if (hit) return hit;
  }
  const t = new Set(tokens(label));
  let best: { id: string; score: number } | null = null;
  for (const id of ids) {
    const mt = tokens(getMovementById(id)?.name ?? id);
    const idt = tokens(id);
    if (mt.length === 0) continue;
    const overlap = Math.max(mt.filter((x) => t.has(x)).length / Math.max(mt.length, t.size), idt.filter((x) => t.has(x)).length / Math.max(idt.length, t.size));
    if (overlap > 0.5 && (!best || overlap > best.score)) best = { id, score: overlap };
  }
  return best?.id ?? null;
}

/** La carga de un paréntesis como "(135/95 lb)", "(1.5/1 pood)", "(115/80)", "(32 kg)"; las alturas ("24/20 in") no cuentan. */
function parseLoadKg(text: string): number | undefined {
  const re = /\((\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(lbs?|kg|pood|#|in|cm|ft|m)?\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'in' || unit === 'cm' || unit === 'ft' || unit === 'm') continue;
    const n = Number(m[1].replace(',', '.'));
    if (unit === 'kg') return n;
    if (unit === 'pood') return n * POOD_TO_KG;
    return n * LB_TO_KG; // lb, # o sin unidad (CompTrain): libras
  }
  return undefined;
}

/** Elementos que son una nota y no trabajo: descansos, topes, cómo repartir las repeticiones. */
const NOTE_RE = /^(?:descans|rest\b|tope|time\s*cap|cap\b|reps?\s*repartid|sin\s*soltar|alternando|unbroken|rx\b|escalad|partner|se\s*cambian|incluye|con\s*descanso)/i;

const UNIT_RE = '(?:m|metros|km|cal|calor[ií]as?|yardas?|yd|milla|millas|mile|miles|min|seg|s)';
const ITEM_RE = new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s*/\\s*\\d+(?:[.,]\\d+)?)?\\s*(${UNIT_RE})?\\.?\\s+(.+)$|^(\\d+(?:[.,]\\d+)?)(${UNIT_RE})\\s*(.+)$`, 'i');

function toUnit(raw: string | undefined): { unit: WorkUnit; factor: number } {
  const u = (raw ?? '').toLowerCase();
  if (!u) return { unit: 'reps', factor: 1 };
  if (u === 'm' || u.startsWith('metro')) return { unit: 'm', factor: 1 };
  if (u === 'km') return { unit: 'm', factor: 1000 };
  if (u.startsWith('yard') || u === 'yd') return { unit: 'm', factor: 0.914 };
  if (u.startsWith('mill') || u === 'mile' || u === 'miles') return { unit: 'm', factor: 1609 };
  if (u.startsWith('cal')) return { unit: 'cal', factor: 1 };
  if (u === 'min') return { unit: 's', factor: 60 };
  return { unit: 's', factor: 1 };
}

function parseItem(raw: string, ids: string[]): (WodLine & { ladder?: number[]; noQty?: boolean }) | null {
  const loadKg = parseLoadKg(raw);
  const clean = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:y|and|luego|then|\+)\s+/i, '')
    .trim();
  const ladder = parseLadder(clean.match(/^\d+(?:\s*-\s*\d+)+/)?.[0] ?? '');
  const body = ladder ? clean.replace(/^\d+(?:\s*-\s*\d+)+\s*/, '1 ') : clean;
  const m = body.match(ITEM_RE);
  if (!m) {
    // Sin cantidad: puede ser un paso de la escalera de la cabecera ("21-15-9 reps for time: thrusters, pull-ups").
    const movementId = matchMovement(clean, ids);
    return movementId ? { movementId, label: clean, amount: 1, unit: 'reps', loadKg, noQty: true } : null;
  }
  const n = Number((m[1] ?? m[4]).replace(',', '.'));
  const u = toUnit(m[2] ?? m[5]);
  const label = (m[3] ?? m[6]).replace(/^(?:de|of)\s+/i, '').trim();
  const movementId = matchMovement(label, ids);
  return { movementId, label, amount: ladder ? ladder[0] : n * u.factor, unit: u.unit, loadKg, ladder: ladder ?? undefined };
}

/** Parte el cuerpo en elementos por comas, "+", "y" o "luego", pero no dentro de paréntesis ni corchetes ("(155/105 lb, sin soltar la barra)"). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    const rest = s.slice(i);
    const sep = depth === 0 ? rest.match(/^(?:\s*[,;]\s*|\s\+\s|\sy\s|\sluego\s|\sthen\s)/i) : null;
    if (sep) {
      out.push(cur);
      cur = '';
      i += sep[0].length - 1;
    } else cur += c;
  }
  out.push(cur);
  return out;
}
/** Un texto cualquiera de benchmark -> estructura. `capMinutes`: tope declarado, si lo hay. */
export function structureFromBenchmark(format: string, movementIds: string[], capMinutes: number | null): WodStructure {
  const f = format.replace(/\s+/g, ' ').trim();
  const lower = f.toLowerCase();
  const partner = /parejas?|partner|\bteam\b|equipos?/.test(lower);
  let kind: StructureKind = 'forTime';
  let fixedMinutes: number | null = null;
  let rounds = 1;
  let blockRest: number | null = null;

  // "5 rondas de AMRAP 3 (1 min de descanso entre rondas)", "10 series de AMRAP 1:30 (descanso 30 seg entre series)": bloques cronometrados con pausa.
  const block = lower.match(/(\d+)\s*(?:series|sets|rondas|rounds)\s*(?:de|of)\s*amrap\s*(\d+)(?::(\d+))?\s*(?:min)?/);
  const amrap = lower.match(/amrap\s*(?:en\s*)?(\d+)\s*(?:min)?|(\d+)\s*min(?:utos)?\s*amrap/);
  const emom = lower.match(/e(\d)?mom\s*(?:durante\s*)?(\d+)|(\d+)\s*min(?:utos)?\s*e(\d)?mom/);
  // EMOM sin duración fija ("EMOM el máximo tiempo posible", "EMOM hasta completar…"): es un EMOM, pero los minutos no se saben.
  const openEmom = !emom && /\bemom\b/.test(lower);
  // "3 rondas, 1 min por estación (...), 1 min de descanso entre rondas": minutos = rondas x estaciones x minutos + descansos.
  const stations = lower.match(/(\d+)\s*rondas?[^:]*?(\d+)\s*min(?:uto)?s?\s*por\s*estaci[oó]n/);
  const roundsM = lower.match(/(\d+)\s*(?:rondas|rounds)/);
  if (block) {
    kind = 'interval';
    const n = Number(block[1]);
    const workMin = Number(block[2]) + (block[3] ? Number(block[3]) / 60 : 0);
    const restM = lower.match(/descanso\s*(?:de\s*)?(\d+)(?::(\d+))?\s*(seg|s\b|min)?|(\d+)\s*(seg|min)\w*\s*de\s*descanso/);
    let restMin = 0;
    if (restM) {
      const v = Number(restM[1] ?? restM[4]);
      const unit = (restM[3] ?? restM[5] ?? (restM[2] ? 'min' : 'min')).toLowerCase();
      restMin = restM[2] ? v + Number(restM[2]) / 60 : unit.startsWith('s') ? v / 60 : v;
    }
    fixedMinutes = n * workMin + Math.max(0, n - 1) * restMin;
    blockRest = Math.max(0, n - 1) * restMin;
  } else if (stations && movementIds.length > 0) {
    kind = 'interval';
    const roundsN = Number(stations[1]);
    const restBetween = Number(lower.match(/(\d+)\s*min(?:uto)?s?\s*de\s*descanso\s*entre\s*rondas/)?.[1] ?? 0);
    fixedMinutes = roundsN * movementIds.length * Number(stations[2]) + restBetween * Math.max(0, roundsN - 1);
  } else if (openEmom) {
    kind = 'emom';
  } else if (emom) {
    kind = 'emom';
    fixedMinutes = Number(emom[2] ?? emom[3]);
  } else if (amrap) {
    kind = 'amrap';
    fixedMinutes = Number(amrap[1] ?? amrap[2]);
  } else if (roundsM) rounds = Number(roundsM[1]);

  // Cuerpo: lo que va tras los dos puntos de la cabecera; si no hay, el texto entero.
  const colon = f.indexOf(':');
  const hasHeader = colon > 0 && colon < 70 && /for time|amrap|emom|rondas|rounds|reps|escalera|parejas|series|min/i.test(f.slice(0, colon));
  const headerText = hasHeader ? f.slice(0, colon) : f;
  const body = hasHeader ? f.slice(colon + 1) : f;
  const ladderHeader = parseLadder((headerText.match(/^\s*(\d+(?:\s*-\s*\d+)+)/)?.[1] ?? '').replace(/\s/g, ''));

  // Casos sin cuerpo útil: "21-15-9 reps for time" (los movimientos son la lista del WOD) o "30 reps for time".
  const bare = !hasHeader && /^\s*\d+(?:\s*-\s*\d+)*\s*reps?(?:\/calories)?\s*for\s*time/i.test(f);
  if (bare) {
    if (ladderHeader && ladderHeader.length === movementIds.length && new Set(ladderHeader).size === 1) {
      return { kind: 'forTime', fixedMinutes: null, restMinutes: 0, coverage: 'full', partner, work: movementIds.map((id, i) => ({ movementId: id, label: id, amount: ladderHeader[i], unit: 'reps' as const })) };
    }
    if (ladderHeader) {
      const work: WodLine[] = [];
      for (const step of ladderHeader) for (const id of movementIds) work.push({ movementId: id, label: id, amount: step, unit: 'reps' });
      return { kind: 'forTime', fixedMinutes: null, restMinutes: 0, coverage: 'full', partner, work };
    }
    const single = Number(lower.match(/^\s*(\d+)\s*reps?/)?.[1] ?? 0);
    if (single > 0 && movementIds.length === 1) {
      return { kind: 'forTime', fixedMinutes: null, restMinutes: 0, coverage: 'full', partner, work: [{ movementId: movementIds[0], label: movementIds[0], amount: single, unit: 'reps' }] };
    }
  }

  const items = splitTopLevel(body)
    .map((s) => s.trim())
    .filter((s) => s && !NOTE_RE.test(s))
    .map((s) => parseItem(s, movementIds));
  const understood = items.filter((i): i is NonNullable<typeof i> => i !== null && i.movementId !== null);
  const total = items.length;
  const coverage: WodStructure['coverage'] = total === 0 || understood.length === 0 ? 'none' : understood.length === total ? 'full' : understood.length / total >= 0.5 ? 'partial' : 'none';

  // Escalera: la de alguna línea ("40-30-20-10 box jumps") o la de la cabecera ("21-15-9 reps for time: thrusters, pull-ups").
  const itemLadder = understood.find((i) => i.ladder)?.ladder ?? ladderHeader;
  const work: WodLine[] = [];
  const once = (step?: number): WodLine[] =>
    understood.map((i) => ({
      movementId: i.movementId,
      label: i.label,
      amount: step !== undefined && itemLadder ? (i.ladder ? i.ladder[step] : i.noQty ? itemLadder[step] : i.amount) : i.amount,
      unit: i.unit,
      loadKg: i.loadKg,
    }));
  if (itemLadder && itemLadder.length > 1) {
    for (let s = 0; s < itemLadder.length; s++) work.push(...once(s));
  } else if (kind === 'forTime') {
    for (let r = 0; r < rounds; r++) work.push(...once());
  } else {
    work.push(...once());
  }
  const restMatch = lower.match(/descans\w*\s*(?:de\s*)?(\d+)\s*min|(\d+)\s*min(?:utos)?\s*de\s*descanso|rest\s*(\d+)\s*min/);
  const restPer = restMatch ? Number(restMatch[1] ?? restMatch[2] ?? restMatch[3]) : 0;
  void capMinutes;
  return { kind, fixedMinutes, restMinutes: blockRest ?? restPer * Math.max(0, rounds - 1), coverage, partner, work };
}
