import type { AthleteProfile, IntensityRamp, Macrocycle } from '../data/athlete/types';
import { addDaysIso, isoDiffDays, weeksBetweenIso } from './periodization';
import { COMPANION_DEFAULT_WEEKDAYS, newCompanion, weekdayOf, type CompanionProgram } from './strengthCompanion';
import { STRENGTH_METHOD_LABEL } from './strengthPrograms';

/**
 * El plan de temporada «de profesional» sin competición a la vista: un macro continuo en tres bloques (base de reconstrucción, base de
 * fuerza y motor, pico con tests) y, a su lado, un programa de fuerza que convive con él (Bloque de Temporada: test, olas, descarga y
 * retest). Se calcula entero aquí y la pantalla lo enseña antes de aplicar nada. Puro: la fecha y los ids entran por parámetro.
 */

export interface SeasonSetup {
  startDate: string;
  endDate: string;
  totalWeeks: number;
  macrocycles: Macrocycle[];
  program: CompanionProgram;
  ramp: IntensityRamp;
  /** Con una competición a la vista: los bloques acaban en ella y los objetivos no vencidos se mantienen. */
  competition?: SeasonCompetition;
}

export interface SeasonCompetition {
  goalId: string;
  start: string;
  end: string;
  provisional: boolean;
}

/** El primer lunes igual o posterior a la fecha. */
export function nextMondayIso(iso: string): string {
  const wd = weekdayOf(iso);
  return wd === 0 ? iso : addDaysIso(iso, 7 - wd);
}

/** El último domingo igual o anterior al 30 de junio del año en que acaba la temporada que empieza en `startIso` (a partir de julio, el siguiente). */
export function seasonEndIso(startIso: string): string {
  const [y, m] = startIso.split('-').map(Number);
  const year = m >= 7 ? y + 1 : y;
  const june30 = `${year}-06-30`;
  return addDaysIso(june30, -((weekdayOf(june30) + 1) % 7));
}

type Shape = 'base1' | 'base2' | 'pico';

/** [acumulación, intensificación, pico, descarga] de un bloque de `weeks` semanas, con al menos una de cada y la descarga siempre al final. */
export function blockPhaseWeeks(weeks: number, shape: Shape): [number, number, number, number] {
  const w = Math.max(4, Math.round(weeks));
  const desc = 1;
  const rest = w - desc;
  let acc: number;
  let peak: number;
  let int: number;
  if (shape === 'base1') {
    peak = 1;
    acc = Math.round(w * 0.5);
    int = rest - acc - peak;
  } else if (shape === 'base2') {
    peak = 2;
    acc = Math.round(w * 0.36);
    int = rest - acc - peak;
  } else {
    acc = Math.round(w * 0.25);
    int = Math.round(w * 0.25);
    peak = rest - acc - int;
  }
  // Nunca menos de una semana de cada fase; si eso hace pasarse, se le quita a la fase más larga, y si sobra, se le suma a la acumulación.
  const parts = [Math.max(1, acc), Math.max(1, int), Math.max(1, peak)];
  let sum = parts[0] + parts[1] + parts[2];
  while (sum > rest) {
    const longest = parts.indexOf(Math.max(...parts));
    parts[longest] -= 1;
    sum -= 1;
  }
  parts[0] += rest - sum;
  return [parts[0], parts[1], parts[2], desc];
}

/** Reparte las semanas en tres bloques (~30 %, ~33 % y el resto). */
export function blockLengths(totalWeeks: number): [number, number, number] {
  const a = Math.round(totalWeeks * 0.3);
  const b = Math.round(totalWeeks * 0.33);
  return [a, b, totalWeeks - a - b];
}

const SHAPES: { shape: Shape; label: string }[] = [
  { shape: 'base1', label: 'Base 1 · Reconstrucción' },
  { shape: 'base2', label: 'Base 2 · Fuerza y motor' },
  { shape: 'pico', label: 'Pico y tests' },
];

/** Semanas que dura el Texas Method de prueba. */
export const TEXAS_WEEKS = 8;

/**
 * El Texas Method que convive con el macro: arranca mañana, dura 8 semanas y se ofrece lunes (volumen), miércoles (recuperación) y viernes
 * (intensidad). Un levantamiento por semana, rotando sentadilla, press banca y press militar (el deadlift ya lo trabaja el macro).
 */
