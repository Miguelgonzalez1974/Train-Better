import { useEffect, useState } from 'react';
import type { RxOrScaled, WodScalingEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { partFactor } from '../../engine/scaling';
import { isLoadable, scalingAlternatives } from '../../engine/wodMovements';

/**
 * «¿Escalaste algo?»: Rx, el peso o un movimiento (o las dos cosas), con el detalle abierto directamente. Se usa en la tarjeta del WOD al anotar y,
 * para un día ya cerrado sin detalle, en «Tu nivel». Lo anotado alimenta «Tu WOD por zonas» y lo que vale ese WOD para tu nivel (`engine/scaling.ts`).
 */
export interface WodScalingMovement {
  movementId: string;
  part: 1 | 2;
  /** Carga Rx prescrita, si se conoce. */
  rxKg?: number;
}

type Kind = 'peso' | 'movimiento';

/** Los saltos de los botones de peso. */
const STEP_KG = 2.5;
/** «Lo cambié, sin decir por cuál». */
const OTHER = '?';

const format = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));
const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Los estilos según dónde se pinte: la tarjeta oscura de anotar (con su color) o la app (claro u oscuro). */
const TONES = {
  card: {
    title: 'text-sm font-bold text-white',
    text: 'text-sm font-semibold text-white',
    muted: 'text-xs text-white/55',
    box: 'rounded-xl bg-black/25 p-2.5',
    input: 'rounded-lg border border-white/20 bg-black/35 px-2 py-1.5 text-center text-sm text-white',
    step: 'h-9 w-9 shrink-0 rounded-lg border border-white/20 text-lg leading-none text-white',
    chip: 'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
    chipOff: 'border-white/20 text-white/70',
    chipOn: 'border-transparent bg-brand-orange text-black',
  },
  app: {
    title: 'text-[13px] font-semibold text-white',
    text: 'text-[13px] font-semibold text-white',
    muted: 'text-xs text-neutral-500',
    box: 'rounded-xl bg-white/[0.04] p-2.5',
    input: 'rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white',
    step: 'h-9 w-9 shrink-0 rounded-lg border border-brand-border text-lg leading-none text-white',
    chip: 'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    chipOff: 'border-brand-border text-neutral-400 hover:text-white',
    chipOn: 'border-transparent bg-brand-orange text-black',
  },
} as const;

