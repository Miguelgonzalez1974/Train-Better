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
}: {
  scoreType: WodScoreType;
  form: WodResultForm;
  onChange: (patch: Partial<WodResultForm>) => void;
}) {
  if (scoreType === 'time') {
    return (
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
