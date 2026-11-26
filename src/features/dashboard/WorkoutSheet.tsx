import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { DayWorkout, WorkoutKind } from '../../data/athlete/types';
import { clockTime } from '../../engine/energy';
import { OTHER_KINDS, otherKindInfo } from '../planificacion/otherActivity';
import { RpePicker } from '../planificacion/SessionFeelFields';

/**
 * «+ Entreno»: lo justo para sumar un entreno al día (qué fue, a qué hora, cuánto duró y cómo de duro) y ver lo que resta antes de guardarlo.
 * Con un entreno ya guardado sirve para corregirlo o borrarlo.
 */
export function WorkoutSheet({
  dateIso,
  editing,
  preview,
  onSave,
  onDelete,
}: {
  dateIso: string;
  /** El entreno que se corrige; sin él, uno nuevo. */
  editing: DayWorkout | null;
  /** Lo que restaría el entreno tal como está y la energía que quedaría (null si no se sabe). */
  preview: (draft: DayWorkout) => { cost: number; energy: number | null; withNight: boolean };
  onSave: (workout: DayWorkout) => void;
  onDelete: (id: string) => void;
}) {
  const [kind, setKind] = useState<WorkoutKind>(editing?.kind ?? 'running');
  const [name, setName] = useState(editing?.name ?? '');
  const [minutes, setMinutes] = useState(editing?.minutes ?? otherKindInfo('running').minutes);
  const [rpe, setRpe] = useState(editing?.rpe ?? 5);
  // Mientras no se toque, la hora es la del entreno que acaba ahora mismo (se mueve con la duración).
  const [pickedTime, setTime] = useState<string | null>(editing?.time ?? null);
  const [openedAt] = useState(() => Date.now());
  const time = pickedTime ?? clockTime(new Date(openedAt - minutes * 60_000));
  const [newId] = useState(() => `w-${dateIso}-${openedAt.toString(36)}`);
  const draft: DayWorkout = { id: editing?.id ?? newId, date: dateIso, time: time || '12:00', kind, ...(name.trim() ? { name: name.trim() } : {}), minutes, rpe };
  const { cost, energy, withNight } = preview(draft);

  function pickKind(next: WorkoutKind) {
    setKind(next);
    if (!editing) setMinutes(otherKindInfo(next).minutes);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="workout-sheet">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Qué entreno">
        {OTHER_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => pickKind(k.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${kind === k.id ? 'border-brand-orange bg-brand-orange/15 text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Nombre (opcional): ${otherKindInfo(kind).title}`}
        aria-label="Nombre del entreno"
        maxLength={60}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500"
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Hora</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="num h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-base text-white" />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Duración</span>
          <div className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-1">
            <button type="button" aria-label="Menos minutos" onClick={() => setMinutes((m) => Math.max(5, m - 5))} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10">
              <Minus size={15} />
            </button>
            <span className="num text-base font-semibold text-white">{minutes} min</span>
            <button type="button" aria-label="Más minutos" onClick={() => setMinutes((m) => Math.min(300, m + 5))} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10">
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Cómo de duro</span>
        <RpePicker value={rpe} onChange={setRpe} />
      </div>
      <p className="rounded-xl bg-white/[0.05] px-3 py-2.5 text-[13px] text-neutral-300" data-testid="workout-preview">
        Resta <strong className="num font-semibold text-white">{cost}</strong> de energía
        {energy !== null && (
          <>
            . Te quedarán <strong className="num font-semibold text-white">{energy}</strong>
            {withNight && ' (contando tu respuesta de la noche)'}
          </>
        )}
        .
      </p>
      <button
        type="button"
        onClick={() => onSave(draft)}
        className="w-full rounded-xl bg-brand-orange px-4 py-3 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-colors duration-200 hover:bg-brand-orange-dark"
        data-testid="workout-save"
      >
        {editing ? 'Guardar cambios' : 'Añadir'}
      </button>
      {editing && (
        <button type="button" onClick={() => onDelete(editing.id)} className="flex items-center justify-center gap-1.5 self-center text-xs font-semibold text-bad" data-testid="workout-delete">
          <Trash2 size={13} aria-hidden="true" />
          Borrar este entreno
        </button>
      )}
    </div>
  );
}
