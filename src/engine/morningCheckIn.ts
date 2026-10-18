import type { PainFlag, ReadinessCheck, SoreLevelNum, SoreZoneId } from '../data/athlete/types';
import { checkFromQuickAnswer, type CheckInOverall } from './readiness';
import { PAIN_AREA_AVOID_TEXT, PAIN_AREA_LABEL, type PainFollowUp } from './painFlags';
import { VS_WORD, type HrvPart } from './hrv';

/**
 * Lógica de la tarjeta de la mañana: cómo sus respuestas (Bien/Normal/Mal, sueño, agujetas por zona, estrés, motivación,
 * pulso) se convierten en el check-in de 4 ejes que ya entiende el motor, qué agujetas tocan qué roles del accesorio, y
 * la lista honesta de "qué cambia hoy" frente a "solo lo apunto".
 */

/** Zona de la silueta agrupada por músculo (izquierda y derecha cuentan igual para el motor). */
export type SoreArea = 'cuello' | 'hombro' | 'codo' | 'lumbar' | 'cadera' | 'muslo' | 'gemelo';

export const SORE_ZONE_ORDER: SoreZoneId[] = ['cuello', 'hombro-i', 'hombro-d', 'codo-i', 'codo-d', 'lumbar', 'cadera-i', 'cadera-d', 'muslo-i', 'muslo-d', 'gemelo-i', 'gemelo-d'];

export const SORE_ZONE_AREA: Record<SoreZoneId, SoreArea> = {
  cuello: 'cuello',
  'hombro-i': 'hombro',
  'hombro-d': 'hombro',
  'codo-i': 'codo',
  'codo-d': 'codo',
  lumbar: 'lumbar',
  'cadera-i': 'cadera',
  'cadera-d': 'cadera',
  'muslo-i': 'muslo',
  'muslo-d': 'muslo',
  'gemelo-i': 'gemelo',
  'gemelo-d': 'gemelo',
};

export const SORE_ZONE_LABEL: Record<SoreZoneId, string> = {
  cuello: 'Cuello',
  'hombro-i': 'Hombro izq.',
  'hombro-d': 'Hombro der.',
  'codo-i': 'Codo izq.',
  'codo-d': 'Codo der.',
  lumbar: 'Zona lumbar',
  'cadera-i': 'Cadera izq.',
  'cadera-d': 'Cadera der.',
  'muslo-i': 'Muslo izq.',
  'muslo-d': 'Muslo der.',
  'gemelo-i': 'Gemelo izq.',
  'gemelo-d': 'Gemelo der.',
};

/** Roles del accesorio (ver `generateSession`): pierna unilateral, salto, cadena posterior, empujes y tirones. */
export type SoreRole = 'unilateralLeg' | 'plyo' | 'posterior' | 'hPush' | 'vPush' | 'hPull' | 'vPull';

const UPPER_ROLES: SoreRole[] = ['hPush', 'vPush', 'hPull', 'vPull'];

/** Qué roles del accesorio carga cada músculo: si está con agujetas, ese rol se recorta o se cambia hoy. */
const SORE_AREA_ROLES: Record<SoreArea, SoreRole[]> = {
  cuello: UPPER_ROLES,
  hombro: UPPER_ROLES,
  codo: UPPER_ROLES,
  lumbar: ['posterior', 'unilateralLeg', 'plyo'],
  cadera: ['posterior', 'unilateralLeg', 'plyo'],
  muslo: ['unilateralLeg', 'plyo', 'posterior'],
  gemelo: ['plyo', 'unilateralLeg'],
};

/** Cómo se llama en los avisos el trabajo que recorta cada músculo. */
const SORE_AREA_TEXT: Record<SoreArea, string> = {
  cuello: 'empuje y tirón',
  hombro: 'empuje y tirón',
  codo: 'empuje y tirón',
  lumbar: 'bisagra y piernas',
  cadera: 'bisagra y piernas',
  muslo: 'piernas',
  gemelo: 'piernas',
};

