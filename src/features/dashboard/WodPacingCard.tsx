import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { AthleteProfile, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { listRepeatableWods } from '../../engine/wodRepeat';
import { buildWorkGoal, workGoalFor } from '../../engine/wodMovements';
import { PACING_MIN_WODS, allSplits, pacingReport, patternSentence, patternTip, trendSentence, weakSentence, type WeakMovement } from '../../engine/wodPacingReport';

/**
 * «Tu ritmo en los WODs»: lo que cuentan los parciales que guardas al cronometrar un WOD por tramos (modo fantasma). Cómo repartes el esfuerzo,
 * qué movimiento se te repite como el que más cede, cómo han cambiado los WODs que has repetido y cuál conviene repetir para compararte.
 * Solo informa: el coach no cambia nada por esto, y «Trabajarlo» crea un objetivo normal (que se quita en Objetivos) solo si lo confirmas.
 */

const PERIODS: { weeks: number | null; label: string }[] = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 8, label: '8 semanas' },
  { weeks: null, label: 'Todo' },
];

function WeakRow({ w, onWork }: { w: WeakMovement; onWork: (movementId: string) => Goal | null }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  const work = w.movementId ? workGoalFor(w.movementId) : null;
  return (
    <div className="flex flex-col gap-2 border-t border-white/5 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-neutral-200">{weakSentence(w)}</p>
        {work && step === 'idle' && (
          <button onClick={() => setStep('confirm')} className="rounded-lg border border-brand-border px-3 py-1 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/5">
            Trabajarlo
          </button>
        )}
        {step === 'done' && <span className="text-xs font-semibold text-good">Creado</span>}
      </div>
      {work && w.movementId && step === 'confirm' && (
        <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-300">
          {work.summary} Lo quitas cuando quieras en Objetivos.
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (w.movementId && onWork(w.movementId)) setStep('done');
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
      {!work && <p className="text-[11px] text-neutral-500">Se cuida con el ritmo: no salgas fuerte en este movimiento.</p>}
    </div>
  );
}

export function WodPacingCard({ profile, history, todayIso, onCreateWorkGoal }: { profile: AthleteProfile; history: SessionHistoryEntry[]; todayIso: string; onCreateWorkGoal?: (goal: Goal) => void }) {
  const [weeks, setWeeks] = useState<number | null>(8);
  const ghosts = useMemo(() => profile.wodGhosts ?? [], [profile.wodGhosts]);
  const report = useMemo(() => pacingReport({ history, ghosts, todayIso, weeks }), [history, ghosts, todayIso, weeks]);
  // Para poner nombre a los WODs repetidos y proponer cuáles repetir (los que tienen parciales y solo se han hecho una vez).
  const repeatable = useMemo(() => listRepeatableWods(history, profile, ghosts), [history, profile, ghosts]);
  const titleOf = (key: string) => repeatable.find((w) => w.key === key)?.title ?? 'WOD repetido';
  const toRepeat = repeatable.filter((w) => w.withSplits && w.times === 1).slice(0, 2);
  const total = useMemo(() => allSplits(history, ghosts).length, [history, ghosts]);
  const period = PERIODS.find((p) => p.weeks === weeks) ?? PERIODS[1];

  function work(movementId: string): Goal | null {
    const goal = buildWorkGoal(movementId, todayIso);
    if (!goal || !onCreateWorkGoal) return null;
    onCreateWorkGoal(goal);
    return goal;
  }

  const p = report.pattern;
  const tip = p ? patternTip(p) : null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3.5" aria-label="Tu ritmo en los WODs" data-testid="wod-pacing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Gauge size={16} aria-hidden="true" className="text-info" />
            Tu ritmo en los WODs
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {report.wods === 0 ? 'Aún sin WODs cronometrados por tramos' : `${period.weeks === null ? 'Todo el historial' : `Últimas ${period.label}`} · ${report.wods} ${report.wods === 1 ? 'WOD' : 'WODs'} con parciales`}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg bg-white/5" role="radiogroup" aria-label="Periodo del ritmo">
          {PERIODS.map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={o.weeks === weeks}
              onClick={() => setWeeks(o.weeks)}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold transition-colors ${o.weeks === weeks ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {!p ? (
        <p className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-400" data-testid="wod-pacing-empty">
          {total === 0
            ? 'Cuando cronometras un WOD con la cinta de tramos del reloj, guardo lo que tardas en cada ronda o movimiento. Con unos pocos verás aquí cómo repartes el esfuerzo.'
            : `Llevo ${report.analysed} de ${PACING_MIN_WODS} WODs con rondas suficientes (4 o más) en este periodo para hablar de tu patrón. ${report.analysed === 0 && period.weeks !== null ? 'Prueba con un periodo más largo.' : 'Sigue cronometrando por tramos.'}`}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed text-neutral-100">{patternSentence(p)}</p>
            <div className="flex h-3.5 overflow-hidden rounded bg-white/[0.06]" role="img" aria-label={`Te hundes en ${p.fading}, aguantas en ${p.steady} y aceleras en ${p.negative} de ${p.wods} WODs`}>
              {p.fading > 0 && <div className="bg-bad" style={{ width: `${(p.fading / p.wods) * 100}%` }} />}
              {p.steady > 0 && <div className="bg-good" style={{ width: `${(p.steady / p.wods) * 100}%` }} />}
              {p.negative > 0 && <div className="bg-info" style={{ width: `${(p.negative / p.wods) * 100}%` }} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-bad" aria-hidden="true" />
                Te hundes ({p.fading})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-good" aria-hidden="true" />
                Aguantas ({p.steady})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-info" aria-hidden="true" />
                Aceleras ({p.negative})
              </span>
            </div>
            {tip && <p className="text-xs leading-relaxed text-neutral-400">{tip}</p>}
          </div>

          {report.weak.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold text-neutral-400">Lo que se te repite</p>
              {report.weak.map((w) => (
                <WeakRow key={w.name} w={w} onWork={work} />
              ))}
            </div>
          )}

          {report.trends.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold text-neutral-400">WODs que has repetido</p>
              <ul className="flex flex-col gap-1.5">
                {report.trends.map((t) => (
                  <li key={t.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="min-w-0 text-neutral-200">{titleOf(t.key)}</span>
                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${t.delta < 0 ? 'text-good' : 'text-warn'}`}>{trendSentence(t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {toRepeat.length > 0 && (
        <div className="border-t border-white/10 pt-3" data-testid="wod-pacing-repeat">
          <p className="mb-1.5 text-xs font-semibold text-neutral-400">Para compararte, repite</p>
          <ul className="flex flex-col gap-1 text-sm text-neutral-200">
            {toRepeat.map((w) => (
              <li key={w.key}>
                {w.title} <span className="text-xs text-neutral-500">· la hiciste el {w.lastDate.slice(8, 10)}/{w.lastDate.slice(5, 7)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-neutral-500">Elígela en RexLab → Repetir WOD fantasma y correrás contra tus tiempos de entonces.</p>
        </div>
      )}

      <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-400">
        El coach no cambia tu programación por esto. Solo trabaja un movimiento si pulsas «Trabajarlo», y lo quitas cuando quieras.
      </p>
    </section>
  );
}
