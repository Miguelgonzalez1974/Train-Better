import { Activity, Bike, Dumbbell, Footprints, Plus, Users, type LucideIcon } from 'lucide-react';
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
};

export interface ActivityEntry {
  item: EnergyItem;
  onOpen: () => void;
}

/** Una fila por entreno: la pastilla con la energía, el tipo y el RPE. Al tocarla se abre lo que hiciste (o se corrige, si lo añadiste a mano). */
function ActivityRow({ item, onOpen }: ActivityEntry) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] bg-white/[0.05] py-2 pl-2 pr-3 text-left transition-colors hover:bg-white/[0.08]"
      data-testid="activity-row"
      data-kind={item.kind}
    >
      <span className="flex min-w-[5.25rem] *:w-full">
        <EnergyPill cost={item.cost} planned={!item.done} icon={ICON[item.activity]} />
      </span>
      <span className={`truncate text-sm font-semibold ${item.done ? 'text-white' : 'text-neutral-400'}`}>{item.name}</span>
      {item.done && item.rpe > 0 ? <span className="num whitespace-nowrap text-[13px] text-neutral-400">RPE {String(item.rpe).replace('.', ',')}</span> : <span />}
    </button>
  );
}

/** Los entrenos del día, en filas iguales, y al final el botón para añadir otro. */
export function ActivityList({ rows, onAdd }: { rows: ActivityEntry[]; onAdd: () => void }) {
  return (
    <div className={rows.length > 0 ? 'day-card flex flex-col gap-2 p-2' : 'flex flex-col'} data-testid="activity-list">
      {rows.map((row) => (
        <ActivityRow key={row.item.id} {...row} />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className={`flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-white transition-colors ${
          rows.length > 0 ? 'rounded-[10px] bg-white/[0.05] py-2.5 hover:bg-white/[0.08]' : 'day-card py-3'
        }`}
        data-testid="add-workout"
      >
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
        Añadir entreno
      </button>
    </div>
  );
}
