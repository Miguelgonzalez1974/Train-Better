import { useMemo, useState } from 'react';
import type { DailySession, LevelResult, PersonalRecords, SessionHistoryEntry, WodScalingEntry } from '../../data/athlete/types';
import { wodMovementsOfSession } from '../../engine/generateSession';
import { partMovementIds, scaledResultsOfEntry } from '../../engine/levelCategories';
import { partFactor } from '../../engine/scaling';
import { toast } from '../../lib/toast';
import { ScalePicker } from '../planificacion/ScalePicker';

export type SaveScaling = (date: string, scaling: WodScalingEntry[], scaled: LevelResult[]) => void;

/** Decir ahora qué se escaló en un WOD ya cerrado sin detalle, para que cuente en «Tu nivel». */
export function ScaleFix({ entry, part, prs, onSave, onClose }: { entry: SessionHistoryEntry; part: 1 | 2; prs: PersonalRecords; onSave: SaveScaling; onClose: () => void }) {
  const movements = useMemo(() => {
    const prescribed = entry.wodBlocks ? wodMovementsOfSession({ blocks: entry.wodBlocks } as DailySession) : [];
    return partMovementIds(entry, part).map((movementId) => {
      const rxKg = prescribed.find((m) => m.movementId === movementId && m.part === part)?.rxKg;
      return { movementId, part, ...(rxKg ? { rxKg } : {}) };
    });
  }, [entry, part]);
  const [scaling, setScaling] = useState<WodScalingEntry[]>(entry.wodScaling ?? []);
  const mine = scaling.filter((e) => (e.part ?? 1) === part);
  const ready =
    partFactor(
      movements.map((m) => m.movementId),
      mine,
    ) !== null;

  function save() {
    onSave(entry.date, scaling, scaledResultsOfEntry({ ...entry, rxOrScaled: 'scaled', wodScaling: scaling }, prs));
    toast.show('Anotado: ya cuenta en tu nivel');
    onClose();
  }

  return (
    <div className="mb-1 flex flex-col gap-2.5 rounded-xl border border-brand-border p-3" data-testid="scale-fix">
      {movements.length === 0 ? (
        <p className="text-xs text-neutral-500">No guardé los movimientos de aquel WOD, así que no se puede detallar.</p>
      ) : (
        <ScalePicker
          tone="app"
          movements={movements}
          part={part}
          rxOrScaled="scaled"
          scaling={scaling}
          // Aquí solo se completa lo escalado: «No, Rx» no convierte una sesión ya cerrada en Rx.
          allowRx={false}
          onChange={(next) => setScaling(next)}
        />
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={!ready} className="rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={onClose} className="px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
          Cancelar
        </button>
      </div>
    </div>
  );
}
