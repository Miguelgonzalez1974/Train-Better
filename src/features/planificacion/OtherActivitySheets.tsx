import { Modal } from '../shell/Modal';
import { DurationStepper, RpePicker } from './SessionFeelFields';
import { OTHER_KINDS, otherKindInfo, type OtherKind } from './otherActivity';

/**
 * La hoja de «Hice otra cosa»: el registro corto (qué fue, cuánto duró, cómo de duro, resultado opcional y, si quieres, pasar la sesión
 * prevista a mañana). Solo pinta: el guardado y el cambio de día los hace `Planificacion`.
 */

export interface OtherFormState {
  kind: OtherKind;
  name: string;
  result: string;
  rpe: number;
  minutes: number;
  moveTomorrow: boolean;
}

export function OtherThingModal({
  open,
  onClose,
  form,
  onChange,
  onSave,
  movePreview,
}: {
  open: boolean;
  onClose: () => void;
  form: OtherFormState;
  onChange: (patch: Partial<OtherFormState>) => void;
  onSave: () => void;
  /** Lo que cambiaría en la semana si se pasa la sesión prevista a mañana; null = no se puede (o no hay nada que pasar) y el interruptor no sale. */
  movePreview: string[] | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Cuéntame qué hiciste">
      <div className="flex flex-col gap-4" data-testid="other-thing">
        <div role="radiogroup" aria-label="Qué fue" className="flex flex-wrap gap-2">
          {OTHER_KINDS.map((k) => {
            const on = form.kind === k.id;
            return (
              <button
                key={k.id}
                role="radio"
                aria-checked={on}
                data-testid={`other-kind-${k.id}`}
                onClick={() => onChange({ kind: k.id, minutes: form.minutes === otherKindInfo(form.kind).minutes ? k.minutes : form.minutes })}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${on ? 'border-brand-neon bg-brand-neon/15 text-brand-neon' : 'border-brand-border text-neutral-300 hover:bg-white/5'}`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-neutral-400">
          Nombre propio (opcional)
          <input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            maxLength={40}
            placeholder="Spinning, pádel, partido…"
            className="rounded-lg border border-brand-border bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <DurationStepper value={form.minutes} onChange={(minutes) => onChange({ minutes })} />
        <div>
          <p className="mb-3 text-sm font-medium text-neutral-300">¿Cómo lo has sentido?</p>
          <RpePicker value={form.rpe} onChange={(rpe) => onChange({ rpe })} />
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-neutral-400">
          Resultado o peso clave (opcional)
          <input
            value={form.result}
            onChange={(e) => onChange({ result: e.target.value })}
            maxLength={80}
            placeholder="12 rondas, sentadilla 100 kg, 8 km…"
            className="rounded-lg border border-brand-border bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        {movePreview && (
          <div className="rounded-xl border border-dashed border-brand-border p-3" data-testid="other-move">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-white">
              Pasar la sesión prevista a mañana
              <input type="checkbox" checked={form.moveTomorrow} onChange={(e) => onChange({ moveTomorrow: e.target.checked })} className="h-5 w-5 accent-[var(--color-brand-neon,#c8f27a)]" />
            </label>
            {form.moveTomorrow && (
              <ul className="mt-2 flex flex-col gap-0.5 text-xs text-neutral-400">
                {movePreview.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-neutral-500">Cuenta como un día entrenado para tu carga y tu racha. La sesión prevista no se da por hecha y no sube ninguna carga.</p>
        <div className="flex gap-2">
          <button onClick={onSave} data-testid="other-save" className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
            Guardar
          </button>
          <button onClick={onClose} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