/** Una caja de kilos que admite escribir decimales («22,5») y seguir a los botones. */
function KgInput({ value, onValue, label, className }: { value: number | undefined; onValue: (v: number | undefined) => void; label: string; className: string }) {
  const [draft, setDraft] = useState(format(value));
  useEffect(() => {
    setDraft((d) => (parse(d) === value ? d : format(value)));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder="kg"
      aria-label={label}
      className={className}
      onChange={(e) => {
        if (!/^\d{0,3}([.,]\d{0,2})?$/.test(e.target.value)) return;
        setDraft(e.target.value);
        onValue(parse(e.target.value));
      }}
    />
  );
}

export function ScalePicker({
  movements,
  part,
  rxOrScaled,
  scaling,
  onChange,
  tone,
  allowRx = true,
}: {
  /** Los movimientos del WOD (de todas las partes; se usan los de `part`). */
  movements: WodScalingMovement[];
  part: 1 | 2;
  rxOrScaled: RxOrScaled;
  scaling: WodScalingEntry[];
  onChange: (scaling: WodScalingEntry[], rxOrScaled: RxOrScaled) => void;
  tone: keyof typeof TONES;
  /** Ofrecer «No, Rx». */
  allowRx?: boolean;
}) {
  const s = TONES[tone];
  const mine = movements.filter((m) => m.part === part && getMovementById(m.movementId));
  const entries = scaling.filter((e) => (e.part ?? 1) === part);
  const [open, setOpen] = useState<Record<Kind, boolean>>({ peso: entries.some((e) => e.kind === 'peso'), movimiento: entries.some((e) => e.kind === 'movimiento') });
  const loaded = mine.filter((m) => m.rxKg || isLoadable(m.movementId));
  const showWeight = open.peso && loaded.length > 0;
  // Sin nada abierto ni anotado en esta parte: es Rx si toda la sesión lo es, o si lo escalado está en la otra parte.
  const isRx = !open.peso && !open.movimiento && entries.length === 0 && (rxOrScaled === 'rx' || scaling.length > 0);
  const factor = partFactor(
    mine.map((m) => m.movementId),
    entries,
  );

  const entryOf = (id: string) => entries.find((e) => e.movementId === id);
  const others = (id: string) => scaling.filter((e) => !(e.movementId === id && (e.part ?? 1) === part));

  function put(id: string, next: WodScalingEntry | null) {
    const rest = others(id);
    onChange(next ? [...rest, next] : rest, 'scaled');
  }

  function setWeight(m: WodScalingMovement, loadKg: number | undefined, rxKg: number | undefined) {
    const empty = loadKg === undefined && (m.rxKg !== undefined || rxKg === undefined);
    put(m.movementId, empty ? null : { movementId: m.movementId, kind: 'peso', part, ...(rxKg !== undefined ? { rxKg } : {}), ...(loadKg !== undefined ? { loadKg } : {}) });
  }

  function chooseRx() {
    const rest = scaling.filter((e) => (e.part ?? 1) !== part);
    setOpen({ peso: false, movimiento: false });
    onChange(rest, rest.length > 0 ? 'scaled' : 'rx');
  }

  function toggle(kind: Kind) {
    const other: Kind = kind === 'peso' ? 'movimiento' : 'peso';
    if (open[kind]) {
      const next = scaling.filter((e) => !((e.part ?? 1) === part && e.kind === kind));
      setOpen({ ...open, [kind]: false });
      onChange(next, next.length > 0 || open[other] ? 'scaled' : 'rx');
    } else {
      setOpen({ ...open, [kind]: true });
      onChange(scaling, 'scaled');
    }
  }

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={`${s.chip} ${on ? s.chipOn : s.chipOff}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5" data-testid="scale-picker">
      <p className={s.title}>¿Escalaste algo?</p>
      <div className="flex flex-wrap gap-1.5">
        {allowRx && chip('No, Rx', isRx, chooseRx)}
        {loaded.length > 0 && chip('El peso', open.peso, () => toggle('peso'))}
        {chip('Un movimiento', open.movimiento, () => toggle('movimiento'))}
      </div>

      {showWeight &&
        loaded.map((m) => {
          const name = getMovementById(m.movementId)!.name;
          const e = entryOf(m.movementId);
          const used = e?.kind === 'peso' ? e.loadKg : undefined;
          const rx = m.rxKg ?? (e?.kind === 'peso' ? e.rxKg : undefined);
          const bump = (delta: number) => setWeight(m, Math.max(STEP_KG, used === undefined ? m.rxKg! - STEP_KG : used + delta), m.rxKg);
          return (
            <div key={`kg-${m.movementId}`} className={s.box} data-testid="scale-weight" data-movement={m.movementId}>
              <p className="flex items-baseline justify-between gap-2">
                <span className={s.text}>{name}</span>
                {m.rxKg ? <span className={s.muted}>Rx {format(m.rxKg)} kg</span> : null}
              </p>
              {m.rxKg ? (
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" onClick={() => bump(-STEP_KG)} aria-label={`Menos peso en ${name}`} className={s.step}>
                    −
                  </button>
                  <KgInput value={used} onValue={(v) => setWeight(m, v, m.rxKg)} label={`Kilos que usaste en ${name}`} className={`${s.input} min-w-0 flex-1`} />
                  <button type="button" onClick={() => bump(STEP_KG)} aria-label={`Más peso en ${name}`} className={s.step}>
                    +
                  </button>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={`flex flex-col gap-1 ${s.muted}`}>
                    Usé
                    <KgInput value={used} onValue={(v) => setWeight(m, v, rx)} label={`Kilos que usaste en ${name}`} className={`${s.input} w-full`} />
                  </label>
                  <label className={`flex flex-col gap-1 ${s.muted}`}>
                    El Rx era
                    <KgInput value={rx} onValue={(v) => setWeight(m, used, v)} label={`Kilos del Rx en ${name}`} className={`${s.input} w-full`} />
                  </label>
                </div>
              )}
              {used !== undefined && rx !== undefined && used >= rx && <p className={`mt-1.5 ${s.muted}`}>Eso es el Rx o más.</p>}
            </div>
          );
        })}

      {open.movimiento &&
        mine.map((m) => {
          const name = getMovementById(m.movementId)!.name;
          const e = entryOf(m.movementId);
          const value = e?.kind === 'movimiento' ? (e.substituteId ?? OTHER) : '';
          return (
            <label key={`mov-${m.movementId}`} className={`flex flex-col gap-1.5 ${s.box}`} data-testid="scale-movement" data-movement={m.movementId}>
              <span className={s.text}>{name}</span>
              <select
                value={value}
                aria-label={`Por qué cambiaste ${name}`}
                className={`${s.input} w-full text-left`}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === '') {
                    // «No lo cambié» no borra los kilos que hubiera en ese mismo movimiento.
                    if (e?.kind === 'movimiento') put(m.movementId, null);
                    return;
                  }
                  put(m.movementId, { movementId: m.movementId, kind: 'movimiento', part, ...(v === OTHER ? {} : { substituteId: v }) });
                }}
              >
                <option value="">No lo cambié</option>
                {scalingAlternatives(m.movementId).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value={OTHER}>Lo cambié por otro</option>
              </select>
            </label>
          );
        })}

      {(!isRx || !allowRx) && (
        <p className={s.muted} data-testid="scale-value">
          {factor === null ? 'Si no dices qué cambiaste, este WOD no contará en tu nivel.' : `Para tu nivel vale el ${Math.round(factor * 100)} % de un Rx.`}
        </p>
      )}
    </div>
  );
}
