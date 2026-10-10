import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { computeRecoverySummary, type RecoveryAxisKey, type RecoveryLevel } from '../../engine/recovery';
import { SectionLabel } from '../shell/SectionLabel';

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export const RECOVERY_GOOD = '#34d399';
export const RECOVERY_MID = '#fbbf24';
export const RECOVERY_LOW = '#f87171';

export function recoveryColor(score: number): string {
  return score >= 65 ? RECOVERY_GOOD : score <= 40 ? RECOVERY_LOW : RECOVERY_MID;
}

const LEVEL_TEXT: Record<RecoveryLevel, string> = {
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
 * Cómo estás llegando a entrenar, a partir del check-in diario: la nota de la semana frente a tu media, los 7 últimos
 * días y qué eje (sueño, agujetas, estrés, motivación) más pesa. Detalle del gauge "Recuperación".
 */
export function RecoveryCard({ readinessLog }: { readinessLog: ReadinessCheck[] }) {
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const r = useMemo(() => computeRecoverySummary(readinessLog, todayIso), [readinessLog, todayIso]);

  if (r.score === null || r.level === null) {
    return (
      <section className="rounded-2xl bg-white/[0.03] p-4">
        <SectionLabel className="mb-2">Recuperación</SectionLabel>
        <p className="text-sm text-neutral-300">Todavía no hay datos suficientes.</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          Contesta «¿Cómo llegas hoy?» al menos dos días esta semana y aquí verás si llegas mejor o peor que de costumbre.
        </p>
      </section>
    );
  }

  const color = recoveryColor(r.score);
  const delta = r.delta;
  const DeltaIcon = delta === null || Math.abs(delta) < 4 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaText =
    delta === null
      ? 'Aún sin media con la que comparar'
      : Math.abs(delta) < 4
        ? 'Como tu media de las últimas semanas'
        : `${Math.abs(delta)} puntos ${delta > 0 ? 'por encima' : 'por debajo'} de tu media`;

  return (
    <section className="rounded-2xl bg-white/[0.03] p-4">
      <SectionLabel className="mb-3">Recuperación</SectionLabel>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="num text-5xl font-semibold leading-none tracking-tight text-white">
            {r.score}
            <span className="ml-1 text-base font-normal text-neutral-500">/100</span>
          </p>
          <p className="mt-2 text-sm font-semibold" style={{ color }}>
            {LEVEL_TEXT[r.level]}
          </p>
        </div>
        <p className="flex max-w-[11rem] items-center justify-end gap-1 text-right text-xs leading-snug text-neutral-400">
          <DeltaIcon size={14} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
          {deltaText}
        </p>
      </div>

      {/* Los 7 últimos días: una barra por día, de color según cómo llegaste; hueco si ese día no contestaste. */}
      <div className="mt-5 grid grid-cols-7 gap-1.5" role="img" aria-label="Recuperación de los últimos 7 días">
        {r.days.map((d) => {
          const weekday = new Date(`${d.date}T00:00:00`).getDay();
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <div className="flex h-14 w-full items-end overflow-hidden rounded-md bg-white/[0.05]">
                {d.score !== null && (
                  <div className="w-full rounded-md transition-all duration-500" style={{ height: `${Math.max(12, d.score)}%`, background: recoveryColor(d.score) }} />
                )}
              </div>
              <span className="text-[10px] text-neutral-500">{DAY_INITIAL[weekday]}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
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

      {r.weakest && <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-neutral-400">{WEAKEST_TIP[r.weakest.key]}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
        Se basa en tus check-ins ({r.checks} esta semana) y es orientativo. El coach ya ajusta la carga de cada día con el check-in de ese día.
      </p>
    </section>
  );
}