export function buildTexasProgram(todayIso: string, newId: () => string = () => crypto.randomUUID()): CompanionProgram {
  const startDate = addDaysIso(todayIso, 1);
  return {
    id: newId(),
    startDate,
    // Margen para aplazamientos: el programa acaba al hacer su última sesión, no en esta fecha.
    endDate: addDaysIso(startDate, (TEXAS_WEEKS + 6) * 7),
    method: 'texas',
    lifts: ['backSquat', 'benchPress', 'strictPress'],
    companion: newCompanion(COMPANION_DEFAULT_WEEKDAYS, TEXAS_WEEKS),
  };
}

/** Cambia el programa que convive con el macro por el Texas Method de prueba, sin tocar el macro. */
export function swapToTexas(profile: AthleteProfile, todayIso: string, newId: () => string = () => crypto.randomUUID()): AthleteProfile {
  const kept = (profile.strengthPrograms ?? []).filter((p) => !p.companion);
  return { ...profile, strengthPrograms: [...kept, buildTexasProgram(todayIso, newId)] };
}

/**
 * El plan completo desde el primer lunes tras `todayIso`: hasta junio, o, con una competición a la vista (`opts.competition`), hasta
 * una semana después de ella. `newId` = generador de ids (en tests, uno fijo).
 */
export function buildSeasonSetup(todayIso: string, newId: () => string = () => crypto.randomUUID(), opts: { competition?: SeasonCompetition } = {}): SeasonSetup | null {
  const startDate = nextMondayIso(todayIso);
  const competition = opts.competition;
  const program = buildTexasProgram(todayIso, newId);
  const ramp = { startDate, strengthWeeks: 1, olyWeeks: 2, wodWeeks: 2 };

  if (competition) {
    const macrocycles = buildBlocksToCompetition(startDate, competition.end, newId, competition.goalId);
    if (macrocycles.length === 0) return null;
    const endDate = macrocycles[macrocycles.length - 1].endDate;
    return { startDate, endDate, totalWeeks: weeksBetweenIso(startDate, endDate), macrocycles, program, ramp, competition };
  }

  const endDate = seasonEndIso(startDate);
  if (isoDiffDays(startDate, endDate) < 14 * 7) return null;
  const totalWeeks = weeksBetweenIso(startDate, endDate);
  const lengths = blockLengths(totalWeeks);

  let cursor = startDate;
  const macrocycles: Macrocycle[] = SHAPES.map(({ shape, label }, i) => {
    const isLast = i === SHAPES.length - 1;
    const end = isLast ? endDate : addDaysIso(cursor, lengths[i] * 7 - 1);
    const macro: Macrocycle = { id: newId(), label, startDate: cursor, endDate: end, phaseWeeks: blockPhaseWeeks(lengths[i], shape) };
    cursor = addDaysIso(end, 1);
    return macro;
  });

  return { startDate, endDate, totalWeeks, macrocycles, program, ramp };
}

/** Los objetivos que se mantienen con una temporada que lleva a una competición: los que no han vencido y las competiciones ya cerradas. */
function keptGoals(profile: AthleteProfile, todayIso: string): AthleteProfile['goals'] {
  return profile.goals.filter((g) => g.targetDate >= todayIso || g.result);
}

/** Con una competición a la vista el macro de ahora se recorta el día antes de que empiece la temporada; sin ella, se sustituye todo. */
function keptMacros(profile: AthleteProfile, setup: SeasonSetup): AthleteProfile['macrocycles'] {
  if (!setup.competition) return [];
  return profile.macrocycles.flatMap((m) => {
    if (m.endDate < setup.startDate) return [m];
    if (m.startDate >= setup.startDate) return [];
    return [{ ...m, endDate: addDaysIso(setup.startDate, -1) }];
  });
}

/**
 * Lo que se va a quitar, para enseñarlo antes de aplicar. Sin competición a la vista, todo lo que hay (macros, objetivos y programas);
 * con ella, solo la parte de los macros que cae en la temporada nueva, los objetivos ya vencidos y los programas.
 */
export function describeRemovals(profile: AthleteProfile, setup?: SeasonSetup | null, todayIso?: string): { macrocycles: string[]; goals: number; programs: string[] } {
  const withCompetition = Boolean(setup?.competition);
  const macros = withCompetition && setup ? profile.macrocycles.filter((m) => m.endDate >= setup.startDate) : profile.macrocycles;
  return {
    macrocycles: macros.map((m) => `${m.label} (${m.startDate} → ${m.endDate})`),
    goals: withCompetition && todayIso ? profile.goals.length - keptGoals(profile, todayIso).length : profile.goals.length,
    programs: (profile.strengthPrograms ?? []).map((p) => `${STRENGTH_METHOD_LABEL[p.method]} (${p.startDate} → ${p.endDate})`),
  };
}

