import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import type { AthleteProfile, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { analyzeWodMovements, buildWorkGoal, workGoalFor, type MovementFlag, type ZoneStat } from '../../engine/wodMovements';

/**
 * «Tu WOD por zonas»: cómo haces los WODs (Rx, escalado por peso, escalado por movimiento o sin terminar) por zona del WOD y a lo largo
 * del tiempo, y qué movimientos hay que mejorar. Solo lee lo que anotas al cerrar el WOD. El coach no cambia nada por esto: «Trabajarlo»
 * crea un objetivo normal (que se quita en Objetivos) solo si lo pulsas y lo confirmas.
 */

const PERIODS: { weeks: number | null; label: string }[] = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 8, label: '8 semanas' },
  { weeks: null, label: 'Todo' },
];

const SEGMENTS: { key: 'rx' | 'peso' | 'movimiento' | 'cap'; label: string; bar: string; dot: string }[] = [
  { key: 'rx', label: 'Rx', bar: 'bg-good', dot: 'bg-good' },
  { key: 'peso', label: 'Escalado por peso', bar: 'bg-info', dot: 'bg-info' },
  { key: 'movimiento', label: 'Escalado por movimiento', bar: 'bg-warn', dot: 'bg-warn' },
  { key: 'cap', label: 'No terminado (cap)', bar: 'bg-bad', dot: 'bg-bad' },
];

function trendText(t: ZoneStat['trend'], weeks: number | null): string {
  if (!t) return 'Sin tendencia todavía';
  if (t.before === t.now) return `Estable: ${t.now} % Rx`;
  return `${weeks === null ? 'Al principio' : 'Antes'} ${t.before} % Rx → ahora ${t.now} %`;
}

function ZoneRow({ z, weeks }: { z: ZoneStat; weeks: number | null }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p className="truncate text-sm text-white">{z.label}</p>
        <p className="truncate text-[11px] text-neutral-500">{z.examples}</p>
      </div>
      <div>
        <div className="flex h-3.5 overflow-hidden rounded bg-white/[0.06]" role="img" aria-label={`${z.label}: ${z.rx} % Rx, ${z.peso} % por peso, ${z.movimiento} % por movimiento, ${z.cap} % sin terminar`}>
          {SEGMENTS.map((s) => (z[s.key] > 0 ? <div key={s.key} className={s.bar} style={{ width: `${z[s.key]}%` }} /> : null))}
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          {z.wods} {z.wods === 1 ? 'WOD' : 'WODs'} · {trendText(z.trend, weeks)}
        </p>
      </div>
    </div>
  );
}

function FlagRow({ f, onWork }: { f: MovementFlag; onWork: (movementId: string) => Goal | null }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  const work = workGoalFor(f.movementId);
  return (
    <div className="flex flex-col gap-2 border-t border-white/5 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white">{f.name}</p>
          <p className="text-[11px] text-neutral-500">{f.detail}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${f.kind === 'movimiento' ? 'bg-warn/15 text-warn' : 'bg-info/15 text-info'}`}>{f.kind === 'movimiento' ? 'Por movimiento' : 'Por peso'}</span>
          {work && step === 'idle' && (
            <button onClick={() => setStep('confirm')} className="rounded-lg border border-brand-border px-3 py-1 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/5">
              Trabajarlo
            </button>
          )}
          {step === 'done' && <span className="text-xs font-semibold text-good">Creado</span>}
        </div>
      </div>
      {work && step === 'confirm' && (
        <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-300">
          {work.summary} Lo quitas cuando quieras en Objetivos.
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (onWork(f.movementId)) setStep('done');
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
    </div>
  );
}

export function WodZonesCard({ profile, history, todayIso, onCreateWorkGoal }: { profile: AthleteProfile; history: SessionHistoryEntry[]; todayIso: string; onCreateWorkGoal?: (goal: Goal) => void }) {
  const [weeks, setWeeks] = useState<number | null>(8);
  const report = useMemo(() => analyzeWodMovements(history, todayIso, weeks, profile.wodLog ?? []), [history, todayIso, weeks, profile.wodLog]);
  const period = PERIODS.find((p) => p.weeks === weeks) ?? PERIODS[1];

  function work(movementId: string): Goal | null {
    const goal = buildWorkGoal(movementId, todayIso);
    if (!goal || !onCreateWorkGoal) return null;
    onCreateWorkGoal(goal);
    return goal;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3.5" aria-label="Tu WOD por zonas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Flame size={16} aria-hidden="true" className="text-warn" />
            Tu WOD por zonas
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {report.wods === 0 ? 'Aún sin WODs anotados' : `${period.weeks === null ? 'Todo el historial' : `Últimas ${period.label}`} · ${report.wods} ${report.wods === 1 ? 'WOD' : 'WODs'}`}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg bg-white/5" role="radiogroup" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              role="radio"
              aria-checked={p.weeks === weeks}
              onClick={() => setWeeks(p.weeks)}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold transition-colors ${p.weeks === weeks ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {report.wods === 0 ? (
        <p className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
          Al cerrar un WOD te pregunto si lo hiciste Rx o escalado y, si escalaste, qué movimiento y si fue el peso o el movimiento. Con unas semanas de WODs verás aquí en qué zonas vas bien y qué hay que mejorar.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {report.zones.map((z) => (
              <ZoneRow key={z.zone} z={z} weeks={weeks} />
            ))}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              {SEGMENTS.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} aria-hidden="true" />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-semibold text-neutral-400">Lo que hay que mejorar</p>
            {report.improve.length === 0 ? (
              <p className="text-xs text-neutral-500">Nada que destacar todavía: ningún movimiento se te escala con frecuencia.</p>
            ) : (
              report.improve.map((f) => <FlagRow key={f.movementId} f={f} onWork={work} />)
            )}
            {report.good.length > 0 && <p className="mt-2 text-[11px] text-neutral-500">Bien: {report.good.join(', ')}.</p>}
          </div>
        </>
      )}

      <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-400">
        El coach no cambia tu programación por esto. Solo trabaja un movimiento si pulsas «Trabajarlo», y lo quitas cuando quieras.
      </p>
    </section>
  );
}
