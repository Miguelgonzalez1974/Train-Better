import { useState } from 'react';
import { Brain, Pencil, TrendingUp } from 'lucide-react';
import { SET_FEEL_LABEL, RPE_CHECKIN_OPTIONS, feelFromRpe } from '../../engine/setFeedback';

interface RpeCheckInProps {
  movementName: string;
  /** Serie más pesada ya registrada hoy (workLog del modo enfocado) — de aquí sale el peso, no se teclea. */
  topSet: { kg: number; reps: number };
  loggedRpe: number | null;
  estimated1rm?: number;
  onRate: (rpe: number) => void;
  /** Misma letra (A, B, C...) que este levantamiento lleva en la tarjeta de fuerza/oly de arriba
   * (`complexLettersByIndex`) — para saber a qué movimiento pertenece sin tener que leer el nombre.
   * Ausente si ese día el bloque no se pintó con letras (un solo levantamiento sin superserie). */
  letter?: string;
}

/** Letra en un círculo — misma pinta que la de `ComplexCard`, para que se reconozcan de un vistazo. */
function LetterBadge({ letter }: { letter: string }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
      {letter}
    </span>
  );
}

const shell = 'rounded-xl border border-brand-border bg-brand-surfaceMuted/40 p-3.5';

/**
 * Calibra el coach para este levantamiento con un solo dato: el RPE de la serie más pesada que el
 * atleta ya registró en el modo enfocado. Sustituye a la antigua ficha de "¿qué hiciste en tu serie
 * más pesada?" (kg/reps/RPE a mano + pastillas de sensación + reajuste en caliente de las series
 * que quedan) — esos dos primeros ya no aportan nada: el peso y las reps ya están en `workLog`, y el
 * atleta ajusta las series que quedan a mano con los +/- del modo enfocado, no con una sugerencia
 * derivada de una sensación cualitativa. El RPE sigue alimentando `estimateE1RMFromRpe` y
 * `responseProfile` igual que antes.
 */
export function RpeCheckIn({ movementName, topSet, loggedRpe, estimated1rm, onRate, letter }: RpeCheckInProps) {
  const [editing, setEditing] = useState(false);

  if (loggedRpe != null && !editing) {
    return (
      <div className={shell}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-300">
            {letter && <LetterBadge letter={letter} />}
            <TrendingUp size={12} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
            <span className="font-semibold text-white">{movementName}</span>: {topSet.kg} kg × {topSet.reps} @ RPE {loggedRpe}
            {estimated1rm ? (
              <>
                {' '}→ 1RM est. <span className="font-bold text-white">{estimated1rm} kg</span>
              </>
            ) : null}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Pencil size={10} strokeWidth={2.5} />
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-200">
        {letter && <LetterBadge letter={letter} />}
        {movementName}: {topSet.kg} kg × {topSet.reps} — ¿a qué RPE?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {RPE_CHECKIN_OPTIONS.map((rpe) => (
          <button
            key={rpe}
            onClick={() => {
              onRate(rpe);
              setEditing(false);
            }}
            className="flex flex-col items-center rounded-lg border border-brand-border bg-white/[0.03] px-2.5 py-1.5 transition-colors duration-200 hover:border-brand-gold hover:bg-white/[0.06]"
          >
            <span className="text-sm font-bold text-white">{rpe}</span>
            <span className="text-[9px] text-neutral-500">{SET_FEEL_LABEL[feelFromRpe(rpe)]}</span>
          </button>
        ))}
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 text-[10px] text-neutral-600">
        <Brain size={11} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
        Calibra la carga futura de este levantamiento.
      </p>
    </div>
  );
}
