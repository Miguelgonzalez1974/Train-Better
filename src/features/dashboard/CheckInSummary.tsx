import { HeartPulse, Moon } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { getReadinessFactor, scoreCheck, type CheckInOverall } from '../../engine/readiness';
import { formatSleep } from '../../engine/habits';

const COLOR: Record<CheckInOverall, string> = { bien: 'rgb(var(--c-state-good))', normal: 'rgb(var(--c-state-mid))', mal: 'rgb(var(--c-state-low))' };
const WORD: Record<CheckInOverall, string> = { bien: 'bien', normal: 'normal', mal: 'justo' };

function overallOf(check: ReadinessCheck): CheckInOverall {
  const s = scoreCheck(check);
  return s >= 2 ? 'bien' : s <= -2 ? 'mal' : 'normal';
}

/**
 * Lo contestado en la tarjeta de la mañana, en una línea ("Llegas bien · Carga de hoy +4 % · 7 h 30") con un "Cambiar" que
 * reabre la tarjeta con las respuestas. Vive en la pestaña Preparación: el Resumen se queda limpio una vez contestado.
 */
export function CheckInSummary({ check, onEdit }: { check: ReadinessCheck; onEdit: () => void }) {
  const { factor } = getReadinessFactor(check);
  const pct = Math.round((factor - 1) * 100);
  const o = overallOf(check);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR[o] }} />
        Llegas <span className="font-semibold text-neutral-200">{WORD[o]}</span>
      </span>
      <span>{pct === 0 ? 'Carga de hoy sin cambios' : `Carga de hoy ${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`}</span>
      {check.hrv !== undefined && (
        <span className="flex items-center gap-1">
          <HeartPulse size={12} strokeWidth={2.25} aria-hidden="true" />
          HRV {check.hrv}
        </span>
      )}
      {check.sleepHours !== undefined && (
        <span className="flex items-center gap-1">
          <Moon size={12} strokeWidth={2.25} style={{ color: 'rgb(var(--c-sleep))' }} aria-hidden="true" />
          {formatSleep(check.sleepHours)}
        </span>
      )}
      <button onClick={onEdit} className="ml-auto text-neutral-500 underline-offset-2 transition-colors hover:text-white hover:underline">
        Cambiar
      </button>
    </div>
  );
}
