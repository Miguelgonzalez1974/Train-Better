import type { AthleteProfile, PainArea, PainFlag } from '../../data/athlete/types';
import { RETURN_GAP_MIN_DAYS } from '../../engine/intensityRamp';
import { PAIN_AREA_AVOID_TEXT, PAIN_AREA_LABEL, getActivePainFlags, prunePainFlags, resolvePainFlagUntil, type PainDuration } from '../../engine/painFlags';
import { withRestMarked } from '../../engine/restDays';
import { shortDate } from '../objetivos/openItems';
import { addDaysIso } from '../objetivos/rexFlow';

/**
 * Rex para los imprevistos: "me duele algo", "hoy no estoy para el plan", "voy a faltar unos días". Cada respuesta se traduce a algo
 * que la app ya sabe hacer (un aviso de molestia, un día de descanso, cambiar la sesión de hoy). Primero se enseña qué haría
 * (`summarize`) y solo se aplica si el atleta dice que sí (`applySupport`). Todo es puro: la pantalla solo lo pinta y lo guarda.
 */

export type SupportKind = 'pain' | 'today' | 'away';
export type TodayChoice = 'rest' | 'recovery' | 'free';
export type AwayReason = 'enfermo' | 'viaje' | 'trabajo';

export interface SupportState {
  kind?: SupportKind;
  area?: PainArea;
  duration?: PainDuration;
  what?: TodayChoice;
  why?: AwayReason;
  days?: number;
}

export interface SupportCtx {
  profile: AthleteProfile;
  todayIso: string;
  /** La sesión de hoy ya está hecha: no se puede cambiar por otra y los días fuera empiezan mañana. */
  todayDone: boolean;
  newId?: () => string;
}

export interface SupportOption {
  label: string;
  set?: Partial<SupportState>;
  /** Siguiente pregunta; `summary` = enseñar qué haría. */
  next: string;
}

export interface SupportNode {
  text: string;
  options: SupportOption[];
}

export interface SupportSummary {
  title: string;
  sub: string;
  fx: string[];
  /** Lo que dice Rex tras aplicarlo. */
  done: string;
}

export interface SupportEffect {
  profile: AthleteProfile;
  /** Cambiar la sesión de hoy por otra (recuperación o WOD libre). */
  swap?: 'recovery' | 'random';
  /** La sesión de hoy debe recalcularse con el perfil nuevo (un aviso de molestia cambia lo que se puede hacer). */
  regenerate: boolean;
}

const ZONES: PainArea[] = ['hombro', 'cadera-lumbar', 'rodilla', 'codo-muneca'];

const DURATION_LABEL: Record<PainDuration, string> = { dias: 'Unos días', semanas: 'Un par de semanas', indefinido: 'No lo sé: lo quito yo' };

const AWAY_DAYS = [1, 2, 3, 7, RETURN_GAP_MIN_DAYS];
const awayLabel = (n: number) => (n === 1 ? '1 día' : n === 7 ? 'Una semana' : n === RETURN_GAP_MIN_DAYS ? `${n} días o más` : `${n} días`);

export function getSupportNode(id: string, ctx: SupportCtx): SupportNode {
  switch (id) {
    case 'p_zone':
      return { text: 'Vaya. ¿Dónde te duele?', options: ZONES.map((area) => ({ label: PAIN_AREA_LABEL[area], set: { kind: 'pain' as const, area }, next: 'p_dur' })) };
    case 'p_dur':
      return {
        text: '¿Cuánto crees que durará?',
        options: (['dias', 'semanas', 'indefinido'] as PainDuration[]).map((duration) => ({ label: DURATION_LABEL[duration], set: { duration }, next: 'summary' })),
      };
    case 't_what':
      return {
        text: 'Vale, hoy no. ¿Qué prefieres?',
        options: [
          { label: 'Descansar hoy', set: { kind: 'today' as const, what: 'rest' as const }, next: 'summary' },
          { label: 'Algo suave: recuperación', set: { kind: 'today' as const, what: 'recovery' as const }, next: 'summary' },
          { label: 'Un WOD libre, sin cargas de PR', set: { kind: 'today' as const, what: 'free' as const }, next: 'summary' },
        ],
      };
    case 'a_why':
      return {
        text: '¿Qué pasa?',
        options: [
          { label: 'Estoy enfermo', set: { kind: 'away' as const, why: 'enfermo' as const }, next: 'a_days' },
          { label: 'Viajo', set: { kind: 'away' as const, why: 'viaje' as const }, next: 'a_days' },
          { label: 'Trabajo o familia', set: { kind: 'away' as const, why: 'trabajo' as const }, next: 'a_days' },
        ],
      };
    case 'a_days':
      return {
        text: ctx.todayDone ? 'Hoy ya has entrenado. ¿Cuántos días vas a faltar, desde mañana?' : '¿Cuántos días vas a faltar, contando hoy?',
        options: AWAY_DAYS.map((days) => ({ label: awayLabel(days), set: { days }, next: 'summary' })),
      };
    default: {
      const options: SupportOption[] = [{ label: 'Me duele algo', next: 'p_zone' }];
      if (!ctx.todayDone) options.push({ label: 'Hoy no estoy para el plan', next: 't_what' });
      options.push({ label: 'Voy a faltar unos días', next: 'a_why' });
      return { text: 'Cuéntame qué ha pasado y lo ajusto. Primero te enseño qué haría, y solo lo aplico si me dices que sí.', options };
    }
  }
}

/** Los días que se marcan como descanso al faltar: desde hoy, o desde mañana si hoy ya está entrenado. */
export function awayDates(s: SupportState, ctx: SupportCtx): string[] {
  const start = ctx.todayDone ? 1 : 0;
  return Array.from({ length: s.days ?? 1 }, (_, i) => addDaysIso(ctx.todayIso, start + i));
}

