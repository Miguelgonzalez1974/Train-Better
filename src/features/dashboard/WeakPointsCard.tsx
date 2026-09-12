import { Crosshair } from 'lucide-react';
import type { PatternStrain, WeakPointStatus } from '../../engine/weakPoints';

const STATUS_META: Record<WeakPointStatus, { label: string; badgeClass: string }> = {
  'a-trabajar': { label: 'A trabajar', badgeClass: 'bg-red-500/15 text-red-400' },
  vigilar: { label: 'Vigilar', badgeClass: 'bg-brand-gold/15 text-brand-gold' },
  'en-progreso': { label: 'En progreso', badgeClass: 'bg-emerald-500/15 text-emerald-400' },
  'sin-datos': { label: 'Sin datos', badgeClass: 'bg-white/5 text-neutral-500' },
};

/**
 * Solo enseña lo que de verdad pide atención ("a trabajar"/"vigilar") — "en progreso" es
 * confirmación de que algo va bien, no una acción pendiente, así que no se lista aquí: antes la
 * tarjeta mostraba TODOS los patrones con datos (a menudo 5-6 filas) para, en la práctica, decir
 * "todo bien" la mayoría de las veces. Sin nada que vigilar, una frase corta en vez de la lista.
 */
export function WeakPointsCard({ points }: { points: PatternStrain[] }) {
  const needsAttention = points.filter((p) => p.status === 'a-trabajar' || p.status === 'vigilar');

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2.5">
        {/* Neon: categoria "analisis del coach" — mismo acento que el icono de CoachNote, distingue un diagnostico computado de una simple cifra registrada. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-neon/15 text-brand-neon">
          <Crosshair size={18} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Puntos débiles</p>
      </div>

      {needsAttention.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Sin puntos débiles activos — lo que llevas registrado va bien.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {needsAttention.map((point) => (
            <div
              key={point.key}
              className="flex items-center justify-between gap-3 rounded-lg bg-brand-surfaceMuted/80 px-3 py-2 transition-colors duration-200 hover:bg-brand-surfaceMuted"
            >
              <p className="min-w-0 truncate text-sm text-white">
                {point.label}
                <span className="ml-1.5 text-xs text-neutral-500">
                  · {point.sessions} sesiones{point.avgRpe !== null ? ` · RPE ${point.avgRpe.toFixed(1)}` : ''}
                </span>
              </p>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[point.status].badgeClass}`}>
                {STATUS_META[point.status].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
