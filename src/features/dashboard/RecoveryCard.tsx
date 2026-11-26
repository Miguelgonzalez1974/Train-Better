import type { RecoveryAxisKey, RecoveryLevel } from '../../engine/recovery';
import type { ReadinessScore } from '../../engine/readinessScore';
import { SectionLabel } from '../shell/SectionLabel';
import { MorningBreakdown } from './MorningBreakdown';

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

// Variables CSS (ver index.css): el mismo estado se ve más oscuro en el tema claro para que se lea sobre blanco.
export const RECOVERY_GOOD = 'rgb(var(--c-state-good))';
export const RECOVERY_MID = 'rgb(var(--c-state-mid))';
export const RECOVERY_LOW = 'rgb(var(--c-state-low))';

export function recoveryColor(score: number): string {
  return score >= 65 ? RECOVERY_GOOD : score <= 40 ? RECOVERY_LOW : RECOVERY_MID;
}

export const LEVEL_TEXT: Record<RecoveryLevel, string> = {
  alta: 'Llegas con ganas',
  normal: 'Llegas normal',
  baja: 'Llegas cansado',
};

/** Una frase útil para lo que más baja la semana, no un diagnóstico: orientativo. */
const WEAKEST_TIP: Record<RecoveryAxisKey, string> = {
  sleep: 'Lo que más te baja es el sueño. Varias noches flojas seguidas piden bajar la intensidad antes que el volumen.',
  soreness: 'Lo que más pesa son las agujetas. Calentamiento largo y no forzar justo los patrones que más te duelen.',
  stress: 'Lo que más pesa es el estrés: el cansancio que no viene del entreno también cuenta. Mejor una semana de carga moderada.',
  motivation: 'La motivación va baja. A veces ayuda más un WOD corto y vivo que otro bloque pesado.',
};

function axisWord(score: number): string {
  return score <= -0.34 ? 'mal' : score >= 0.34 ? 'bien' : 'regular';
}

/**
 * De dónde sale la preparación (la energía con la que sales esa mañana, ver `engine/energy.ts`) y los check-ins de la última semana.
 */
export function RecoveryDetail({ readiness, inFold = false }: { readiness: ReadinessScore; inFold?: boolean }) {
  const r = readiness.checkins;
  return (
    <div className="flex flex-col gap-6">
      {!inFold && <SectionLabel>Preparación</SectionLabel>}
      <MorningBreakdown readiness={readiness} />

      <div>
        <SectionLabel className="mb-3">Tus check-ins</SectionLabel>
        <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="Check-ins de los últimos 7 días">
          {r.days.map((d) => {
            const weekday = new Date(`${d.date}T00:00:00`).getDay();
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-white/[0.05]">
                  {d.score !== null && (
                    <div className="w-full rounded-md transition-all duration-500" style={{ height: `${Math.max(12, d.score)}%`, background: recoveryColor(d.score) }} />
                  )}
                </div>
                <span className="text-[11px] text-neutral-500">{DAY_INITIAL[weekday]}</span>
              </div>
            );
          })}
        </div>
        {/* Dentro del plegable los ejes ya están arriba, en las cuatro fichas de la pestaña. */}
        {!inFold && r.axes.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5">
            {r.axes.map((axis) => {
              const pct = Math.round(((axis.score + 1) / 2) * 100);
              return (
                <div key={axis.key} className="flex items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-xs text-neutral-300">{axis.label}</span>
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-white/70 transition-all duration-500" style={{ width: `${Math.max(6, pct)}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-[11px] text-neutral-500">{axisWord(axis.score)}</span>
                </div>
              );
            })}
          </div>
        )}
        {r.weakest && <p className="mt-4 text-xs leading-relaxed text-neutral-400">{WEAKEST_TIP[r.weakest.key]}</p>}      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600">
        Orientativo: es una estimación con tu check-in, tu sueño y lo que entrenas. El coach ya ajusta cada día con ella.
      </p>
    </div>
  );
}
