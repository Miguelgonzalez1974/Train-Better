import type { RxOrScaled, WodFeel, WodScalingEntry } from '../../data/athlete/types';
import { ScalePicker, type WodScalingMovement } from './ScalePicker';

/**
 * Qué se escaló del WOD y cómo de duro fue, en las tarjetas de anotar (ReviewDeck): el mismo estado que el cierre, y lo que alimenta
 * «Tu WOD por zonas» y «Tu nivel». Colores fijos para las tarjetas oscuras.
 */
/** Lo del WOD que se anota (Rx/escalado por movimiento y dureza): el mismo estado del padre. */
export interface WodScaleState {
  movements: WodScalingMovement[];
  rxOrScaled: RxOrScaled;
  onRxOrScaled: (value: RxOrScaled) => void;
  scaling: WodScalingEntry[];
  onScaling: (next: WodScalingEntry[]) => void;
  feel: WodFeel | undefined;
  onFeel: (value: WodFeel | undefined) => void;
}

/** Selector de varias opciones en una píldora, con el color de la tarjeta. */
function Seg<T extends string>({ options, value, onChange, label, accent }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; label: string; accent: string }) {
  return (
    <div className="flex w-full overflow-hidden rounded-xl [&>button]:flex-1" role="radiogroup" aria-label={label} style={{ background: 'rgba(255,255,255,0.08)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="whitespace-nowrap px-3 py-2 text-xs font-bold transition-colors"
            style={on ? { background: `${accent}30`, color: accent } : { color: 'rgba(255,255,255,0.55)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** ¿Escalaste algo? y cómo de duro fue, dentro de la tarjeta del WOD. */
export function WodScaleBox({ wod, part, accent }: { wod: WodScaleState; part: 1 | 2; accent: string }) {
  if (!wod.movements.some((m) => m.part === part)) return null;
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white/[0.06] p-3.5" data-testid="cards-wod-scale">
      <ScalePicker
        key={part}
        tone="card"
        movements={wod.movements}
        part={part}
        rxOrScaled={wod.rxOrScaled}
        scaling={wod.scaling}
        onChange={(scaling, rxOrScaled) => {
          // Primero lo escalado: al guardarlo el padre marca «escalado», y lo que manda es lo que dice el selector.
          wod.onScaling(scaling);
          wod.onRxOrScaled(rxOrScaled);
        }}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold text-white">¿Cómo de duro fue?</p>
        <Seg<WodFeel>
          label="Dureza del WOD"
          accent={accent}
          value={wod.feel}
          options={[
            { value: 'facil', label: 'Fácil' },
            { value: 'justo', label: 'Justo' },
            { value: 'duro', label: 'Duro' },
          ]}
          onChange={(v) => wod.onFeel(wod.feel === v ? undefined : v)}
        />
      </div>
    </div>
  );
}