/** El nivel de agujetas más alto que pesa sobre cada rol del accesorio (1 = leves, 2 = fuertes); sin entrada = sin agujetas. */
export function soreRoleLevels(zones: ReadinessCheck['soreZones']): Partial<Record<SoreRole, SoreLevelNum>> {
  const out: Partial<Record<SoreRole, SoreLevelNum>> = {};
  for (const [id, level] of Object.entries(zones ?? {}) as [SoreZoneId, SoreLevelNum | undefined][]) {
    if (!level) continue;
    for (const role of SORE_AREA_ROLES[SORE_ZONE_AREA[id]]) {
      if ((out[role] ?? 0) < level) out[role] = level;
    }
  }
  return out;
}

/** Las agujetas agrupadas por el trabajo que recortan ("piernas", "empuje y tirón"…), con su nivel más alto. */
export function soreSummary(zones: ReadinessCheck['soreZones']): { text: string; level: SoreLevelNum }[] {
  const byText = new Map<string, SoreLevelNum>();
  for (const [id, level] of Object.entries(zones ?? {}) as [SoreZoneId, SoreLevelNum | undefined][]) {
    if (!level) continue;
    const text = SORE_AREA_TEXT[SORE_ZONE_AREA[id]];
    if ((byText.get(text) ?? 0) < level) byText.set(text, level);
  }
  return [...byText].map(([text, level]) => ({ text, level }));
}

export interface CardAnswers {
  overall: CheckInOverall | null;
  hours?: number;
  /** 1–5. */
  quality?: number;
  /** 0–4. */
  stress?: number;
  /** 0–4. */
  motivation?: number;
  soreZones?: Partial<Record<SoreZoneId, SoreLevelNum>>;
  restingHr?: number;
  /** rMSSD de la medición de la mañana, en ms. */
  hrv?: number;
}

/** True si la tarjeta lleva alguna respuesta (si no, no hay nada que guardar). */
export function hasAnyAnswer(a: CardAnswers): boolean {
  return (
    a.overall !== null ||
    a.hours !== undefined ||
    a.quality !== undefined ||
    a.stress !== undefined ||
    a.motivation !== undefined ||
    a.restingHr !== undefined ||
    a.hrv !== undefined ||
    Object.keys(a.soreZones ?? {}).length > 0
  );
}

type Sleep = ReadinessCheck['sleep'];
const SLEEP_RANK: Record<Sleep, number> = { mal: 0, regular: 1, bien: 2 };

/**
 * Convierte las respuestas de la tarjeta en el check-in de 4 ejes que ya usa el motor. Lo que contestas manda; lo que dejas
 * sin contestar sale del "Bien / Normal / Mal" de arriba y, sin él, queda neutro (ni suma ni resta). Atajo: solo "Bien" =
 * todo a favor, igual que el check-in rápido de siempre.
 *  - Sueño: las horas (menos de 6 mal, menos de 7 regular) y la calidad (≤2 mal, 3 regular); si das las dos, manda la peor.
 *  - Agujetas: alguna fuerte, o tres o más zonas, es "alto"; cualquier otra marcada es "leve"; ninguna marcada es "ninguno".
 *  - Estrés y motivación: los 5 tramos se agrupan en bajo/medio/alto y baja/normal/alta.
 */
