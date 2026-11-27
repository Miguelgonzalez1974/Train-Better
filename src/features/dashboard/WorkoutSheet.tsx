import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { DayWorkout, MobilityLogEntry, WorkoutKind } from '../../data/athlete/types';
import { clockTime } from '../../engine/energy';
import { OTHER_KINDS, otherKindInfo } from '../planificacion/otherActivity';
import { RpePicker } from '../planificacion/SessionFeelFields';
import { workoutName } from './dayEnergy';

type SheetKind = WorkoutKind | 'movilidad';

/** Lo que propone la duración de una movilidad añadida a mano. */
const MOBILITY_MINUTES = 15;
const usualMinutes = (kind: SheetKind) => (kind === 'movilidad' ? MOBILITY_MINUTES : otherKindInfo(kind).minutes);

/**
 * «Añadir entreno»: qué fue y cómo de duro, y el botón dice lo que restará. La duración viene puesta según el tipo y solo se toca si ese día fue
 * muy distinto; la hora no se pregunta. La movilidad solo pide la duración, y suma. Con algo ya guardado sirve para corregirlo o borrarlo.
 */
export function WorkoutSheet({
  dateIso,
  editing,
  mobility,
  costOf,
  gainOf,
  onSave,
  onDelete,
  onSaveMobility,
  onDeleteMobility,
}: {
  dateIso: string;
  /** El entreno que se corrige; sin él, uno nuevo. */
  editing: DayWorkout | null;
  /** La movilidad que se corrige. */
  mobility?: MobilityLogEntry;
  /** Lo que restaría de energía el entreno tal como está. */
  costOf: (draft: DayWorkout) => number;
  /** Lo que sumaría la movilidad tal como está (con el tope del día). */
  gainOf: (draft: MobilityLogEntry) => number;
  onSave: (workout: DayWorkout) => void;
  onDelete: (id: string) => void;
  onSaveMobility: (entry: MobilityLogEntry) => void;
  onDeleteMobility: (id: string) => void;
}) {
  const [kind, setKind] = useState<SheetKind>(mobility ? 'movilidad' : (editing?.kind ?? 'clase'));
  const [name, setName] = useState(editing?.name ?? '');
  const [minutes, setMinutes] = useState(mobility?.minutes ?? editing?.minutes ?? otherKindInfo('clase').minutes);
  const [rpe, setRpe] = useState(editing?.rpe ?? 5);
  const [changing, setChanging] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [newId] = useState(() => `w-${dateIso}-${openedAt.toString(36)}`);

  const usual = minutes === usualMinutes(kind);
  // La movilidad se ofrece al añadir (antes de «Otro»); un entreno guardado no se convierte en movilidad ni al revés.
  const kinds: SheetKind[] = mobility ? [] : OTHER_KINDS.flatMap((k): SheetKind[] => (k.id === 'otro' && !editing ? ['movilidad', k.id] : [k.id]));

  function pickKind(next: SheetKind) {
    // La duración sigue al tipo mientras sea la habitual; la que hayas puesto tú no se pisa.
    if (usual) setMinutes(usualMinutes(next));
    setKind(next);
  }

  const chips = kinds.length > 0 && (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Qué entreno">
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => pickKind(k)}
          className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${kind === k ? 'border-white bg-white text-brand-bg' : 'border-white/15 text-neutral-300 hover:bg-white/5'}`}
        >
          {k === 'movilidad' ? 'Movilidad' : workoutName({ kind: k })}
        </button>
      ))}
    </div>
  );
  const stepper = (
    <span className="flex items-center gap-1">
      <button type="button" aria-label="Menos minutos" onClick={() => setMinutes((m) => Math.max(5, m - 5))} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.07] text-white hover:bg-white/10">
        <Minus size={16} />
      </button>
      <button type="button" aria-label="Más minutos" onClick={() => setMinutes((m) => Math.min(300, m + 5))} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.07] text-white hover:bg-white/10">
        <Plus size={16} />
      </button>
    </span>
  );
  const primary = 'num w-full rounded-xl bg-brand-orange px-4 py-3 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-colors duration-200 hover:bg-brand-orange-dark';
  const remove = (label: string, run: () => void) => (
    <button type="button" onClick={run} className="flex items-center justify-center gap-1.5 self-center text-xs font-semibold text-bad" data-testid="workout-delete">
      <Trash2 size={13} aria-hidden="true" />
      {label}
    </button>
  );

  if (kind === 'movilidad') {
    const entry: MobilityLogEntry = { id: mobility?.id ?? `mov-${newId}`, date: dateIso, purpose: mobility?.purpose ?? 'movilidad', zones: mobility?.zones ?? [], minutes, exercises: mobility?.exercises ?? 0 };
    const gain = gainOf(entry);
    return (
      <div className="flex flex-col gap-4" data-testid="workout-sheet">
        {chips}
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
          <span className="text-[13px] text-neutral-300" data-testid="workout-minutes">
            Duración: <span className="num font-semibold text-white">{minutes} min</span>
          </span>
          {stepper}
        </div>
        {gain === 0 && <p className="text-xs text-neutral-500">Por hoy ya no suma más: has llegado al tope.</p>}
        <button type="button" onClick={() => onSaveMobility(entry)} className={primary} data-testid="workout-save">
          {mobility ? 'Guardar' : 'Añadir'} · +{gain} % de energía
        </button>
        {mobility && remove('Borrar esta movilidad', () => onDeleteMobility(mobility.id))}
      </div>
    );
  }

  // El nombre solo se pregunta en «Otro»; el que ya tuviera un entreno guardado se conserva mientras no cambie de tipo.
  const keptName = kind === 'otro' ? name.trim() : editing?.kind === kind ? (editing.name ?? '') : '';
  // La hora no se pregunta: se guarda la de un entreno que acaba ahora, solo para ordenar las filas.
  const time = editing?.time ?? clockTime(new Date(openedAt - minutes * 60_000));
  const draft: DayWorkout = { id: editing?.id ?? newId, date: dateIso, time, kind, ...(keptName ? { name: keptName } : {}), minutes, rpe };
  const cost = costOf(draft);

  return (
    <div className="flex flex-col gap-4" data-testid="workout-sheet">
      {chips}
      {kind === 'otro' && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="¿Qué fue? (opcional)"
          aria-label="Nombre del entreno"
          maxLength={40}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-neutral-500"
        />
      )}
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Cómo de duro</span>
        <RpePicker value={rpe} onChange={setRpe} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
        <span className="text-[13px] text-neutral-300" data-testid="workout-minutes">
          {usual ? 'Duración habitual' : 'Duración'}: <span className="num font-semibold text-white">{minutes} min</span>
        </span>
        {changing ? (
          stepper
        ) : (
          <button type="button" onClick={() => setChanging(true)} className="py-2 text-[13px] font-semibold text-neutral-300 underline underline-offset-4" data-testid="workout-change-minutes">
            Cambiar
          </button>
        )}
      </div>
      <button type="button" onClick={() => onSave(draft)} className={primary} data-testid="workout-save">
        {editing ? 'Guardar' : 'Añadir'} · {cost > 0 ? '−' : ''}
        {cost} % de energía
      </button>
      {editing && remove('Borrar este entreno', () => onDelete(editing.id))}
    </div>
  );
}
