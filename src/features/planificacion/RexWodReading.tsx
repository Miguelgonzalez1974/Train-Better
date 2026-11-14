import { useState } from 'react';
import { RexMascot } from '../objetivos/RexMascot';
import { secondsText } from '../../engine/wodGhost';
import type { WodReading } from '../../engine/wodRead';
import { workGoalFor } from '../../engine/wodMovements';

/**
 * Al cerrar un WOD cronometrado por tramos: lo que ve Rex (ver `engine/wodRead.ts`). Una lectura corta de dónde se hundió el ritmo, cada
 * movimiento frente al fantasma y, si el que más cede tiene un objetivo propio, el botón para trabajarlo (con confirmación: crea un
 * objetivo normal que se quita en Objetivos). Solo informa; no cambia el plan por sí sola.
 */
export function RexWodReading({ reading, onWork }: { reading: WodReading; onWork?: (movementId: string) => boolean }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done' | 'closed'>('idle');
  if (step === 'closed') return null;
  const work = reading.weak?.movementId ? workGoalFor(reading.weak.movementId) : null;
  const weak = reading.weak;
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-white/[0.03] p-3" aria-label="Lo que ve Rex del WOD">
      <div className="flex items-center gap-2">
        <RexMascot size={24} mood="think" />
        <div>
          <p className="text-sm font-semibold text-white">Lo que veo</p>
          <p className="text-[11px] text-neutral-500">Rex</p>
        </div>
      </div>
      {reading.lead && <p className="text-xs leading-relaxed text-neutral-200">{reading.lead}</p>}
      {reading.rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/[0.06] rounded-lg bg-white/[0.03] px-3 text-sm">
          {reading.rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-neutral-200">{r.name}</span>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${r.slowerPerRound >= 3 ? 'text-warn' : r.slowerPerRound <= -3 ? 'text-good' : 'text-neutral-400'}`}>
                {r.slowerPerRound >= 3 ? `+${secondsText(r.slowerPerRound)} por ronda` : r.slowerPerRound <= -3 ? `−${secondsText(r.slowerPerRound)}` : 'igual'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {weak && (
        <p className="text-xs leading-relaxed text-neutral-200">
          {weak.name} es donde más pierdes hoy (+{secondsText(weak.slowerPerRound)} por ronda).{!work ? ' Cuídalo con un ritmo más sostenido, sin salir fuerte.' : ''}
        </p>
      )}
      {reading.tip && <p className="text-xs leading-relaxed text-neutral-300">{reading.tip}</p>}
      {work && weak && step === 'confirm' && (
        <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-300">
          {work.summary} Lo quitas cuando quieras en Objetivos.
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (reading.weak?.movementId && onWork?.(reading.weak.movementId)) setStep('done');
              }}
              className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-semibold text-black hover:bg-brand-orange-dark"
            >
              Aplicar
            </button>
            <button onClick={() => setStep('idle')} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5">
              Ahora no
            </button>
          </div>
        </div>
      )}
      {step === 'done' && <p className="text-xs font-semibold text-good">Objetivo creado</p>}
      {step !== 'confirm' && step !== 'done' && (
        <div className="flex gap-2">
          {work && onWork && (
            <button onClick={() => setStep('confirm')} className="rounded-lg bg-brand-neon px-3 py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90">
              Trabajar el {weak!.name}
            </button>
          )}
          <button onClick={() => setStep('closed')} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5">
            Entendido
          </button>
        </div>
      )}
    </section>
  );
}
