import { useState } from 'react';
import { Brain, Pencil, TrendingUp } from 'lucide-react';
import { SET_FEEL_LABEL, RPE_CHECKIN_OPTIONS, feelFromRpe } from '../../engine/setFeedback';

interface RpeCheckInProps {
  /** Solo hace falta cuando la tarjeta no vive ya pegada al nombre del movimiento (ej. modo enfocado,
   * donde esta ficha aparece dentro de una lista de varios levantamientos). En la tarjeta de sesión
   * normal se omite: la caja ya está debajo del movimiento al que pertenece, repetir el nombre sobra. */
  movementName?: string;
  /** Serie más pesada ya registrada hoy (workLog del modo enfocado) — de aquí sale el peso, no se teclea. */
  topSet: { kg: number; reps: number };
  loggedRpe: number | null;
  estimated1rm?: number;
  onRate: (rpe: number) => void;
}

/**
 * Pendiente de valorar = acento dorado; ya valorada = acento verde ("hecho", el mismo verde que usa
 * el resto de la app). Degradado muy suave (8%/6% de opacidad, se apaga a transparente) — un matiz,
 * no un efecto marcado, para que la tarjeta se note "aparte" sin desentonar con el resto de la app,
 * que va plana en todo lo demás.
 */
const shellPending = 'rounded-xl border-l-2 border-brand-gold/50 bg-gradient-to-br from-brand-gold/[0.08] via-brand-gold/[0.02] to-transparent p-3.5';
const shellDone = 'rounded-xl border-l-2 border-brand-neon/40 bg-gradient-to-br from-brand-neon/[0.07] via-brand-neon/[0.02] to-transparent p-3.5';

/**
 * Calibra el coach para este levantamiento con un solo dato: el RPE de la serie más pesada que el
 * atleta ya registró en el modo enfocado. Sustituye a la antigua ficha de "¿qué hiciste en tu serie
 * más pesada?" (kg/reps/RPE a mano + pastillas de sensación + reajuste en caliente de las series
 * que quedan) — esos dos primeros ya no aportan nada: el peso y las reps ya están en `workLog`, y el
 * atleta ajusta las series que quedan a mano con los +/- del modo enfocado, no con una sugerencia
 * derivada de una sensación cualitativa. El RPE sigue alimentando `estimateE1RMFromRpe` y
 * `responseProfile` igual que antes.
 */
export function RpeCheckIn({ movementName, topSet, loggedRpe, estimated1rm, onRate }: RpeCheckInProps) {
  const [editing, setEditing] = useState(false);

  if (loggedRpe != null && !editing) {
    return (
      <div className={shellDone}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-300">
            <TrendingUp size={12} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
            {movementName && <span className="font-semibold text-white">{movementName}: </span>}
            {topSet.kg} kg × {topSet.reps} @ RPE {loggedRpe}
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
    <div className={shellPending}>
      <p className="mb-2.5 text-xs font-semibold text-neutral-200">
        {movementName && `${movementName}: `}
        {topSet.kg} kg × {topSet.reps} — ¿a qué RPE?
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
