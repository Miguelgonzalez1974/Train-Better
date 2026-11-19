import type { SessionBlockResult } from '../data/athlete/types';
import {
  HANDSTAND_WALK_LADDER,
  MU_LADDERS,
  SKILL_WAVE_WEEKS,
  type MuKind,
  type SkillFocusKey,
  type SkillLadderStep,
  type SkillWaveWeek,
} from '../data/movements/skillFocusLadders';

/**
 * El foco de skill: handstand walk y muscle-up, con progresión de verdad. Cada semana lleva 3 días de skill: una semana 2 de muscle-up y 1 de
 * handstand walk, y la siguiente al revés. Cada habilidad sube por su escalera (`skillFocusLadders.ts`), un paso cada 4 semanas (una ola: series y
 * repeticiones que suben y una semana de test). El nivel de partida y el paso actual los marca el atleta en Objetivos → Cómo programa el coach;
 * cambiar el paso lo hace empezar hoy.
 *
 * Puro y determinista: el mismo día da el mismo bloque en cualquier dispositivo, sin historial ni azar.
 */

export type { MuKind, SkillFocusKey } from '../data/movements/skillFocusLadders';
export { SKILL_WAVE_WEEKS } from '../data/movements/skillFocusLadders';

/** Dónde está una habilidad en su escalera: el paso base y desde qué día se cuenta (cada 4 semanas pasa al siguiente). */
export interface SkillTrack {
  step: number;
  /** yyyy-mm-dd. */
  since: string;
}

export interface SkillFocusSettings {
  muKind?: MuKind;
  mu?: SkillTrack;
  hsw?: SkillTrack;
}

/** Sin nada guardado, el foco arranca el primer lunes tras ponerlo (la semana que empieza el 23 nov 2026), en el primer paso de cada escalera. */
export const SKILL_FOCUS_START = '2026-11-23';
/** Lunes de la primera semana tipo A (2 muscle-up + 1 handstand walk); las semanas pares desde aquí son A y las impares B. */
const WEEK_ANCHOR = '2026-11-23';

/** Sesiones de skill por semana. */
export const SKILL_SESSIONS_PER_WEEK = 3;

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
const mondayNumber = (iso: string): number => {
  const dn = dayNumber(iso);
  return dn - ((dn + 3) % 7);
};

/** La escalera de una habilidad (la del muscle-up depende de si es en barra o en anillas). */
export function skillLadder(skill: SkillFocusKey, muKind: MuKind = 'bar'): SkillLadderStep[] {
  return skill === 'hsw' ? HANDSTAND_WALK_LADDER : MU_LADDERS[muKind];
}

export function skillLabel(skill: SkillFocusKey, muKind: MuKind = 'bar'): string {
  return skill === 'hsw' ? 'Handstand walk' : muKind === 'ring' ? 'Muscle-up en anillas' : 'Muscle-up en barra';
}

/** Qué habilidad toca en cada uno de los 3 días de skill de la semana: A = muscle-up, handstand walk, muscle-up; B = al revés. */
export function skillOfSlot(dateIso: string, slot: number): SkillFocusKey {
  const week = Math.floor((mondayNumber(dateIso) - mondayNumber(WEEK_ANCHOR)) / 7);
  const weekA = ((week % 2) + 2) % 2 === 0;
  const pattern: SkillFocusKey[] = weekA ? ['mu', 'hsw', 'mu'] : ['hsw', 'mu', 'hsw'];
  return pattern[((slot % SKILL_SESSIONS_PER_WEEK) + SKILL_SESSIONS_PER_WEEK) % SKILL_SESSIONS_PER_WEEK];
}

/** Cuántos días de la semana de `dateIso` son de cada habilidad. */
export function skillWeekSplit(dateIso: string): { mu: number; hsw: number } {
  let mu = 0;
  for (let s = 0; s < SKILL_SESSIONS_PER_WEEK; s++) if (skillOfSlot(dateIso, s) === 'mu') mu++;
  return { mu, hsw: SKILL_SESSIONS_PER_WEEK - mu };
}

export interface SkillPosition {
  /** Paso de la escalera (0 = el primero). */
  stepIndex: number;
  stepCount: number;
  /** Semana de la ola del paso (0-3; la 3 es el test). */
  waveWeek: number;
  /** Primer día en que se pasa al siguiente paso, o null si ya es el último. */
  nextStepFrom: string | null;
}

