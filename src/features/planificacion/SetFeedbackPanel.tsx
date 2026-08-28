import { Activity, Brain, Pencil } from 'lucide-react';
import type { SetFeel } from '../../data/athlete/types';
import { adjustRemainingSets, SET_FEEL_LABEL, SET_FEEL_ORDER } from '../../engine/setFeedback';

interface SetFeedbackPanelProps {
  movementName: string;
  prescribed: { kg: number; sets: number; reps: number };
  /** Sensación ya elegida hoy para este levantamiento, o null si aún no se ha valorado. */
  currentFeel: SetFeel | null;
  onPick: (feel: SetFeel) => void;
  onReset: () => void;
}

const FEEL_ACCENT: Record<SetFeel, string> = {
  sobro: 'text-brand-neon',
  justo: 'text-neutral-300',
  duro: 'text-brand-gold',
  'muy-duro': 'text-brand-orange',
};

const PILL_HINT: Record<SetFeel, string> = {
  sobro: 'la barra volaba',
  justo: 'al límite justo del plan',
  duro: 'salió, pero costó',
  'muy-duro': 'a tope, casi fallo',
};

/**
 * Feedback en caliente tras la primera serie de trabajo de un levantamiento de fuerza u oly: el
 * atleta toca cómo fue —en el descanso que ya hace igual— y el coach recalcula peso y número de
 * las series que quedan del MISMO ejercicio. No para la sesión, no toca el WOD ni el resto de
 * bloques, y es opcional. Ver `src/engine/setFeedback.ts` para la lógica del ajuste.
 */
export function SetFeedbackPanel({ movementName, prescribed, currentFeel, onPick, onReset }: SetFeedbackPanelProps) {
  if (currentFeel === null) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/40 p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Activity size={13} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
          <p className="text-xs font-semibold text-neutral-200">
            ¿Cómo fue la primera serie de {movementName}?
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SET_FEEL_ORDER.map((feel) => (
            <button
              key={feel}
              onClick={() => onPick(feel)}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2 text-left transition-colors duration-200 hover:border-brand-gold hover:bg-white/[0.06]"
            >
              <span className={`text-sm font-semibold ${FEEL_ACCENT[feel]}`}>{SET_FEEL_LABEL[feel]}</span>
              <span className="text-[10px] text-neutral-500">{PILL_HINT[feel]}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-neutral-600">
          Opcional. Ajusta solo las series que te quedan de {movementName} — no el WOD ni el resto.
        </p>
      </div>
    );
  }

  const adjustment = adjustRemainingSets({
    prescribedKg: prescribed.kg,
    prescribedSets: prescribed.sets,
    completedSets: 1,
    feel: currentFeel,
  });

  return (
    <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/40 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-400">
          {movementName} · 1ª serie:{' '}
          <span className={`font-semibold ${FEEL_ACCENT[currentFeel]}`}>{SET_FEEL_LABEL[currentFeel]}</span>
        </p>
        <button
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
        >
          <Pencil size={10} strokeWidth={2.5} />
          Cambiar
        </button>
      </div>

      {adjustment.changed && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] font-bold text-white">
            {adjustment.fromSet === adjustment.adjustedSets
              ? `Serie ${adjustment.fromSet}`
              : `Series ${adjustment.fromSet}–${adjustment.adjustedSets}`}
          </span>
          <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] font-bold text-white">{adjustment.adjustedKg} kg</span>
          {adjustment.adjustedSets !== prescribed.sets && (
            <span className="rounded-md bg-brand-orange/15 px-2 py-1 text-[11px] font-bold text-brand-orange">
              {adjustment.adjustedSets} series en total
            </span>
          )}
        </div>
      )}

      {adjustment.note && (
        <div className="mt-2 flex items-start gap-1.5">
          <Brain size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
          <p className="text-xs text-neutral-400">{adjustment.note}</p>
        </div>
      )}
    </div>
  );
}
