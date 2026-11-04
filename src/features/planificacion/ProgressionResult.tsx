import { ArrowUp, ArrowDown, Check, Minus } from 'lucide-react';
import { getMovementById } from '../../data/movements';
import { fmtKg } from '../../lib/format';
import { progressionReason, VERDICT_LABEL, type SessionProgressionView } from '../../engine/progression';

const VERDICT_CLASS = {
  limpia: 'bg-good/15 text-good',
  hecha: 'bg-white/10 text-neutral-300',
  dura: 'bg-warn/15 text-warn',
  fallo: 'bg-warn/15 text-warn',
} as const;

/** Un punto por cada sesión limpia necesaria: lleno si ya se ha conseguido. */
function CleanDots({ done, needed }: { done: number; needed: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${done} de ${needed} sesiones limpias`}>
      {Array.from({ length: needed }, (_, i) => (
        <span
          key={i}
          className={`flex h-5 w-6 items-center justify-center rounded text-[10px] ${i < done ? 'bg-good/15 text-good' : 'bg-white/5 text-neutral-500'}`}
        >
          {i < done ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : i + 1}
        </span>
      ))}
    </span>
  );
}

/**
 * Qué decidió el coach con el resultado de fuerza de hoy: cómo salió, si la carga cambia para la próxima vez y por qué regla.
 * Vive en la tarjeta que sale al cerrar la sesión.
 */
export function ProgressionResult({ views }: { views: SessionProgressionView[] }) {
  if (views.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 border-t border-white/5 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tu progresión</p>
      {views.map((v) => {
        const name = getMovementById(v.record.movementId)?.name ?? v.record.movementId;
        const { record } = v;
        return (
          <div key={record.movementId} className="rounded-lg bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {name} · {record.prescribedSets}×{record.prescribedReps} a {fmtKg(record.prescribedKg)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {record.topKg !== record.prescribedKg ? `Peso más alto: ${fmtKg(record.topKg)}` : 'Peso como estaba prescrito'}
                  {record.rpe !== undefined ? ` · RPE ${String(record.rpe).replace('.', ',')}` : ''}
                </p>
              </div>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${VERDICT_CLASS[record.verdict]}`}>
                {VERDICT_LABEL[record.verdict]}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/5 pt-2.5">
              <div className="min-w-0">
                {v.change === 'igual' ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
                    <Minus size={14} aria-hidden="true" />
                    Se queda igual
                  </p>
                ) : (
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${v.change === 'subio' ? 'text-good' : 'text-warn'}`}>
                    {v.change === 'subio' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                    Próxima vez ≈ {fmtKg(v.nextKg ?? record.prescribedKg)}
                    <span className="text-xs font-normal">
                      ({(v.deltaPct ?? 0) > 0 ? '+' : ''}
                      {String(v.deltaPct ?? 0).replace('.', ',')} %)
                    </span>
                  </p>
                )}
                <p className="mt-0.5 text-xs text-neutral-500">{progressionReason(v)}</p>
              </div>
              {v.change === 'igual' && v.record.verdict === 'limpia' && <CleanDots done={v.cleanStreak} needed={v.needed} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