/** Dónde está una habilidad un día dado: el paso base se mantiene 4 semanas y luego sube solo, hasta el último paso, donde la ola se repite. */
export function skillPosition(settings: SkillFocusSettings | undefined, skill: SkillFocusKey, dateIso: string): SkillPosition {
  const ladder = skillLadder(skill, settings?.muKind);
  const track = (skill === 'hsw' ? settings?.hsw : settings?.mu) ?? { step: 0, since: SKILL_FOCUS_START };
  const base = Math.min(ladder.length - 1, Math.max(0, Math.round(track.step)));
  const weeks = Math.max(0, Math.floor((dayNumber(dateIso) - dayNumber(track.since)) / 7));
  const advance = Math.floor(weeks / SKILL_WAVE_WEEKS);
  const stepIndex = Math.min(ladder.length - 1, base + advance);
  const atTop = stepIndex >= ladder.length - 1;
  const waveWeek = weeks % SKILL_WAVE_WEEKS;
  let nextStepFrom: string | null = null;
  if (!atTop) {
    const startOfNext = dayNumber(track.since) + (advance + 1) * SKILL_WAVE_WEEKS * 7;
    nextStepFrom = new Date(startOfNext * 86400000).toISOString().slice(0, 10);
  }
  return { stepIndex, stepCount: ladder.length, waveWeek, nextStepFrom };
}

function entriesFor(settings: SkillFocusSettings | undefined, skill: SkillFocusKey, dateIso: string): SessionBlockResult[] {
  const muKind = settings?.muKind ?? 'bar';
  const ladder = skillLadder(skill, muKind);
  const pos = skillPosition(settings, skill, dateIso);
  const step = ladder[pos.stepIndex];
  const week: SkillWaveWeek = step.wave[pos.waveWeek];
  const split = skillWeekSplit(dateIso);
  const name = skillLabel(skill, muKind);
  const isTest = pos.waveWeek === SKILL_WAVE_WEEKS - 1;
  const atTop = pos.stepIndex >= pos.stepCount - 1;
  const planLine = `Esta semana: ${split.mu} de muscle-up y ${split.hsw} de handstand walk; la semana que viene, al revés.`;
  const testLine = isTest
    ? atTop
      ? ' Semana de test: anota tu marca; la ola vuelve a empezar la semana que viene con más exigencia.'
      : ' Semana de test del paso: si lo clavas, la semana que viene empieza el siguiente paso solo; si no, repítelo desde Objetivos → Cómo programa el coach.'
    : '';
  const out: SessionBlockResult[] = [];
  // Un paso por debajo, ligero y primero: prepara el patrón antes de lo difícil.
  if (pos.stepIndex > 0) {
    const feeder = ladder[pos.stepIndex - 1];
    out.push({
      block: 'skill',
      movementId: feeder.movementId,
      sets: 2,
      reps: feeder.wave[0].reps,
      notes: `Calentamiento técnico — el paso anterior (${feeder.label}), ligero: prepara el patrón antes de lo difícil.`,
    });
  }
  out.push({
    block: 'skill',
    movementId: step.movementId,
    sets: week.sets,
    reps: week.reps,
    notes: `${name} · paso ${pos.stepIndex + 1} de ${pos.stepCount} (${step.label}), semana ${pos.waveWeek + 1} de ${SKILL_WAVE_WEEKS}. ${step.cue} ${week.tip}${testLine} ${planLine}`,
  });
  return out;
}

/**
 * El bloque de skill de un día: la habilidad que toca ese día de la semana (según el hueco 0, 1 o 2 entre los 3 días de skill) y su paso de hoy.
 * Si la habilidad de hoy toca un patrón con molestia (`isAvoided`), cae a la otra; si ninguna se puede, no hay foco hoy (null) y se sigue con la
 * rotación de siempre.
 */
export function buildSkillFocusEntries(
  settings: SkillFocusSettings | undefined,
  dateIso: string,
  slot: number,
  isAvoided: (movementId: string) => boolean,
): SessionBlockResult[] | null {
  const first = skillOfSlot(dateIso, slot);
  const order: SkillFocusKey[] = first === 'mu' ? ['mu', 'hsw'] : ['hsw', 'mu'];
  for (const skill of order) {
    const entries = entriesFor(settings, skill, dateIso);
    if (!entries.some((e) => isAvoided(e.movementId))) return entries;
  }
  return null;
}