export function checkFromCard(dateIso: string, a: CardAnswers): ReadinessCheck {
  const base = a.overall ? checkFromQuickAnswer(dateIso, a.overall, []) : null;
  const zones = Object.entries(a.soreZones ?? {}).filter(([, level]) => level) as [SoreZoneId, SoreLevelNum][];

  const candidates: Sleep[] = [];
  if (a.hours !== undefined) candidates.push(a.hours < 6 ? 'mal' : a.hours < 7 ? 'regular' : 'bien');
  if (a.quality !== undefined) candidates.push(a.quality <= 2 ? 'mal' : a.quality === 3 ? 'regular' : 'bien');
  const sleep: Sleep = candidates.length > 0 ? candidates.reduce((worst, s) => (SLEEP_RANK[s] < SLEEP_RANK[worst] ? s : worst)) : (base?.sleep ?? 'regular');

  const soreness: ReadinessCheck['soreness'] =
    zones.length > 0
      ? zones.some(([, level]) => level === 2) || zones.length >= 3
        ? 'alto'
        : 'leve'
      : (base?.soreness ?? 'ninguno');
  const stress: ReadinessCheck['stress'] = a.stress !== undefined ? (a.stress <= 1 ? 'bajo' : a.stress === 2 ? 'medio' : 'alto') : (base?.stress ?? 'medio');
  const motivation: ReadinessCheck['motivation'] = a.motivation !== undefined ? (a.motivation <= 1 ? 'baja' : a.motivation === 2 ? 'normal' : 'alta') : (base?.motivation ?? 'normal');

  const check: ReadinessCheck = { date: dateIso, sleep, soreness, stress, motivation };
  if (a.overall) check.overall = a.overall;
  if (a.hours !== undefined) check.sleepHours = a.hours;
  if (a.quality !== undefined) check.sleepQuality = a.quality;
  if (a.stress !== undefined) check.stressLevel = a.stress;
  if (a.motivation !== undefined) check.motivationLevel = a.motivation;
  if (zones.length > 0) check.soreZones = Object.fromEntries(zones) as ReadinessCheck['soreZones'];
  if (a.restingHr !== undefined) check.restingHr = a.restingHr;
  if (a.hrv !== undefined) check.hrv = a.hrv;
  return check;
}

/** Las respuestas de la tarjeta que se guardaron en un check-in, para volver a abrirla y corregirla. */
export function answersFromCheck(check: ReadinessCheck | undefined): CardAnswers {
  if (!check) return { overall: null };
  return {
    overall: check.overall ?? null,
    hours: check.sleepHours,
    quality: check.sleepQuality,
    stress: check.stressLevel,
    motivation: check.motivationLevel,
    soreZones: check.soreZones,
    restingHr: check.restingHr,
    hrv: check.hrv,
  };
}

export { restingHrBaseline } from './hrv';

export type MorningTone = 'good' | 'mid' | 'warn' | 'bad' | 'sleep' | 'info' | 'neutral';
export type MorningIcon = 'trend-up' | 'trend-down' | 'equal' | 'moon' | 'shield' | 'shield-check' | 'flame' | 'brain' | 'heart' | 'bell' | 'check';
export interface MorningLine {
  icon: MorningIcon;
  tone: MorningTone;
  text: string;
}

export interface MorningVerdict {
  text: string;
  tone: 'good' | 'mid' | 'bad';
}

/**
 * La frase que resume cómo llegas a entrenar, a partir de la nota de preparación de hoy (su nivel), de si hay una HRV por debajo
 * de tu rango o un pulso alto, y de si hay sesión. Es lo primero que lees al terminar la tarjeta.
 */
export function verdictFor(input: { level: 'alta' | 'normal' | 'baja' | null; day: 'training' | 'rest' | 'trained'; hrvLow: boolean }): MorningVerdict | null {
  const { level, day, hrvLow } = input;
  if (level === null || day === 'trained') return null;
  const low = level === 'baja' || (level === 'normal' && hrvLow);
  if (day === 'rest') {
    if (low) return { text: 'Hoy necesitas recuperar: duerme y come bien, y nada de extras', tone: 'bad' };
    return level === 'alta' ? { text: 'Vas muy bien de recuperación', tone: 'good' } : { text: 'Vas normal de recuperación: descansa tranquilo', tone: 'mid' };
  }
  if (low) return { text: 'Llegas justo: entrena sin pasarte del objetivo y escucha al cuerpo', tone: 'bad' };
  return level === 'alta' ? { text: 'Llegas bien: buen día para apretar', tone: 'good' } : { text: 'Llegas normal: entrena como está previsto', tone: 'mid' };
}