/** Lo que había antes, por si hay que volver atrás. */
export interface SeasonBackup {
  savedAt: string;
  macrocycles: AthleteProfile['macrocycles'];
  goals: AthleteProfile['goals'];
  strengthPrograms: NonNullable<AthleteProfile['strengthPrograms']>;
  intensityRamp?: AthleteProfile['intensityRamp'];
}

export function backupBeforeSeason(profile: AthleteProfile, savedAt: string): SeasonBackup {
  return {
    savedAt,
    macrocycles: profile.macrocycles,
    goals: profile.goals,
    strengthPrograms: profile.strengthPrograms ?? [],
    intensityRamp: profile.intensityRamp,
  };
}

/** Aplica el plan: quita macros, objetivos y programas, pone los nuevos y borra las sesiones ya preparadas que dependían de lo anterior. */
export function applySeasonSetup(profile: AthleteProfile, setup: SeasonSetup, todayIso: string): AthleteProfile {
  const keepPast = <T>(record: Record<string, T> | undefined): Record<string, T> | undefined =>
    record ? Object.fromEntries(Object.entries(record).filter(([date]) => date < todayIso)) : record;
  return {
    ...profile,
    macrocycles: [...keptMacros(profile, setup), ...setup.macrocycles],
    goals: setup.competition ? keptGoals(profile, todayIso) : [],
    strengthPrograms: [setup.program],
    intensityRamp: setup.ramp,
    // Las sesiones y reservas de semana ya preparadas se hicieron con lo anterior: desde hoy se vuelven a generar.
    sessionCache: keepPast(profile.sessionCache),
    weeklyLocks: keepPast(profile.weeklyLocks),
    regenVariants: keepPast(profile.regenVariants),
  };
}

/** Deshace `applySeasonSetup` con la copia de antes. */
export function restoreSeasonBackup(profile: AthleteProfile, backup: SeasonBackup): AthleteProfile {
  return { ...profile, macrocycles: backup.macrocycles, goals: backup.goals, strengthPrograms: backup.strengthPrograms, intensityRamp: backup.intensityRamp };
}

/** Semanas mínimas hasta la siguiente competición para montar un bloque propio. */
export const MIN_BLOCK_WEEKS = 4;

/**
 * Los macros que llevan de `startIso` a la competición, terminando una semana después de su último día (para que la recuperación
 * posterior quede dentro de un macro). Con 14 semanas o más, tres bloques (base 1, base 2 y pico); de 8 a 13, dos; de 4 a 7, solo el pico;
 * con menos no se monta nada (el modo competición se ocupa de las últimas semanas).
 */
export function buildBlocksToCompetition(startIso: string, eventEndIso: string, newId: () => string, goalId?: string): Macrocycle[] {
  const endDate = addDaysIso(eventEndIso, 7);
  const total = weeksBetweenIso(startIso, endDate);
  if (total < MIN_BLOCK_WEEKS) return [];
  const shapes: { shape: 'base1' | 'base2' | 'pico'; label: string }[] =
    total >= 14
      ? [
          { shape: 'base1', label: 'Base 1 · Reconstrucción' },
          { shape: 'base2', label: 'Base 2 · Fuerza y motor' },
          { shape: 'pico', label: 'Pico y competición' },
        ]
      : total >= 8
        ? [
            { shape: 'base2', label: 'Base · Fuerza y motor' },
            { shape: 'pico', label: 'Pico y competición' },
          ]
        : [{ shape: 'pico', label: 'Pico y competición' }];
  const lengths = shapes.length === 3 ? blockLengths(total) : shapes.length === 2 ? [Math.round(total * 0.55), total - Math.round(total * 0.55)] : [total];
  const out: Macrocycle[] = [];
  let cursor = startIso;
  shapes.forEach(({ shape, label }, i) => {
    const last = i === shapes.length - 1;
    const end = last ? endDate : addDaysIso(cursor, lengths[i] * 7 - 1);
    out.push({ id: newId(), label, startDate: cursor, endDate: end, phaseWeeks: blockPhaseWeeks(lengths[i], shape), ...(goalId ? { forGoalId: goalId } : {}) });
    cursor = addDaysIso(end, 1);
  });
  return out;
}