function painUntil(s: SupportState, ctx: SupportCtx): string | null {
  return resolvePainFlagUntil(ctx.todayIso, s.duration ?? 'indefinido');
}

export function summarize(s: SupportState, ctx: SupportCtx): SupportSummary {
  if (s.kind === 'pain' && s.area) {
    const label = PAIN_AREA_LABEL[s.area];
    const avoid = PAIN_AREA_AVOID_TEXT[s.area];
    const until = painUntil(s, ctx);
    const replaced = getActivePainFlags(ctx.profile.painFlags, ctx.todayIso).some((f) => f.area === s.area);
    const days = s.duration === 'dias' ? 'unos 5 días' : s.duration === 'semanas' ? 'unos 12 días' : 'hasta que lo quites tú';
    return {
      title: `Aviso de molestia · ${label}`,
      sub: `${until ? `hasta el ${shortDate(until)}` : 'hasta que lo quites'} (${days})`,
      fx: [
        ...(replaced ? [`Sustituye al aviso de ${label.toLowerCase()} que ya tenías.`] : []),
        'Pongo el aviso y la sesión de hoy se rehace sin esos movimientos.',
        `Evito: ${avoid}.`,
        'Se nota en Planificación y lo puedes quitar cuando quieras.',
        'Mañana te pregunto cómo sigue; si va mejor, vuelves a la carga poco a poco.',
      ],
      done: `Aviso puesto. Hoy te preparo la sesión sin ${avoid}. Mañana te pregunto cómo sigue.`,
    };
  }
  if (s.kind === 'today') {
    if (s.what === 'recovery') {
      return {
        title: 'Hoy, recuperación activa',
        sub: 'en vez de la sesión programada',
        fx: ['Cambio la sesión de hoy por movilidad y cardio suave.', 'Tus cargas y el resto de la semana no cambian.', 'Si mañana vas mejor, sigues con lo programado.'],
        done: 'Hecho. Hoy toca algo suave y mañana seguimos con el plan.',
      };
    }
    if (s.what === 'free') {
      return {
        title: 'Hoy, un WOD libre',
        sub: 'en vez de la sesión programada',
        fx: ['Cambio la sesión de hoy por un WOD variado, sin cargas de PR.', 'Tus cargas y el resto de la semana no cambian.'],
        done: 'Hecho. Hoy un WOD variado y sin PRs.',
      };
    }
    return {
      title: 'Hoy, descanso',
      sub: shortDate(ctx.todayIso),
      fx: ['Hoy cuenta como descanso: no baja tu cumplimiento.', 'No muevo ningún otro día de la semana.', 'Tu macrociclo sigue su calendario.'],
      done: 'Hoy descansas. Sin culpa: no cuenta como fallo.',
    };
  }
  const days = awayDates(s, ctx);
  const n = days.length;
  const range = n === 1 ? shortDate(days[0]) : `del ${shortDate(days[0])} al ${shortDate(days[n - 1])}`;
  const reason = { enfermo: 'por enfermedad', viaje: 'por un viaje', trabajo: 'por trabajo o familia' }[s.why ?? 'trabajo'];
  const fx = [`Marco ${n === 1 ? shortDate(days[0]) : `${n} días, ${range},`} como descanso: no cuentan como fallo.`, 'Tu macrociclo sigue su calendario: no se mueve.'];
  if (s.why === 'enfermo') fx.unshift('Descansa de verdad; no hace falta que compenses nada.');
  if (n >= RETURN_GAP_MIN_DAYS) fx.push(`Con ${RETURN_GAP_MIN_DAYS} días o más sin entrenar, al volver la app te propondrá una rampa de vuelta.`);
  return {
    title: `Descanso ${range}`,
    sub: `${reason} · ${n} ${n === 1 ? 'día' : 'días'}`,
    fx,
    done: s.why === 'enfermo' ? 'Apuntado. Mejórate, y cuando vuelvas, vuelves con calma.' : 'Apuntado. Que vaya bien, y a la vuelta seguimos.',
  };
}

/** Aplica lo que Rex enseñó. No toca el perfil recibido: devuelve uno nuevo. */
export function applySupport(s: SupportState, ctx: SupportCtx): SupportEffect {
  const { profile, todayIso } = ctx;
  if (s.kind === 'pain' && s.area) {
    const area = s.area;
    const flag: PainFlag = {
      id: (ctx.newId ?? (() => crypto.randomUUID()))(),
      area,
      createdDate: todayIso,
      until: painUntil(s, ctx),
    };
    // Un aviso de la misma zona que siga activo se sustituye por el nuevo; el resto se queda como estaba.
    const kept = prunePainFlags(profile.painFlags, todayIso).filter((f) => !(f.area === area && getActivePainFlags([f], todayIso).length > 0));
    return { profile: { ...profile, painFlags: [...kept, flag] }, regenerate: true };
  }
  if (s.kind === 'today' && s.what === 'recovery') return { profile, swap: 'recovery', regenerate: false };
  if (s.kind === 'today' && s.what === 'free') return { profile, swap: 'random', regenerate: false };
  if (s.kind === 'today') return { profile: withRestMarked(profile, todayIso), regenerate: false };
  const marked = awayDates(s, ctx).reduce((p, iso) => withRestMarked(p, iso), profile);
  return { profile: marked, regenerate: false };
}

/** ¿Hay algo que aplicar? (para no ofrecer "Hacerlo" en un estado incompleto). */
export function isComplete(s: SupportState): boolean {
  if (s.kind === 'pain') return Boolean(s.area && s.duration);
  if (s.kind === 'today') return Boolean(s.what);
  if (s.kind === 'away') return Boolean(s.why && s.days);
  return false;
}