export interface MorningDescribeInput {
  check: ReadinessCheck;
  /** `training` = hay sesión por entrenar, `rest` = día de descanso, `trained` = hoy ya entrenaste. */
  day: 'training' | 'rest' | 'trained';
  /** Si la sesión de hoy lleva bloque de accesorio (las agujetas solo lo recortan ahí). */
  hasAccessory: boolean;
  /** Factor de carga que sale del check-in (ver `getReadinessFactor`). */
  factor: number;
  /** Avisos de molestia que había vigentes al abrir la tarjeta y lo que contestaste de cada uno (sin contestar = sigue). */
  flags: { flag: PainFlag; answer: PainFollowUp | null }[];
  /** HRV y pulso de hoy frente a tu rango y tu media (ver `computeHrvPart`). */
  hrv: HrvPart;
  /** El descanso de ayer (ver `restPart`): si suma a la nota de hoy, se cuenta como uno de los cambios. */
  rest?: { credit: number; streak: number; restDays: number };
}

const fmtHours = (h: number) => {
  const m = Math.round((h % 1) * 60);
  return `${Math.floor(h)} h${m ? ` ${m}` : ''}`;
};

/**
 * Lo que de verdad cambia hoy por lo que has contado (`changes`) y lo que solo se apunta para aprender (`notes`). No promete
 * nada que el motor no haga: las agujetas recortan el accesorio, los avisos de molestia evitan sus movimientos, el check-in
 * mueve la carga con el factor de siempre; HRV y pulso restan a la preparación cuando caen fuera de tu rango; el sueño corto
 * solo se anota para aprender.
 */
