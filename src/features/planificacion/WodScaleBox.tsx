import { useState } from 'react';
import { getMovementById } from '../../data/movements';
import type { RxOrScaled, WodFeel, WodScalingEntry } from '../../data/athlete/types';
import { scalingAlternatives } from '../../engine/wodMovements';
import type { WodScalingMovement } from './WodScalingField';

/**
 * Rx o escalado por movimiento y cómo de duro fue el WOD, en las tarjetas de anotar (ReviewDeck): el mismo estado que el cierre, y lo que alimenta
 * «Tu WOD por zonas». Colores fijos para las tarjetas oscuras.
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

type RowKind = 'rx' | 'peso' | 'movimiento';

/** Selector de varias opciones en una píldora, con el color de la tarjeta. */
function Seg<T extends string>({ options, value, onChange, label, accent, full }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; label: string; accent: string; full?: boolean }) {
  return (
    <div className={`flex overflow-hidden rounded-xl ${full ? 'w-full [&>button]:flex-1' : ''}`} role="radiogroup" aria-label={label} style={{ background: 'rgba(255,255,255,0.08)' }}>
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

/** ¿Rx o escalado? por movimiento y cómo de duro fue, dentro de la tarjeta del WOD (alimenta «Tu WOD por zonas», igual que el cierre). */
export function WodScaleBox({ wod, part, accent }: { wod: WodScaleState; part: 1 | 2; accent: string }) {
  /** El detalle por movimiento (qué escalaste) está plegado: lo normal es solo decir Rx o escalado, y el detalle es opcional. */
  const [detail, setDetail] = useState(false);
  const movements = wod.movements.filter((m) => m.part === part);
  if (movements.length === 0) return null;
  const entryOf = (m: WodScalingMovement) => wod.scaling.find((e) => e.movementId === m.movementId && (e.part ?? 1) === m.part);
  const setRow = (m: WodScalingMovement, kind: RowKind) => {
    const rest = wod.scaling.filter((e) => !(e.movementId === m.movementId && (e.part ?? 1) === m.part));
    if (kind === 'rx') return wod.onScaling(rest);
    wod.onScaling([...rest, { movementId: m.movementId, kind, part: m.part, ...(kind === 'peso' && m.rxKg ? { rxKg: m.rxKg } : {}) }]);
  };
  const patchRow = (m: WodScalingMovement, patch: Partial<WodScalingEntry>) =>
    wod.onScaling(wod.scaling.map((e) => (e.movementId === m.movementId && (e.part ?? 1) === m.part ? { ...e, ...patch } : e)));
  const scaled = wod.rxOrScaled === 'scaled';
  const field = 'rounded-lg border px-2 py-1 text-sm text-white';
  const fieldStyle = { background: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.18)' };
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white/[0.06] p-3.5" data-testid="cards-wod-scale">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold text-white">¿Rx o escalado?</p>
        <Seg
          full
          label="Rx o escalado"
          accent={accent}
          value={scaled ? 'scaled' : 'rx'}
          options={[
            { value: 'rx', label: 'Rx' },
            { value: 'scaled', label: 'Escalado' },
          ]}
          onChange={(v) => {
            wod.onRxOrScaled(v);
            if (v === 'rx') wod.onScaling([]);
          }}
        />
      </div>
      {scaled && !detail && (
        <button onClick={() => setDetail(true)} className="self-start text-xs font-semibold underline decoration-dotted" style={{ color: 'rgba(255,255,255,0.7)' }} data-testid="wod-detail">
          Detallar qué escalaste
        </button>
      )}
      {scaled && detail && (
        <div className="flex flex-col divide-y divide-white/10">
          {movements.map((m) => {
            const mv = getMovementById(m.movementId);
            if (!mv) return null;
            const e = entryOf(m);
            const kind: RowKind = e ? e.kind : 'rx';
            const alternatives = scalingAlternatives(m.movementId);
            return (
              <div key={`${m.part}|${m.movementId}`} className="flex flex-col gap-2 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    {mv.name}
                    {m.rxKg ? <span className="ml-1.5 text-[11px] font-normal text-white/50">Rx {m.rxKg} kg</span> : null}
                  </p>
                  <Seg<RowKind>
                    full
                    label={`${mv.name}: qué escalaste`}
                    accent={accent}
                    value={kind}
                    options={[
                      { value: 'rx', label: 'Rx' },
                      { value: 'peso', label: 'Peso' },
                      { value: 'movimiento', label: 'Mov.' },
                    ]}
                    onChange={(v) => setRow(m, v)}
                  />
                </div>
                {kind === 'peso' && (
                  <label className="flex items-center gap-2 text-xs text-white/55">
                    Kilos que usaste
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={e?.loadKg ?? ''}
                      onChange={(ev) => patchRow(m, { loadKg: ev.target.value ? Number(ev.target.value) : undefined })}
                      className={`w-20 text-center ${field}`}
                      style={fieldStyle}
                      aria-label={`Kilos que usaste en ${mv.name}`}
                    />
                    <span>kg (opcional)</span>
                  </label>
                )}
                {kind === 'movimiento' && alternatives.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-white/55">
                    Lo cambié por
                    <select
                      value={e?.substituteId ?? ''}
                      onChange={(ev) => patchRow(m, { substituteId: ev.target.value || undefined })}
                      className={field}
                      style={fieldStyle}
                      aria-label={`Por qué cambiaste ${mv.name}`}
                    >
                      <option value="">Prefiero no decirlo</option>
                      {alternatives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold text-white">¿Cómo de duro fue?</p>
        <Seg<WodFeel>
          full
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
