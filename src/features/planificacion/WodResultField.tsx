import type { WodScoreType } from '../../data/athlete/types';
import type { WodResultForm } from '../../engine/wodScoring';

const numberInputClass = 'w-16 rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white';

/**
 * Campos para anotar el resultado de UN WOD segun su tipo de puntuacion (tiempo, rondas + reps, reps
 * totales o carga). En un dia de doble WOD se pinta uno por parte, cada uno con su propio formulario.
 */
export function WodResultField({
  scoreType,
  form,
  onChange,
  capSeconds,
}: {
  scoreType: WodScoreType;
  form: WodResultForm;
  onChange: (patch: Partial<WodResultForm>) => void;
  /** El time cap del WOD, si se conoce: se guarda junto a un resultado "no terminado". */
  capSeconds?: number;
}) {
  if (scoreType === 'time') {
    const capped = Boolean(form.capped);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex overflow-hidden rounded-lg border border-white/10" role="radiogroup" aria-label="¿Terminaste el WOD?">
          <button
            role="radio"
            aria-checked={!capped}
            onClick={() => onChange({ capped: false })}
            className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors ${!capped ? 'bg-brand-orange/20 text-brand-orange' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            Terminé
          </button>
          <button
            role="radio"
            aria-checked={capped}
            onClick={() => onChange({ capped: true, capSeconds: form.capSeconds ?? capSeconds })}
            className={`flex-1 border-l border-white/10 px-3 py-2 text-sm font-semibold transition-colors ${capped ? 'bg-brand-gold/20 text-brand-gold' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            No terminado (CAP)
          </button>
        </div>
        {capped ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                value={form.rounds}
                onChange={(e) => onChange({ rounds: Number(e.target.value) })}
                aria-label="Rondas completas"
                className={numberInputClass}
              />
              <span className="text-neutral-500">rondas +</span>
              <input
                type="number"
                min={0}
                value={form.extraReps}
                onChange={(e) => onChange({ extraReps: Number(e.target.value) })}
                aria-label="Repeticiones extra"
                className={numberInputClass}
              />
              <span className="text-neutral-500">reps</span>
            </div>
            <p className="text-xs leading-snug text-neutral-500">
              Se guarda como CAP con lo que hiciste, no como un tiempo. En tus estadísticas cuenta como WOD no terminado. Si no tiene rondas, pon todas las
              repeticiones en el segundo campo.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={form.minutes}
              onChange={(e) => onChange({ minutes: Number(e.target.value) })}
              className={numberInputClass}
            />
            <span className="text-neutral-500">min</span>
            <input
              type="number"
              min={0}
              max={59}
              value={form.seconds}
              onChange={(e) => onChange({ seconds: Number(e.target.value) })}
              className={numberInputClass}
            />
            <span className="text-neutral-500">seg</span>
          </div>
        )}
      </div>
    );
  }
  if (scoreType === 'rounds+reps') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={form.rounds}
          onChange={(e) => onChange({ rounds: Number(e.target.value) })}
          className={numberInputClass}
        />
        <span className="text-neutral-500">rondas +</span>
        <input
          type="number"
          min={0}
          value={form.extraReps}
          onChange={(e) => onChange({ extraReps: Number(e.target.value) })}
          className={numberInputClass}
        />
        <span className="text-neutral-500">reps</span>
      </div>
    );
  }
  if (scoreType === 'reps') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={form.reps}
          onChange={(e) => onChange({ reps: Number(e.target.value) })}
          className={numberInputClass}
        />
        <span className="text-neutral-500">reps totales</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step={2.5}
        value={form.load}
        onChange={(e) => onChange({ load: Number(e.target.value) })}
        className={numberInputClass}
      />
      <span className="text-neutral-500">kg</span>
    </div>
  );
}
