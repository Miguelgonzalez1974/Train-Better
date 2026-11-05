import type { RexAction, RexSuggestion } from '../dashboard/rexDashboard';

/**
 * Rex en Planificación: la frase que resume el estado del día (semáforo, esfuerzo previsto frente al objetivo, dureza, competición,
 * molestias y lo que prioriza el perfil) y el aviso de que el coach tiene algo que contarte. Antes eran una fila de casillas, una línea
 * del perfil y una campana; ahora es una voz con tres atajos y el detalle completo detrás de «Por qué». Puro: lo pinta `RexBar`.
 */

export interface PlanRexContext {
  /** Hay sesión de entreno hoy (no es descanso, no está hecha y no se está editando). */
  hasTrainingSession: boolean;
  /** Semáforo del día (verde/ámbar/rojo) y su nombre corto ("Día verde"); null si aún no hay check-in. */
  light: { color: 'verde' | 'ambar' | 'rojo'; name: string } | null;
  /** Esfuerzo previsto de la sesión (0-100), o null si no se puede estimar. */
  planned: number | null;
  fit: { kind: 'dentro' | 'se-pasa' | 'se-queda-corta'; diff: number } | null;
  target: { low: number; high: number } | null;
  /** Subida de dureza aplicada (0 = ninguna). */
  hardness: number;
  canHarder: boolean;
  /** Días para competir y fase, si hay una competición cerca. */
  competition: { daysToEvent: number; phase: string } | null;
  /** Zonas con aviso de molestia activo ("Rodilla"). */
  painLabels: string[];
  /** Lo que el diagnóstico del atleta inclina estas semanas ("más motor largo"), si hay. */
  emphasis: string | null;
  /** Avisos del coach que no son una molestia, y si alguno pide una decisión. */
  notices: { count: number; actionable: boolean };
}

const LIGHT_TONE = { verde: 'good', ambar: 'mid', rojo: 'bad' } as const;
const EMPHASIS_MAX = 90;

function stop(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** La frase del estado del día: el semáforo como verbo en color y, detrás, lo que lo explica. */
export function planStateSuggestion(ctx: PlanRexContext): RexSuggestion | null {
  if (!ctx.hasTrainingSession) return null;
  const parts: string[] = [];
  const range = ctx.target ? `${ctx.target.low}–${ctx.target.high}` : null;
  if (ctx.planned !== null) {
    const p = `Esfuerzo previsto ~${Math.round(ctx.planned)}`;
    if (ctx.fit && range) {
      parts.push(
        ctx.fit.kind === 'dentro'
          ? `${p}, dentro de tu objetivo (${range}).`
          : ctx.fit.kind === 'se-pasa'
            ? `${p}: se pasa ${ctx.fit.diff} de tu objetivo (${range}).`
            : `${p}: te deja margen sobre tu objetivo (${range}).`,
      );
    } else parts.push(`${p}.`);
  }
  if (ctx.hardness > 0) parts.push(`Más dura +${ctx.hardness}.`);
  if (ctx.competition) parts.push(`A ${ctx.competition.daysToEvent} ${ctx.competition.daysToEvent === 1 ? 'día' : 'días'} de competir (${ctx.competition.phase}).`);
  if (ctx.painLabels.length > 0) parts.push(`Cuidando ${ctx.painLabels.map((l) => l.toLowerCase()).join(' y ')}.`);
  if (ctx.emphasis && ctx.emphasis.length <= EMPHASIS_MAX) parts.push(stop(ctx.emphasis));

  const lead = ctx.light ? `${ctx.light.name}.` : 'Sesión de hoy.';
  const tone = ctx.light ? LIGHT_TONE[ctx.light.color] : 'info';
  const actions: RexAction[] = [{ label: 'Por qué', target: 'plan-detalle' }];
  if (ctx.canHarder) actions.push({ label: ctx.hardness > 0 ? 'Cambiar la dureza' : 'Más dura', target: 'plan-dureza' });
  actions.push({ label: ctx.painLabels.length > 0 ? 'Molestias' : 'Me duele algo', target: 'plan-molestia' });
  return {
    id: 'plan-estado',
    priority: 95,
    lead,
    tone,
    text: [lead, ...parts].join(' '),
    mood: tone === 'good' ? 'happy' : tone === 'info' ? 'idle' : 'think',
    actions,
    dismissible: false,
  };
}

/** Rex avisa de que el coach tiene algo para ti (una propuesta que decidir o una nota); la molestia ya se dice en la frase del estado. */
export function planNoticesSuggestion(notices: PlanRexContext['notices']): RexSuggestion | null {
  if (notices.count <= 0) return null;
  const text = notices.actionable
    ? notices.count === 1
      ? 'El coach tiene una propuesta para ti y quiere que la decidas.'
      : `El coach tiene ${notices.count} avisos para ti y alguno pide que decidas.`
    : notices.count === 1
      ? 'Tengo un aviso del coach para ti.'
      : `Tengo ${notices.count} avisos del coach para ti.`;
  return {
    id: 'plan-avisos',
    priority: 90,
    text,
    mood: 'think',
    actions: [{ label: notices.count === 1 ? 'Verlo' : 'Verlos', target: 'plan-avisos' }],
  };
}

/** Todo lo que Rex tiene que decir en Planificación, de más a menos importante. Vacío = la barra no se enseña. */
export function buildPlanRexSuggestions(ctx: PlanRexContext): RexSuggestion[] {
  return [planStateSuggestion(ctx), planNoticesSuggestion(ctx.notices)].filter((s): s is RexSuggestion => s !== null).sort((a, b) => b.priority - a.priority);
}
