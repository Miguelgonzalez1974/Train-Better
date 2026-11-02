import type { DailySession } from '../data/athlete/types';
import type { RecoveryLevel } from './recovery';

/**
 * El consejo del día para el Resumen: un verbo ("Baja el ritmo hoy.") y el motivo en una frase corta. No calcula nada propio:
 * lee lo que ya dicen los anillos y el semáforo del coach (para que nunca se contradigan) y escoge qué decir con este orden:
 * competición (el día, la víspera, la activación o el simulacro) → semáforo rojo → semáforo ámbar → molestia activa → semáforo
 * verde → sin semáforo (carga y preparación). Un día de descanso habla de recuperar.
 */
export type AdviceTone = 'good' | 'mid' | 'bad' | 'info';

export interface DayAdvice {
  /** Lo que hacer, en pocas palabras y con punto final. */
  lead: string;
  /** Por qué, con los números que lo justifican. */
  reason: string;
  tone: AdviceTone;
}

export interface DayAdviceInput {
  /** La sesión de hoy (la del semáforo y la competición); null si no hay ninguna prevista. */
  session: Pick<DailySession, 'isRestDay' | 'dayLight' | 'competition' | 'mesocycleWeek'> | null;
  /** Ya hiciste el check-in de hoy. */
  hasCheckIn: boolean;
  /** Preparación de hoy y su nivel (null sin datos). */
  prep: number | null;
  level: RecoveryLevel | null;
  /** Zona de la carga (ACWR); null si aún no hay historial para medirla. */
  loadZone: 'baja' | 'optima' | 'moderada' | 'alta' | null;
  hrvLow: boolean;
  /** Áreas de los avisos de molestia vigentes (`PainFlag.area`). */
  painAreas: string[];
  /** Lo que se prevé de la sesión frente a tu objetivo de esfuerzo; null si no hay sesión o no se puede estimar. */
  fit: { kind: 'dentro' | 'se-pasa' | 'se-queda-corta'; planned: number; diff: number } | null;
  target: { low: number; high: number };
}

const PAIN_LABEL: Record<string, string> = {
  hombro: 'el hombro',
  'cadera-lumbar': 'la cadera y la lumbar',
  rodilla: 'la rodilla',
  'codo-muneca': 'el codo y la muñeca',
};

const LOAD_WORD: Record<'baja' | 'optima' | 'moderada' | 'alta', string> = { baja: 'baja', optima: 'óptima', moderada: 'alta', alta: 'muy alta' };

const joinAnd = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** "La sesión (~6) encaja con tu objetivo (5–7)." */
function fitClause(fit: DayAdviceInput['fit'], target: DayAdviceInput['target']): string {
  if (!fit) return '';
  const range = `${target.low}–${target.high}`;
  if (fit.kind === 'dentro') return `La sesión (~${fit.planned}) encaja con tu objetivo (${range}).`;
  if (fit.kind === 'se-pasa') return `La sesión (~${fit.planned}) se pasa ${fit.diff} de tu objetivo (${range}): puedes ajustarla.`;
  return `La sesión (~${fit.planned}) te deja margen sobre tu objetivo (${range}).`;
}

