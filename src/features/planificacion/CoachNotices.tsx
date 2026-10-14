import { Brain, Gauge, Lightbulb, Map, Target } from 'lucide-react';
import type { PainFlag } from '../../data/athlete/types';
import type { RetestHeadsUp } from '../../engine/generateSession';
import type { ReturnRampSuggestion } from '../../engine/intensityRamp';
import type { MacroReviewSuggestion } from '../../engine/macroReview';
import type { NextMacroSuggestion } from '../../engine/nextMacroSuggestion';
import { PAIN_AREA_LABEL } from '../../engine/painFlags';

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
}

function formatPainUntil(until: string | null): string {
  if (!until) return 'hasta que lo quites';
  return `hasta el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${until}T00:00:00`))}`;
}

export interface CoachNoticesProps {
  activePainFlags: PainFlag[];
  onRemovePainFlag: (id: string) => void;
  rampStatus: string | null;
  returnRampSuggestion: ReturnRampSuggestion | null;
  showReturnRampSuggestion: boolean;
  onActivateReturnRamp: () => void;
  onDismissReturnRamp: () => void;
  macroReviewSuggestion: MacroReviewSuggestion | null;
  onConfirmMacroReview: () => void;
  onDismissMacroReview: () => void;
  nextMacroSuggestion: NextMacroSuggestion | null;
  onNavigateToObjetivos: () => void;
  /** Aviso anticipado de que el proximo dia de benchmark toca retest (ver peekRetestHeadsUp). */
  retestHeadsUp: RetestHeadsUp | null;
}

/**
 * Cuántos avisos hay y si alguno pide una decisión tuya. La molestia activa NO cuenta para el punto: ya se ve en una
 * chip bajo el título del día, y no hace falta que además encienda el icono.
 */
export function summarizeNotices(p: CoachNoticesProps): { count: number; actionable: boolean } {
  const actionable =
    Boolean(p.showReturnRampSuggestion && p.returnRampSuggestion) ||
    Boolean(p.macroReviewSuggestion) ||
    Boolean(p.nextMacroSuggestion) ||
    Boolean(p.retestHeadsUp);
  const count =
    p.activePainFlags.length +
    (p.rampStatus ? 1 : 0) +
    (p.showReturnRampSuggestion && p.returnRampSuggestion ? 1 : 0) +
    (p.macroReviewSuggestion ? 1 : 0) +
    (p.nextMacroSuggestion ? 1 : 0) +
    (p.retestHeadsUp ? 1 : 0);
  return { count, actionable };
}

/**
 * El icono de los avisos, en la fila de arriba junto al perfil — siempre visible. El punto solo se enciende (naranja)
 * si hay algo que decidir; con avisos meramente informativos el icono se ve normal y sin punto, y sin ningún aviso
 * queda atenuado (la hoja dice que no hay nada).
 */
export function CoachNoticesButton({ count, actionable, onClick }: { count: number; actionable: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Avisos del coach"
      aria-label={actionable ? 'Avisos del coach — hay algo que decidir' : 'Avisos del coach'}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-brand-border transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold ${
        count === 0 ? 'text-neutral-600' : 'text-neutral-300'
      }`}
    >
      <Brain size={16} strokeWidth={2.25} />
      {actionable && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-orange ring-2 ring-brand-bg" />}
    </button>
  );
}

const rowClass = 'flex items-start gap-2.5 border-l-2 py-1.5 pl-3 text-sm';

