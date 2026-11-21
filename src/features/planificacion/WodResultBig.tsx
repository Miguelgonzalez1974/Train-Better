import { Minus, Plus } from 'lucide-react';
import type { WodScoreType } from '../../data/athlete/types';
import { bumpWodForm, type WodNumberField, type WodResultForm } from '../../engine/wodScoring';

/**
 * El resultado de un WOD con números grandes y botones + y −, para anotarlo con el pulgar sin escribir: rondas y repeticiones, minutos y segundos,
 * repeticiones totales o carga. Escribe en el mismo formulario que `WodResultField` (que sigue siendo el del cierre de siempre). Pensado para las
 * tarjetas oscuras de `ReviewDeck`: colores fijos, texto blanco y botones de contraste alto.
 */

const white = '#ffffff';
const soft = 'rgba(255,255,255,0.78)';

function Column({ label, value, onBump, steps, accent, testId, pad }: { label: string; value: number; onBump: (delta: number) => void; steps: [number, number]; accent: string; testId: string; pad?: boolean }) {
  const [small, large] = steps;
  const chip = 'rounded-full px-3 py-1.5 text-xs font-bold active:scale-95';
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" data-testid={testId}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: soft }}>{label}</p>
      <button onClick={() => onBump(small)} aria-label={`Más ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95" style={{ background: 'rgba(255,255,255,0.18)', color: white }}>
        <Plus size={24} strokeWidth={3} />
      </button>
      <p className="text-[clamp(2.75rem,13vw,3.5rem)] font-black leading-none tabular-nums" style={{ color: accent }} aria-live="polite">
        {pad ? String(value).padStart(2, '0') : value}
      </p>
      <button onClick={() => onBump(-small)} aria-label={`Menos ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95" style={{ background: 'rgba(255,255,255,0.18)', color: white }}>
        <Minus size={24} strokeWidth={3} />
      </button>
      <div className="flex gap-1.5">
        <button onClick={() => onBump(-large)} className={chip} style={{ background: 'rgba(255,255,255,0.14)', color: white }}>
          −{large}
        </button>
        <button onClick={() => onBump(large)} className={chip} style={{ background: 'rgba(255,255,255,0.14)', color: white }}>
          +{large}
        </button>
      </div>
    </div>
  );
}

export function WodResultBig({
  scoreType,
  form,
  onChange,
  capSeconds,
  accent,
}: {
  scoreType: WodScoreType;
  form: WodResultForm;
  onChange: (patch: Partial<WodResultForm>) => void;
  capSeconds?: number;
  accent: string;
}) {
  const bump = (field: WodNumberField) => (delta: number) => onChange(bumpWodForm(form, field, delta));

  if (scoreType === 'time') {
    const capped = Boolean(form.capped);
    const tab = (on: boolean) => ({ background: on ? white : 'rgba(255,255,255,0.14)', color: on ? '#000' : white });
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-2" role="radiogroup" aria-label="¿Terminaste el WOD?">
          <button role="radio" aria-checked={!capped} onClick={() => onChange({ capped: false })} className="min-h-11 flex-1 rounded-full px-3 text-sm font-bold" style={tab(!capped)}>
            Terminé
          </button>
          <button role="radio" aria-checked={capped} onClick={() => onChange({ capped: true, capSeconds: form.capSeconds ?? capSeconds })} className="min-h-11 flex-1 rounded-full px-3 text-sm font-bold" style={tab(capped)}>
            No terminado (CAP)
          </button>
        </div>
        {capped ? (
          <div className="flex gap-3">
            <Column label="Rondas" value={form.rounds} onBump={bump('rounds')} steps={[1, 5]} accent={accent} testId="wod-big-rounds" />
            <Column label="Reps" value={form.extraReps} onBump={bump('extraReps')} steps={[1, 5]} accent={accent} testId="wod-big-reps" />
          </div>
        ) : (
          <div className="flex gap-3">
            <Column label="Minutos" value={form.minutes} onBump={bump('minutes')} steps={[1, 5]} accent={accent} testId="wod-big-min" />
            <Column label="Segundos" value={form.seconds} onBump={bump('seconds')} steps={[1, 10]} accent={accent} testId="wod-big-sec" pad />
          </div>
        )}
        {capped && <p className="text-center text-xs" style={{ color: soft }}>Se guarda como CAP con lo que hiciste. En tus estadísticas cuenta como no terminado.</p>}
      </div>
    );
  }
  if (scoreType === 'rounds+reps') {
    return (
      <div className="flex gap-3">
        <Column label="Rondas" value={form.rounds} onBump={bump('rounds')} steps={[1, 5]} accent={accent} testId="wod-big-rounds" />
        <Column label="Reps" value={form.extraReps} onBump={bump('extraReps')} steps={[1, 5]} accent={accent} testId="wod-big-reps" />
      </div>
    );
  }
  if (scoreType === 'reps') {
    return (
      <div className="flex">
        <Column label="Reps totales" value={form.reps} onBump={bump('reps')} steps={[1, 10]} accent={accent} testId="wod-big-total" />
      </div>
    );
  }
  return (
    <div className="flex">
      <Column label="Kilos" value={form.load} onBump={bump('load')} steps={[2.5, 10]} accent={accent} testId="wod-big-load" />
    </div>
  );
}
