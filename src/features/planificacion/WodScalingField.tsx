import type { RxOrScaled, WodFeel, WodScalingEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { scalingAlternatives } from '../../engine/wodMovements';

export interface WodScalingMovement {
  movementId: string;
  part: 1 | 2;
  /** Carga Rx prescrita, si se conoce. */
  rxKg?: number;
}

type RowKind = 'rx' | 'peso' | 'movimiento';

const FEEL_OPTIONS: { value: WodFeel; label: string }[] = [
  { value: 'facil', label: 'Fácil' },
  { value: 'justo', label: 'Justo' },
  { value: 'duro', label: 'Duro' },
];

const seg = (active: boolean, tone: 'plain' | 'warn' = 'plain') =>
  `whitespace-nowrap px-3 py-1.5 text-xs font-semibold transition-colors ${active ? (tone === 'warn' ? 'bg-warn/20 text-warn' : 'bg-white/10 text-white') : 'text-neutral-500 hover:text-neutral-200'}`;

const keyOf = (m: { movementId: string; part: 1 | 2 }) => `${m.part}|${m.movementId}`;

/**
 * Qué se escaló del WOD y cómo de duro fue, en el cierre de la sesión: «Rx» o «Escalé algo»; si escalaste, cada movimiento del WOD con
 * Rx / peso / movimiento (con los kilos usados o el movimiento por el que lo cambiaste, si quieres decirlo) y la dureza en tres botones.
 * Alimenta «Tu WOD por zonas» del Análisis. Por defecto todo es Rx.
 */
export function WodScalingField({
  movements,
  rxOrScaled,
  onRxOrScaled,
  scaling,
  onScaling,
  feel,
  onFeel,
}: {
  movements: WodScalingMovement[];
  rxOrScaled: RxOrScaled;
  onRxOrScaled: (value: RxOrScaled) => void;
  scaling: WodScalingEntry[];
  onScaling: (next: WodScalingEntry[]) => void;
  feel: WodFeel | undefined;
  onFeel: (value: WodFeel | undefined) => void;
}) {
  const entryOf = (m: WodScalingMovement) => scaling.find((e) => e.movementId === m.movementId && (e.part ?? 1) === m.part);

  function setRow(m: WodScalingMovement, kind: RowKind) {
    const rest = scaling.filter((e) => !(e.movementId === m.movementId && (e.part ?? 1) === m.part));
    if (kind === 'rx') return onScaling(rest);
    onScaling([...rest, { movementId: m.movementId, kind, part: m.part, ...(kind === 'peso' && m.rxKg ? { rxKg: m.rxKg } : {}) }]);
  }

  function patchRow(m: WodScalingMovement, patch: Partial<WodScalingEntry>) {
    onScaling(scaling.map((e) => (e.movementId === m.movementId && (e.part ?? 1) === m.part ? { ...e, ...patch } : e)));
  }

  const scaled = rxOrScaled === 'scaled';
  const double = movements.some((m) => m.part === 2);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-300">¿Rx o escalado?</p>
        <div className="flex overflow-hidden rounded-lg bg-white/5" role="radiogroup" aria-label="Rx o escalado">
          <button
            role="radio"
            aria-checked={!scaled}
            onClick={() => {
              onRxOrScaled('rx');
              onScaling([]);
            }}
            className={seg(!scaled)}
          >
            Rx
          </button>
          <button role="radio" aria-checked={scaled} onClick={() => onRxOrScaled('scaled')} className={seg(scaled)}>
            Escalé algo
          </button>
        </div>
      </div>

      {scaled && (
        <div className="flex flex-col divide-y divide-white/5 rounded-xl bg-white/[0.03] px-3">
          {movements.map((m) => {
            const mv = getMovementById(m.movementId);
            if (!mv) return null;
            const e = entryOf(m);
            const kind: RowKind = e ? e.kind : 'rx';
            const alternatives = scalingAlternatives(m.movementId);
            return (
              <div key={keyOf(m)} className="flex flex-col gap-2 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-white">
                    {mv.name}
                    {double && <span className="ml-1.5 text-[11px] text-neutral-500">parte {m.part}</span>}
                    {m.rxKg ? <span className="ml-1.5 text-[11px] text-neutral-500">Rx {m.rxKg} kg</span> : null}
                  </p>
                  <div className="flex overflow-hidden rounded-lg bg-white/5" role="radiogroup" aria-label={`${mv.name}: qué escalaste`}>
                    {(['rx', 'peso', 'movimiento'] as RowKind[]).map((k) => (
                      <button key={k} role="radio" aria-checked={kind === k} onClick={() => setRow(m, k)} className={seg(kind === k, k === 'rx' ? 'plain' : 'warn')}>
                        {k === 'rx' ? 'Rx' : k === 'peso' ? 'Peso' : 'Movimiento'}
                      </button>
                    ))}
                  </div>
                </div>
                {kind === 'peso' && (
                  <label className="flex items-center gap-2 text-xs text-neutral-500">
                    Kilos que usaste
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={e?.loadKg ?? ''}
                      onChange={(ev) => patchRow(m, { loadKg: ev.target.value ? Number(ev.target.value) : undefined })}
                      className="w-20 rounded-lg border border-brand-border bg-brand-bg px-2 py-1 text-center text-sm text-white"
                      aria-label={`Kilos que usaste en ${mv.name}`}
                    />
                    <span>kg (opcional)</span>
                  </label>
                )}
                {kind === 'movimiento' && alternatives.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-neutral-500">
                    Lo cambié por
                    <select
                      value={e?.substituteId ?? ''}
                      onChange={(ev) => patchRow(m, { substituteId: ev.target.value || undefined })}
                      className="rounded-lg border border-brand-border bg-brand-bg px-2 py-1 text-sm text-white"
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-300">¿Cómo de duro fue?</p>
        <div className="flex overflow-hidden rounded-lg bg-white/5" role="radiogroup" aria-label="Dureza del WOD">
          {FEEL_OPTIONS.map((o) => (
            <button key={o.value} role="radio" aria-checked={feel === o.value} onClick={() => onFeel(feel === o.value ? undefined : o.value)} className={seg(feel === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
