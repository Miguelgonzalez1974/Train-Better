import type { DayLightColor, DayLightInfo } from '../../data/athlete/types';
import { LIGHT_LABEL } from '../../engine/dayLight';

/** Variable de color de cada día del semáforo (para componer `rgb(var(...) / alfa)`). */
const TOKEN: Record<DayLightColor, string> = { verde: '--c-state-good', ambar: '--c-state-mid', rojo: '--c-state-low' };
export const lightColor = (color: DayLightColor) => `rgb(var(${TOKEN[color]}))`;

/** El semáforo de hoy en una cápsula: un punto del color del día, su nombre y lo que significa ("Día ámbar · mantener sin acumular"). */
export function DayLightPill({ light, className = '' }: { light: DayLightInfo; className?: string }) {
  const meta = LIGHT_LABEL[light.color];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
      style={{ borderColor: `rgb(var(${TOKEN[light.color]}) / 0.45)`, color: lightColor(light.color), backgroundColor: `rgb(var(${TOKEN[light.color]}) / 0.1)` }}
      title={light.reasons.join(' · ')}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lightColor(light.color) }} aria-hidden="true" />
      {meta.name} <span className="font-medium opacity-80">· {meta.short}</span>
    </span>
  );
}
