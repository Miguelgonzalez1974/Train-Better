import { useState } from 'react';
import { Brain, Pencil, TrendingUp } from 'lucide-react';
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
  /** Sensación ya elegida hoy para este levantamiento (pastilla o derivada del RPE registrado), o null. */
  currentFeel: SetFeel | null;
  /** Serie real ya registrada hoy para este levantamiento, si la hay. */
  logged: LoggedActual | null;
  /** La sesión ya está completada: solo calibra al coach, no reajusta series en caliente. */
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

const numInput =
  'w-full rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm font-semibold text-white transition-colors focus:border-brand-gold focus:outline-none';

const shell = 'rounded-xl border border-brand-border bg-brand-surfaceMuted/40 p-3.5';

function LoggedSummary({ logged, onEdit }: { logged: LoggedActual; onEdit: () => void }) {
  const delta = logged.estimated1rm && logged.assumedMax ? Math.round(logged.estimated1rm - logged.assumedMax) : null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-neon/[0.06] px-2.5 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-neutral-300">
        <TrendingUp size={12} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
        {logged.kg} kg × {logged.reps} @ RPE {logged.rpe}
        {logged.estimated1rm ? (
          <>
            {' '}→ 1RM est. <span className="font-bold text-white">{logged.estimated1rm} kg</span>
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? 'text-brand-neon' : 'text-brand-orange'}>
                {' '}({delta > 0 ? '+' : ''}
                {delta} vs. lo previsto)
              </span>
            )}
          </>
        ) : null}
      </span>
      <button
        onClick={onEdit}
        className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        <Pencil size={10} strokeWidth={2.5} />
        Editar
      </button>
    </div>
  );
}

/** Serie más pesada del día: kg · reps · RPE. Señal principal — de aquí sale el 1RM estimado y la sensación. */
function LogForm({
  prescribed,
  logged,
  onSubmit,
}: {
  prescribed: { kg: number; reps: number };
  logged: LoggedActual | null;
  onSubmit: (a: { kg: number; reps: number; rpe: number }) => void;
}) {
  const [kg, setKg] = useState(String(logged?.kg ?? prescribed.kg ?? ''));
  const [reps, setReps] = useState(String(logged?.reps ?? (prescribed.reps || '')));
  const [rpe, setRpe] = useState(String(logged?.rpe ?? ''));
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const k = Number(kg);
    const r = Number(reps);
    const p = Number(rpe);
    if (!(k > 0)) return setErr('Pon la carga.');
    if (!(r >= 1 && r <= 10)) return setErr('Reps 1–10.');
    if (!(p >= 5 && p <= 10)) return setErr('RPE 5–10.');
    setErr(null);
    onSubmit({ kg: k, reps: r, rpe: p });
  };

  return (
    <div>
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
      <button
        onClick={submit}
        className="mt-2 w-full rounded-lg bg-brand-orange py-1.5 text-xs font-bold text-black transition-colors duration-200 hover:bg-brand-orange-dark"
      >
        Guardar serie
      </button>
    </div>
  );
}

function AdjustChips({ adjustment, prescribedSets }: { adjustment: ReturnType<typeof adjustRemainingSets>; prescribedSets: number }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] font-bold text-white">
        {adjustment.fromSet === adjustment.adjustedSets
          ? `Serie ${adjustment.fromSet}`
          : `Series ${adjustment.fromSet}–${adjustment.adjustedSets}`}
      </span>
      <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] font-bold text-white">{adjustment.adjustedKg} kg</span>
      {adjustment.adjustedSets !== prescribedSets && (
        <span className="rounded-md bg-brand-orange/15 px-2 py-1 text-[11px] font-bold text-brand-orange">
          {adjustment.adjustedSets} series en total
        </span>
      )}
    </div>
  );
}

function NoteLine({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-start gap-1.5">
      <Brain size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
      <p className="text-xs text-neutral-400">{text}</p>
    </div>
  );
}

/**
 * Valoración de un levantamiento de fuerza u oly. La señal principal es CUÁNTO hiciste en la serie
 * más pesada (kg · reps · RPE) — de ahí sale el 1RM estimado que calibra la carga futura, y una
 * sensación derivada del RPE que, en curso, reajusta las series que quedan. Las pastillas de
 * sensación quedan como atajo para quien no quiere teclear. Tras completar la sesión solo se
 * registra (no hay series que reajustar). Ver `setFeedback.ts` / `responseProfile.ts`.
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
  const [editing, setEditing] = useState(false);

  const adjustment =
    currentFeel && !postCompletion
      ? adjustRemainingSets({ prescribedKg: prescribed.kg, prescribedSets: prescribed.sets, completedSets: 1, feel: currentFeel })
      : null;

  // 1 — Serie registrada: los números mandan sobre la pastilla.
  if (logged && !editing) {
    return (
      <div className={shell}>
        <p className="mb-2 text-xs text-neutral-400">{movementName} · serie registrada</p>
        <LoggedSummary logged={logged} onEdit={() => setEditing(true)} />
        {adjustment?.changed && <AdjustChips adjustment={adjustment} prescribedSets={prescribed.sets} />}
        {adjustment?.note && <NoteLine text={adjustment.note} />}
      </div>
    );
  }

  // 2 — Solo pastilla, sin números.
  if (currentFeel && !editing) {
    return (
      <div className={shell}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-neutral-400">
            {movementName}: <span className={`font-semibold ${FEEL_ACCENT[currentFeel]}`}>{SET_FEEL_LABEL[currentFeel]}</span>
          </p>
          <button
            onClick={onReset}
            className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Pencil size={10} strokeWidth={2.5} />
            Cambiar
          </button>
        </div>
        {adjustment?.changed && <AdjustChips adjustment={adjustment} prescribedSets={prescribed.sets} />}
        {adjustment?.note && <NoteLine text={adjustment.note} />}
        <button
          onClick={() => setEditing(true)}
          className="mt-2.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:text-brand-gold"
        >
          o registra kg · reps · RPE →
        </button>
      </div>
    );
  }

  // 3 — Nada aún (o editando): el formulario de números es lo primero.
  return (
    <div className={shell}>
      <p className="mb-2.5 text-xs font-semibold text-neutral-200">
        {postCompletion
          ? `Registra tu serie más pesada de ${movementName}`
          : `¿Qué hiciste en tu serie más pesada de ${movementName}?`}
      </p>
      <LogForm
        prescribed={prescribed}
        logged={logged}
        onSubmit={(a) => {
          onLogActual(a);
          setEditing(false);
        }}
      />
      {!postCompletion && (
        <div className="mt-3 border-t border-white/5 pt-2.5">
          <p className="mb-1.5 text-[10px] text-neutral-600">o solo dime cómo fue:</p>
          <div className="flex flex-wrap gap-1.5">
            {SET_FEEL_ORDER.map((feel) => (
              <button
                key={feel}
                onClick={() => {
                  onPick(feel);
                  setEditing(false);
                }}
                className={`rounded-lg border border-brand-border bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold ${FEEL_ACCENT[feel]} transition-colors duration-200 hover:border-brand-gold hover:bg-white/[0.06]`}
              >
                {SET_FEEL_LABEL[feel]}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2.5 text-[10px] text-neutral-600">
        {postCompletion
          ? 'Calibra la carga futura de este levantamiento.'
          : 'Calibra el coach y ajusta las series que te quedan.'}
      </p>
    </div>
  );
}