const sentence = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
const withStop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function dayAdvice(input: DayAdviceInput): DayAdvice {
  const { session, hasCheckIn, prep, level, loadZone, hrvLow, painAreas, fit, target } = input;
  const fitText = fitClause(fit, target);
  const comp = session?.competition;
  const light = session?.dayLight ?? null;

  // La competición manda: ese día, la víspera, la activación y el simulacro tienen su propio guion.
  if (comp) {
    if (comp.eventDay || comp.phase === 'evento') {
      return { lead: 'Hoy compites.', reason: 'Calienta como un WOD, come y bebe lo de siempre y no pruebes nada nuevo.', tone: 'info' };
    }
    if (comp.phase === 'vispera') {
      return { lead: 'Mañana compites: hoy no se entrena.', reason: 'Movilidad, cardio suave, dormir y comer bien.', tone: 'info' };
    }
    if (comp.simulacro) {
      return { lead: 'Hoy es el simulacro.', reason: 'Trátalo como la competición y apunta cómo te sientes antes y mañana.', tone: 'info' };
    }
    if (comp.phase === 'activacion') {
      const d = comp.daysToEvent;
      return { lead: 'Sesión corta y técnica.', reason: `${d === 1 ? 'Mañana compites' : `Faltan ${d} días`}: mueves sangre y afinas sin cansarte.`, tone: 'info' };
    }
    if (comp.phase === 'post') {
      return { lead: 'Muévete, no te vacíes.', reason: 'Tras competir, baja la carga unos días y después volvemos al plan.', tone: 'info' };
    }
  }

  // Descanso (o nada previsto).
  if (!session || session.isRestDay) {
    const targetText = `Si entrenas, tu objetivo es ${target.low}–${target.high}.`;
    if (!session) return { lead: 'Hoy no hay sesión prevista.', reason: targetText, tone: 'info' };
    const low = level === 'baja' || (level === 'normal' && hrvLow);
    if (level === null) return { lead: 'Hoy toca descansar.', reason: targetText, tone: 'info' };
    if (low) return { lead: 'Hoy toca recuperar.', reason: sentence('Duerme y come bien, y nada de extras.', targetText), tone: 'bad' };
    return level === 'alta'
      ? { lead: 'Hoy toca descansar.', reason: sentence('Vas muy bien de recuperación.', targetText), tone: 'good' }
      : { lead: 'Hoy toca descansar.', reason: sentence('Vas normal de recuperación: descansa tranquilo.', targetText), tone: 'mid' };
  }

  const near = comp?.phase === 'taper' ? `A ${comp.daysToEvent} días de competir` : null;

  if (light?.color === 'rojo') {
    return { lead: 'Hoy toca recuperar, no entrenar.', reason: `${withStop(light.reasons.join(', '))} El coach ha dejado una sesión de recuperación activa.`, tone: 'bad' };
  }
  if (light?.color === 'ambar') {
    return { lead: 'Baja el ritmo hoy.', reason: `${withStop(light.reasons.join(', '))} El coach ya ha recortado la sesión.`, tone: 'mid' };
  }
  if (painAreas.length > 0) {
    const where = joinAnd(painAreas.map((a) => PAIN_LABEL[a] ?? a));
    return { lead: `Entrena, cuidando ${where}.`, reason: sentence('El coach evita los movimientos que la cargan.', fitText), tone: 'mid' };
  }
  if (comp?.phase === 'taper') {
    return { lead: 'Entrena, pero sin pasarte.', reason: sentence(`${near}, el volumen ya baja: mantén la intensidad y no añadas nada.`, fitText), tone: 'good' };
  }
  if (light?.color === 'verde') {
    const push = !comp && session.mesocycleWeek !== 4;
    const why = withStop(`Preparación ${prep ?? '—'} %${loadZone === 'optima' || loadZone === 'baja' ? ` y carga ${LOAD_WORD[loadZone]}` : ''}`);
    return { lead: push ? 'Buen día para apretar.' : 'Llegas bien: a por la sesión.', reason: sentence(why, fitText), tone: 'good' };
  }

  // Sin semáforo (aún sin check-in): solo hay carga y una preparación estimada.
  const careful = loadZone === 'alta' || (prep !== null && prep <= 40);
  const cause = [
    prep !== null && `preparación ${prep} %`,
    loadZone === 'alta' && 'carga muy alta',
  ].filter(Boolean) as string[];
  const provisional = !hasCheckIn && 'Aún sin check-in: esto sale solo de tu carga.';
  if (careful) {
    const cap = cause.length ? withStop(cause.join(' y ').replace(/^./, (c) => c.toUpperCase())) : '';
    return { lead: 'Hoy, mejor con cuidado.', reason: sentence(cap, provisional, fitText), tone: 'mid' };
  }
  const reason = sentence(provisional, fitText) || (prep !== null ? `Preparación ${prep} %.` : '');
  return { lead: 'Entrena como está previsto.', reason, tone: hasCheckIn ? 'good' : 'info' };
}
