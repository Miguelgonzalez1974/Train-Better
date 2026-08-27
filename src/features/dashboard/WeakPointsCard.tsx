import { Crosshair } from 'lucide-react';
import type { PatternStrain, WeakPointStatus } from '../../engine/weakPoints';

const STATUS_META: Record<WeakPointStatus, { label: string; badgeClass: string }> = {
  'a-trabajar': { label: 'A trabajar', badgeClass: 'bg-red-500/15 text-red-400' },
  vigilar: { label: 'Vigilar', badgeClass: 'bg-brand-gold/15 text-brand-gold' },
  'en-progreso': { label: 'En progreso', badgeClass: 'bg-emerald-500/15 text-emerald-400' },
  'sin-datos': { label: 'Sin datos', badgeClass: 'bg-white/5 text-neutral-500' },
};

export function WeakPointsCard({ points }: { points: PatternStrain[] }) {
  const withData = points.filter((p) => p.status !== 'sin-datos');

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2.5">
        {/* Neon: categoria "analisis del coach" — mismo acento que el icono de CoachNote, distingue un diagnostico computado de una simple cifra registrada. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-neon/15 text-brand-neon">
          <Crosshair size={18} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Puntos débiles</p>
      </div>

      {withData.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Completa más sesiones (al menos 2 con el mismo patrón) para que el coach detecte tus puntos débiles.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {withData.map((point) => (
            <div
              key={point.key}
              className="flex items-center justify-between rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5 transition-colors duration-200 hover:bg-brand-surfaceMuted"
            >
              <div>
                <p className="text-sm font-medium text-white">{point.label}</p>
                <p className="text-xs text-neutral-500">
                  {point.sessions} sesiones · RPE medio {point.avgRpe?.toFixed(1)}
                  {point.scaledRate ? ` · ${Math.round(point.scaledRate * 100)}% escalado` : ''}
                  {point.loadTrend === 'estancado' && ' · carga estancada en tus últimos tests'}
                  {point.loadTrend === 'subida' && ' · carga subiendo en tus últimos tests'}
                </p>
              </div>
              <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_META[point.status].badgeClass}`}>
                {STATUS_META[point.status].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
