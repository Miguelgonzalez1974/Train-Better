import { ZONES, type Placement } from '../../engine/levelReference';

/** Cinco tramos, el tuyo encendido y una marca en el punto exacto. `hollow`: el escalón sale de un escalado (tramo sin rellenar y marca hueca). */
export function ZoneBar({ placement, labels = false, hollow = false }: { placement: Placement; labels?: boolean; hollow?: boolean }) {
  return (
    <div>
      <div className="relative py-1" role="img" aria-label={`Escalón ${placement.zone + 1} de ${ZONES.length}: ${ZONES[placement.zone]}`}>
        <div className="grid grid-cols-5 gap-[3px]">
          {ZONES.map((z, i) => (
            <span key={z} className={`h-1.5 rounded-full ${i < placement.zone ? 'bg-brand-orange/40' : i === placement.zone ? (hollow ? 'border border-brand-orange' : 'bg-brand-orange') : 'bg-white/10'}`} />
          ))}
        </div>
        <span
          className={`absolute -translate-x-1/2 rounded-full ${hollow ? 'top-[2px] h-2.5 w-2.5 border-2 border-white bg-brand-surface' : 'top-0 h-3.5 w-[3px] bg-white'}`}
          style={{ left: `${placement.position * 100}%` }}
          data-testid="zone-marker"
        />
      </div>
      {labels && (
        <div className="grid grid-cols-5 gap-[3px]" aria-hidden="true">
          {ZONES.map((z, i) => (
            <span key={z} className={`min-w-0 whitespace-nowrap text-[10px] tracking-tight ${i === 0 ? 'text-left' : 'text-center'} ${i === placement.zone ? 'font-semibold text-white' : 'text-neutral-500'}`}>
              {z}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
