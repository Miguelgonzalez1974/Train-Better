import { HeartPulse } from 'lucide-react';
import type { RecoveryAxisKey, RecoveryLevel } from '../../engine/recovery';
import type { ReadinessPart, ReadinessScore } from '../../engine/readinessScore';
import { SectionLabel } from '../shell/SectionLabel';

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

/** Una de las partes de la nota: título, barra con su valor y, debajo, el porqué. */
function PartRow({ title, part }: { title: string; part: ReadinessPart }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="w-[8.5rem] shrink-0 text-xs font-medium text-neutral-200">{title}</span>
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          {part.score !== null && (
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, part.score)}%`, background: recoveryColor(part.score) }} />
          )}
        </div>
        <span className="num w-7 shrink-0 text-right text-sm font-semibold text-white">{part.score ?? '—'}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-neutral-500">{part.detail}</p>
    </div>
  );
}

/**
 * De dónde sale la nota de recuperación: cómo te sientes (check-in) y cómo te está saliendo el entreno, más los
 * check-ins de la última semana. La carga (ACWR) va aparte, en el otro anillo.
 */
export function RecoveryDetail({ readiness }: { readiness: ReadinessScore }) {
  const r = readiness.checkins;
  return (
    <div className="flex flex-col gap-6">
      <SectionLabel>Preparación</SectionLabel>
      <div className="flex flex-col gap-3.5">
        <PartRow title="Cómo te sientes" part={readiness.feel} />
        <PartRow title="Cómo te está saliendo" part={readiness.performance} />
        {/* La carga no se promedia: solo resta cuando va alta, para que unos buenos check-ins no tapen que vas pasado. */}
        <div>
          <div className="flex items-baseline gap-3">
            <span className="w-[8.5rem] shrink-0 text-xs font-medium text-neutral-200">Tu carga</span>
            <span className="flex-1 text-[11px] text-neutral-500">{readiness.load.score === null ? 'sin datos aún' : readiness.loadPenalty > 0 ? 'resta a la nota' : 'no resta nada'}</span>
            <span className="num w-9 shrink-0 text-right text-sm font-semibold" style={{ color: readiness.loadPenalty > 0 ? RECOVERY_LOW : RECOVERY_GOOD }}>
              {readiness.load.score === null ? '—' : readiness.loadPenalty > 0 ? `−${readiness.loadPenalty}` : '0'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">{readiness.load.detail}</p>
        </div>
        {/* HRV y pulso de la mañana frente a tu rango y tu media: solo restan cuando caen fuera, y la HRV solo con rango. */}
        {readiness.hrv.detail !== '' && (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="w-[8.5rem] shrink-0 text-xs font-medium text-neutral-200">Tu HRV</span>
              <span className="flex-1 text-[11px] text-neutral-500">
                {readiness.hrv.status.state === 'listo' ? (readiness.hrv.penalty > 0 ? 'resta a la nota' : 'no resta nada') : 'reuniendo datos'}
              </span>
              <span className="num w-9 shrink-0 text-right text-sm font-semibold" style={{ color: readiness.hrv.penalty > 0 ? RECOVERY_LOW : RECOVERY_GOOD }}>
                {readiness.hrv.penalty > 0 ? `−${readiness.hrv.penalty}` : '0'}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">{readiness.hrv.detail}</p>
          </div>
        )}
        {/* El descanso de ayer suma: haber parado tras una racha de días entrenando (y dormir bien hoy) sube un poco la nota. */}
        {readiness.rest.credit > 0 && (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="w-[8.5rem] shrink-0 text-xs font-medium text-neutral-200">Tu descanso</span>
              <span className="flex-1 text-[11px] text-neutral-500">suma a la nota</span>
              <span className="num w-9 shrink-0 text-right text-sm font-semibold" style={{ color: RECOVERY_GOOD }}>
                +{readiness.rest.credit}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">{readiness.rest.detail}</p>
          </div>
        )}
        {readiness.pain.count > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <HeartPulse size={12} className="shrink-0 text-red-400" aria-hidden="true" />
            Molestia activa ({readiness.pain.areas.join(', ')}): resta {readiness.pain.penalty} puntos a la nota.
          </p>
        )}
      </div>

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
                <span className="text-[10px] text-neutral-500">{DAY_INITIAL[weekday]}</span>
              </div>
            );
          })}
        </div>
        {r.axes.length > 0 && (
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
        {r.weakest && <p className="mt-4 text-xs leading-relaxed text-neutral-400">{WEAKEST_TIP[r.weakest.key]}</p>}
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600">
        Orientativo: mezcla lo que dices que sientes con cómo te salen las sesiones, y la carga acumulada solo resta cuando va alta. El coach ya ajusta los kilos de cada día con todo esto.
      </p>
    </div>
  );
}