export function describeMorning(input: MorningDescribeInput): { changes: MorningLine[]; notes: MorningLine[] } {
  const { check, day, hasAccessory, factor, flags, hrv, rest } = input;
  const changes: MorningLine[] = [];
  const notes: MorningLine[] = [];
  const seen = new Set<string>();
  const add = (list: MorningLine[], line: MorningLine) => {
    if (seen.has(line.text)) return;
    seen.add(line.text);
    list.push(line);
  };

  if (day === 'rest') add(changes, { icon: 'moon', tone: 'sleep', text: 'Hoy no hay sesión: lo que cuentas ajusta tu preparación de mañana' });
  else if (day === 'training') {
    const pct = Math.round(Math.abs(factor - 1) * 100);
    if (factor > 1) add(changes, { icon: 'trend-up', tone: 'good', text: `Subo la intensidad un ${pct} %, el último tramo de la sesión` });
    else if (factor < 1) add(changes, { icon: 'trend-down', tone: 'bad', text: `Reduzco la carga de hoy un ${pct} %` });
    else add(changes, { icon: 'equal', tone: 'mid', text: 'Mantengo la carga prevista' });
  }

  if (rest && rest.credit > 0) {
    const when = rest.restDays === 1 ? 'Descansaste ayer' : `Llevas ${rest.restDays} días de descanso`;
    const after = rest.streak >= 2 ? ` tras ${rest.streak} días seguidos` : '';
    add(changes, { icon: 'moon', tone: 'good', text: `${when}${after}: suma ${rest.credit} ${rest.credit === 1 ? 'punto' : 'puntos'} a tu preparación` });
  }

  for (const { flag, answer } of flags) {
    const area = PAIN_AREA_LABEL[flag.area].toLowerCase();
    if (answer === 'paso') add(changes, { icon: 'shield-check', tone: 'good', text: `Quito el aviso de ${area}: la carga vuelve poco a poco` });
    else if (answer === 'mejor') add(changes, { icon: 'shield', tone: 'warn', text: `${PAIN_AREA_LABEL[flag.area]} mejor: lo mantengo unos días más y la carga vuelve poco a poco` });
    else add(changes, { icon: 'shield', tone: 'warn', text: `Sigo evitando ${PAIN_AREA_AVOID_TEXT[flag.area]} (${area})` });
  }

  for (const { text, level } of soreSummary(check.soreZones)) {
    if (day === 'training' && hasAccessory) {
      add(changes, level === 2 ? { icon: 'flame', tone: 'warn', text: `Cambio ${text} por otro trabajo en el accesorio` } : { icon: 'flame', tone: 'mid', text: `Una serie menos de ${text} en el accesorio` });
    } else {
      add(notes, { icon: 'flame', tone: 'mid', text: `Agujetas de ${text}: cuentan para tu preparación` });
    }
  }

  if (check.stress === 'alto') add(changes, { icon: 'brain', tone: 'neutral', text: 'Estrés alto: resta a tu preparación de hoy' });
  if (check.motivation === 'baja') add(changes, { icon: 'brain', tone: 'neutral', text: 'Motivación baja: resta a tu preparación de hoy' });

  const shortSleep = (check.sleepHours !== undefined && check.sleepHours < 7) || (check.sleepQuality !== undefined && check.sleepQuality <= 2);
  if (shortSleep) {
    const what = check.sleepHours !== undefined && check.sleepHours < 7 ? `Sueño corto (${fmtHours(check.sleepHours)})` : 'Sueño de mala calidad';
    add(notes, { icon: 'moon', tone: 'sleep', text: `${what}: lo apunto para aprender cuánto te afecta` });
  }

  // HRV y pulso: con rango resta si cae por debajo (y una HRV baja pesa como señal en contra para la carga); sin rango solo se cuenta.
  const { status } = hrv;
  if (status.today) {
    const { rmssd } = status.today;
    if (status.state === 'listo' && status.range) {
      const where = `${rmssd} ms, ${VS_WORD[status.today.vs ?? 'normal']} (${status.range.low}–${status.range.high})`;
      if (hrv.hrvPenalty > 0) {
        const base = status.week?.vs === 'bajo' ? `Tu HRV de la semana (${status.week.avg} ms) está por debajo de tu rango` : `Tu HRV de hoy (${where})`;
        add(changes, { icon: 'heart', tone: 'warn', text: `${base}: resta ${hrv.hrvPenalty} ${hrv.hrvPenalty === 1 ? 'punto' : 'puntos'} a tu preparación` });
        if (day === 'training' && check.hrvVs === 'bajo') add(changes, { icon: 'trend-down', tone: 'warn', text: 'Una HRV baja cuenta como una señal en contra para la carga de hoy' });
      } else {
        add(notes, { icon: 'heart', tone: status.today.vs === 'bajo' ? 'warn' : 'good', text: `HRV ${where}${status.today.vs === 'bajo' ? '' : ': sin cambios'}` });
      }
    } else {
      const left = Math.max(0, status.needed - status.n);
      add(notes, {
        icon: 'heart',
        tone: 'neutral',
        text: left > 0 ? `HRV ${rmssd} ms apuntada: llevas ${status.n} de ${status.needed} mediciones para calcular tu rango normal` : `HRV ${rmssd} ms apuntada: mañana ya tendrás tu rango normal`,
      });
    }
  }
  if (status.hr.today !== null) {
    const { today: hr, baseline, delta } = status.hr;
    if (hrv.hrPenalty > 0) add(changes, { icon: 'heart', tone: 'warn', text: `Pulso ${hr} ppm, ${delta} por encima de tu media (${baseline}): resta ${hrv.hrPenalty} ${hrv.hrPenalty === 1 ? 'punto' : 'puntos'} a tu preparación` });
    else add(notes, { icon: 'heart', tone: 'neutral', text: baseline !== null ? `Pulso ${hr} ppm, como tu media (${baseline})` : `Pulso ${hr} ppm: lo apunto para calcular tu media` });
  }

  const pending = flags.filter(({ answer }) => answer !== 'paso');
  if (pending.length > 0) add(notes, { icon: 'bell', tone: 'info', text: `Mañana te preguntaré otra vez por ${pending.map(({ flag }) => PAIN_AREA_LABEL[flag.area].toLowerCase()).join(' y ')}` });

  if (changes.length === 0 && notes.length === 0) add(notes, { icon: 'check', tone: 'good', text: 'Nada más cambia hoy' });
  return { changes, notes };
}
