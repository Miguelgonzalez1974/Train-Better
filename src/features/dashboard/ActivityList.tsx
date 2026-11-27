import type { ReactNode } from 'react';
import { Activity, BedDouble, Bike, Dumbbell, Footprints, PersonStanding, Plus, Users, type LucideIcon } from 'lucide-react';
import type { ActivityKind, EnergyItem } from './dayEnergy';
import { EnergyPill } from './EnergyPill';

const ICON: Record<ActivityKind, LucideIcon> = {
  sesion: Dumbbell,
  programa: Dumbbell,
  clase: Dumbbell,
  running: Footprints,
  bici: Bike,
  fuerza: Dumbbell,
  equipo: Users,
  otro: Activity,
  descanso: BedDouble,
  movilidad: PersonStanding,
};

export interface ActivityEntry {
  item: EnergyItem;
  /** Lo que pasa al tocarla; sin él la fila no se toca. */
  onOpen?: () => void;
  /** Quitar la fila (el descanso de hoy): sale a la derecha. */
  onRemove?: () => void;
}

const ROW = 'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] bg-white/[0.05] py-2 pl-2 pr-3 text-left';

/** Una fila por actividad: la pastilla con la energía, el tipo (y debajo de qué iba) y el RPE. Al tocarla se abre lo que hiciste (o se corrige, si lo añadiste a mano). */
function ActivityRow({ item, onOpen, onRemove }: ActivityEntry) {
  const body = (
    <>
      <span className="flex min-w-[5.25rem] *:w-full">
        <EnergyPill cost={item.cost} gain={item.gain} planned={!item.done} icon={ICON[item.activity]} />
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-sm font-semibold leading-tight ${item.done ? 'text-white' : 'text-neutral-400'}`}>{item.name}</span>
        {item.detail && (
          <span className="mt-0.5 block truncate text-xs leading-tight text-neutral-400" data-testid="activity-detail">
            {item.detail}
          </span>
        )}
      </span>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="-mr-1 min-h-9 px-1 text-[13px] font-semibold text-neutral-300 underline underline-offset-4 hover:text-white" data-testid="activity-remove">
          Quitar
        </button>
      ) : item.done && item.rpe > 0 ? (
        <span className="num whitespace-nowrap text-[13px] text-neutral-400">RPE {String(item.rpe).replace('.', ',')}</span>
      ) : (
        <span />
      )}
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${ROW} transition-colors hover:bg-white/[0.08]`} data-testid="activity-row" data-kind={item.kind}>
      {body}
    </button>
  ) : (
    <div className={ROW} data-testid="activity-row" data-kind={item.kind}>
      {body}
    </div>
  );
}

/**
 * El día en filas iguales y, al final, el botón para añadir otro entreno. Antes de entrenar, a su lado está «Hoy no entreno»; en un día de
 * descanso, entre las filas y el botón va la movilidad propuesta (`suggestion`).
 */
export function ActivityList({ rows, onAdd, onRest, suggestion }: { rows: ActivityEntry[]; onAdd: () => void; onRest?: () => void; suggestion?: ReactNode }) {
  const boxed = rows.length > 0 || Boolean(suggestion);
  const button = `flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors ${boxed ? 'rounded-[10px] bg-white/[0.05] py-2.5 hover:bg-white/[0.08]' : 'day-card py-3'}`;
  return (
    <div className={boxed ? 'day-card flex flex-col gap-2 p-2' : 'flex flex-col'} data-testid="activity-list">
      {rows.map((row) => (
        <ActivityRow key={row.item.id} {...row} />
      ))}
      {suggestion}
      <div className={onRest ? 'grid grid-cols-2 gap-2' : 'flex'}>
        <button type="button" onClick={onAdd} className={`${button} text-white`} data-testid="add-workout">
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          Añadir entreno
        </button>
        {onRest && (
          <button type="button" onClick={onRest} className={`${button} text-good`} data-testid="rest-today">
            <BedDouble size={15} strokeWidth={2.25} aria-hidden="true" />
            Hoy no entreno
          </button>
        )}
      </div>
    </div>
  );
}
