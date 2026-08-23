import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Gauge, Lightbulb, Map } from 'lucide-react';
import type { PainFlag } from '../../data/athlete/types';
import type { ReturnRampSuggestion } from '../../engine/intensityRamp';
import type { MacroReviewSuggestion } from '../../engine/macroReview';
import type { NextMacroSuggestion } from '../../engine/nextMacroSuggestion';
import { PAIN_AREA_LABEL } from '../../engine/painFlags';

function formatPainUntil(until: string | null): string {
  if (!until) return 'hasta que lo quites';
  return `hasta el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${until}T00:00:00`))}`;
}

interface CoachNoticesProps {
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
  /** Resumen "por que tu sesion es asi hoy" (DailySession.coachReasons) — mismos textos ya visibles dentro de cada bloque, aqui solo para verlos de un vistazo. */
  coachReasons: string[];
}

const rowClass = 'flex items-start gap-2.5 border-l-2 py-1.5 pl-3 text-sm';

/**
 * Un unico punto de entrada para todo lo que el coach quiere decirte antes de tu sesion de hoy —
 * antes cada senal (dolor, rampa, revision semanal, siguiente macro...) era su propia caja de
 * color apilada encima de la otra, lo que a partir de la 3a-4a funcion nueva empezaba a enterrar
 * "Sesion de hoy" bajo una pared de avisos. Ahora es una sola tarjeta colapsable — el color de
 * cada aviso se conserva en su borde izquierdo para que siga siendo identificable de un vistazo,
 * pero ya no compite por atencion con un fondo tintado propio cada uno.
 */
export function CoachNotices({
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
  coachReasons,
}: CoachNoticesProps) {
  const [collapsed, setCollapsed] = useState(false);

  const count =
    activePainFlags.length +
    (rampStatus ? 1 : 0) +
    (showReturnRampSuggestion && returnRampSuggestion ? 1 : 0) +
    (macroReviewSuggestion ? 1 : 0) +
    (nextMacroSuggestion ? 1 : 0);

  if (count === 0 && coachReasons.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <button onClick={() => setCollapsed((prev) => !prev)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <Brain size={15} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.6)]" />
        </span>
        <span className="flex flex-1 items-center gap-2 text-sm font-semibold text-white">
          Avisos del coach
          <span className="rounded-full bg-brand-neon/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-neon">
            {count + (coachReasons.length > 0 ? 1 : 0)}
          </span>
        </span>
        {collapsed ? (
          <ChevronDown size={16} strokeWidth={2.25} className="shrink-0 text-neutral-500" />
        ) : (
          <ChevronUp size={16} strokeWidth={2.25} className="shrink-0 text-neutral-500" />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2.5 border-t border-brand-border px-3.5 py-3">
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
                  <span className="font-semibold text-brand-neon">{nextMacroSuggestion.endingMacro.label}</span> termina en{' '}
                  {nextMacroSuggestion.daysRemaining === 0 ? 'hoy' : `${nextMacroSuggestion.daysRemaining} días`} — hay un borrador
                  del siguiente bloque esperando en Objetivos.
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

          {coachReasons.length > 0 && (
            <div className={count > 0 ? 'mt-1 border-t border-brand-border pt-2.5' : undefined}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <Lightbulb size={12} strokeWidth={2.5} />
                Por qué tu sesión es así hoy
              </p>
              <ul className="flex flex-col gap-1">
                {coachReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
