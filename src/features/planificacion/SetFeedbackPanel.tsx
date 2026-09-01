import { useState } from 'react';
import { Activity, Brain, Pencil, TrendingUp } from 'lucide-react';
import type { SetFeel } from '../../data/athlete/types';
import { adjustRemainingSets, SET_FEEL_LABEL, SET_FEEL_ORDER } from '../../engine/setFeedback';

export interface LoggedActual {
  kg: number;
  reps: number;
  rpe: number;
  estimated1rm?: number;
  assumedMax?: number;
}

interface SetFeedbackPanelProps {
  movementName: string;
  prescribed: { kg: number; sets: number; reps: number };
  /** Sensación ya elegida hoy para este levantamiento, o null si aún no se ha valorado. */
  currentFeel: SetFeel | null;
  /** Serie real ya registrada hoy para este levantamiento, si la hay. */
  logged: LoggedActual | null;
  /** La sesión de hoy ya está marcada como completada: la valoración sigue disponible (calibra al
   *  coach), pero ya no reajusta series en caliente. */
  postCompletion?: boolean;
  onPick: (feel: SetFeel) => void;
  onLogActual: (actual: { kg: number; reps: number; rpe: number }) => void;
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

const numInput =
  'w-full rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm font-semibold text-white transition-colors focus:border-brand-gold focus:outline-none';

/** Formulario compacto "hice X kg × Y @ RPE Z" — señal cuantitativa que calibra la carga futura del lift. */
function LogActualForm({
  prescribed,
  logged,
  onLogActual,
}: {
  prescribed: { kg: number; reps: number };
  logged: LoggedActual | null;
  onLogActual: (a: { kg: number; reps: number; rpe: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kg, setKg] = useState(String(logged?.kg ?? prescribed.kg ?? ''));
  const [reps, setReps] = useState(String(logged?.reps ?? (prescribed.reps || '')));
  const [rpe, setRpe] = useState(String(logged?.rpe ?? ''));
  const [err, setErr] = useState<string | null>(null);

  if (logged && !open) {
    const delta = logged.estimated1rm && logged.assumedMax ? Math.round(logged.estimated1rm - logged.assumedMax) : null;
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-brand-neon/[0.06] px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
          <span className="text-[11px] text-neutral-300">
            {logged.kg} kg × {logged.reps} @ RPE {logged.rpe}
            {logged.estimated1rm ? (
              <>
                {' '}
                → 1RM est. <span className="font-bold text-white">{logged.estimated1rm} kg</span>
                {delta != null && delta !== 0 && (
                  <span className={delta > 0 ? ' text-brand-neon' : ' text-brand-orange'}>
                    {' '}
                    ({delta > 0 ? '+' : ''}
                    {delta} vs. lo previsto)
                  </span>
                )}
              </>
            ) : null}
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
        >
          <Pencil size={10} strokeWidth={2.5} />
          Editar
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-brand-border py-1.5 text-[11px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        + Registrar kg · reps · RPE reales
      </button>
    );
  }

  const submit = () => {
    const k = Number(kg);
    const r = Number(reps);
    const p = Number(rpe);
    if (!(k > 0)) return setErr('Pon la carga real.');
    if (!(r >= 1 && r <= 10)) return setErr('Reps entre 1 y 10.');
    if (!(p >= 5 && p <= 10)) return setErr('RPE entre 5 y 10.');
    setErr(null);
    onLogActual({ kg: k, reps: r, rpe: p });
    setOpen(false);
  };

  return (
    <div className="mt-2 rounded-lg border border-brand-border bg-white/[0.02] p-2.5">
      <p className="mb-2 text-[11px] font-semibold text-neutral-300">¿Qué hiciste en esa serie?</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-neutral-500">
          kg
          <input type="number" inputMode="decimal" step="2.5" value={kg} onChange={(e) => setKg(e.target.value)} className={numInput} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-neutral-500">
          reps
          <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} className={numInput} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-neutral-500">
          RPE
          <input type="number" inputMode="decimal" step="0.5" value={rpe} onChange={(e) => setRpe(e.target.value)} className={numInput} />
        </label>
      </div>
      {err && <p className="mt-1.5 text-[11px] text-brand-orange">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={submit}
          className="flex-1 rounded-lg bg-brand-orange py-1.5 text-xs font-bold text-black transition-colors duration-200 hover:bg-brand-orange-dark"
        >
          Guardar
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-600">
        El coach lo usa como 1RM estimado para calibrar la carga — más preciso que la sensación.
      </p>
    </div>
  );
}

/**
 * Feedback en caliente tras la primera serie de trabajo de un levantamiento de fuerza u oly: el
 * atleta toca cómo fue —en el descanso que ya hace igual— y el coach recalcula peso y número de
 * las series que quedan del MISMO ejercicio. Opcionalmente registra la carga/reps/RPE reales, que
 * el perfil de respuesta usa como e1RM medido para calibrar futuras prescripciones de ese lift.
 * Ver `src/engine/setFeedback.ts` (ajuste inmediato) y `responseProfile.ts` (calibración).
 */
export function SetFeedbackPanel({
  movementName,
  prescribed,
  currentFeel,
  logged,
  postCompletion = false,
  onPick,
  onLogActual,
  onReset,
}: SetFeedbackPanelProps) {
  if (currentFeel === null) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/40 p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Activity size={13} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
          <p className="text-xs font-semibold text-neutral-200">
            {postCompletion ? `Valora ${movementName}` : `¿Cómo fue la primera serie de ${movementName}?`}
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
        <LogActualForm prescribed={prescribed} logged={logged} onLogActual={onLogActual} />
        <p className="mt-2 text-[10px] text-neutral-600">
          {postCompletion
            ? 'Calibra la carga futura de este levantamiento.'
            : `Opcional — ajusta las series que te quedan de ${movementName}.`}
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
          {movementName} · {postCompletion ? 'valoración' : '1ª serie'}:{' '}
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

      {!postCompletion && adjustment.changed && (
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

      {!postCompletion && adjustment.note && (
        <div className="mt-2 flex items-start gap-1.5">
          <Brain size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
          <p className="text-xs text-neutral-400">{adjustment.note}</p>
        </div>
      )}

      <LogActualForm prescribed={prescribed} logged={logged} onLogActual={onLogActual} />
    </div>
  );
}