/** El contenido de la hoja de avisos: lo que el coach quiere decirte, cada uno con su color en el borde izquierdo. */
export function CoachNoticesBody(props: CoachNoticesProps) {
  const {
    activePainFlags,
    onRemovePainFlag,
    rampStatus,
    returnRampSuggestion,
    showReturnRampSuggestion,
    onActivateReturnRamp,
    onDismissReturnRamp,
    macroReviewSuggestion,
    onConfirmMacroReview,
    onDismissMacroReview,
    nextMacroSuggestion,
    onNavigateToObjetivos,
    retestHeadsUp,
  } = props;
  if (summarizeNotices(props).count === 0) {
    return <p className="text-sm text-neutral-400">Sin avisos por ahora. Si el coach tiene algo que decirte, aparecerá aquí.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {activePainFlags.map((flag) => (
        <div key={flag.id} className={`${rowClass} border-red-400 items-center`}>
          <span className="flex-1 text-red-300">
            Evitando {PAIN_AREA_LABEL[flag.area].toLowerCase()} — {formatPainUntil(flag.until)}
          </span>
          <button
            onClick={() => onRemovePainFlag(flag.id)}
            className="shrink-0 text-xs text-neutral-400 underline decoration-dotted transition-colors duration-200 hover:text-red-300"
          >
            Quitar
          </button>
        </div>
      ))}

      {rampStatus && (
        <div className={`${rowClass} border-brand-neon items-center text-brand-neon`}>
          <Gauge size={14} strokeWidth={2.25} className="shrink-0" />
          <span className="flex-1">{rampStatus}</span>
        </div>
      )}

      {showReturnRampSuggestion && returnRampSuggestion && (
        <div className={`${rowClass} border-brand-gold`}>
          <Gauge size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
          <div className="flex-1">
            <p className="text-neutral-200">
              Llevas <span className="font-semibold text-brand-gold">{returnRampSuggestion.gapDays} días</span> sin entrenar —
              ¿activamos una rampa de vuelta para no arrancar al 100%?
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Fuerza/oly {returnRampSuggestion.ramp.strengthWeeks} semanas, WOD {returnRampSuggestion.ramp.wodWeeks} — la carga
              sube gradual en vez de empezar de golpe donde lo dejaste.
            </p>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={onActivateReturnRamp}
                className="rounded-md bg-brand-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-gold-soft"
              >
                Activar rampa
              </button>
              <button
                onClick={onDismissReturnRamp}
                className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
              >
                No, gracias
              </button>
            </div>
          </div>
        </div>
      )}

      {macroReviewSuggestion && (
        <div className={`${rowClass} ${macroReviewSuggestion.kind === 'extend-phase' ? 'border-brand-orange' : 'border-brand-gold'}`}>
          <Map
            size={14}
            strokeWidth={2.25}
            className={`mt-0.5 shrink-0 ${macroReviewSuggestion.kind === 'extend-phase' ? 'text-brand-orange' : 'text-brand-gold'}`}
          />
          <div className="flex-1">
            <p className="text-neutral-200">{macroReviewSuggestion.headline}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{macroReviewSuggestion.detail}</p>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={onConfirmMacroReview}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 ${
                  macroReviewSuggestion.kind === 'extend-phase'
                    ? 'bg-brand-orange hover:bg-brand-orange-dark'
                    : 'bg-brand-gold hover:bg-brand-gold-soft'
                }`}
              >
                {macroReviewSuggestion.kind === 'extend-phase' ? 'Alargar fase' : 'Subir a intensivo'}
              </button>
              <button
                onClick={onDismissMacroReview}
                className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {nextMacroSuggestion && (
        <div className={`${rowClass} border-brand-neon`}>
          <Map size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-neon" />
          <div className="flex-1">
            <p className="text-neutral-200">
              <span className="font-semibold text-brand-neon">{nextMacroSuggestion.endingStructure.label}</span> termina en{' '}
              {nextMacroSuggestion.daysRemaining === 0 ? 'hoy' : `${nextMacroSuggestion.daysRemaining} días`} —{' '}
              {nextMacroSuggestion.suggestsSeason
                ? 'planifica la temporada completa en Objetivos.'
                : 'hay un borrador del siguiente bloque esperando en Objetivos.'}
            </p>
            <button
              onClick={onNavigateToObjetivos}
              className="mt-1.5 rounded-md bg-brand-neon px-2.5 py-1 text-xs font-semibold text-brand-bg transition-colors duration-200 hover:bg-brand-neon-soft"
            >
              Planificar
            </button>
          </div>
        </div>
      )}

      {retestHeadsUp && (
        <div className={`${rowClass} border-sky-400`}>
          <Target size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-sky-400" />
          <p className="flex-1 text-neutral-200">
            Tu próximo día de benchmark toca <span className="font-semibold text-sky-300">retest de {retestHeadsUp.name}</span> — tu
            marca del {formatShortDate(retestHeadsUp.prevDate)} fue {retestHeadsUp.prevValue}.{' '}
            {retestHeadsUp.lowerIsBetter ? 'A bajar ese tiempo.' : 'A superar esa marca.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** "Por qué tu sesión es así hoy": lo que se abre con la "i" junto al título del día. */
export function CoachReasonsList({ reasons }: { reasons: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {reasons.map((reason, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-300">
          <Lightbulb size={13} strokeWidth={2.25} className="mt-1 shrink-0 text-neutral-600" aria-hidden />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

/** Chip de una línea bajo el título del día: la molestia activa es lo único que condiciona el entreno de hoy. */
export function PainChips({ flags, onRemove }: { flags: PainFlag[]; onRemove: (id: string) => void }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <span key={flag.id} className="inline-flex items-center gap-2 rounded-full bg-red-400/10 py-1 pl-3 pr-2 text-xs text-red-300">
          Evitando {PAIN_AREA_LABEL[flag.area].toLowerCase()} · {formatPainUntil(flag.until)}
          <button onClick={() => onRemove(flag.id)} className="rounded-full px-1.5 py-0.5 font-semibold text-red-200/80 transition-colors hover:bg-red-400/20 hover:text-red-100">
            Quitar
          </button>
        </span>
      ))}
    </div>
  );
}
