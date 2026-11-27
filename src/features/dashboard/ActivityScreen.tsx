import { useEffect, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, Pencil } from 'lucide-react';
import type { CompanionSummary } from '../../engine/companionSummary';
import { progressionReason } from '../../engine/progression';
import type { E1rmSuggestion, SessionSummaryData } from '../../engine/sessionSummary';
import type { DailySession } from '../../data/athlete/types';
import { resolveMovementDisplayName } from '../../data/movements';
import { secondsText } from '../../engine/wodGhost';
import { NutritionTip } from '../planificacion/NutritionTip';
import { num, setFigure, type ActivityDetail, type LiftDetail, type WodDetail } from './activityDetail';
import { EnergyPill } from './EnergyPill';
import { ACCENT as EFFORT, OVER } from './StrainRing';

/**
 * La pantalla de un entreno hecho: arriba el resumen (energía, RPE, minutos y esfuerzo del día), después cada parte en su bloque y al final lo que
 * hará el coach. En la sesión de hoy salen además los 1RM por confirmar arriba y, al final, la racha y «Corregir la sesión».
 */

export interface ActivityScreenProps {
  onClose: () => void;
  /** Lo que se lee junto a la flecha: «Hoy», «Ayer», «sáb, 21 nov». */
  backLabel: string;
  title: string;
  /** «PP + WOD · miércoles, 25 nov». */
  subtitle: string;
  /** El resumen de arriba; ausente en un día con solo el programa de fuerza. */
  stats?: { cost: number | null; gain?: number; rpe: number; minutes: number; rx: string | null };
  /** El esfuerzo del día frente a tu objetivo. */
  effort?: { value: number; low: number; high: number } | null;
  detail: ActivityDetail | null;
  /** El resultado del test de nivel de ese día, si lo hubo. */
  test?: ReactNode;
  programs: (CompanionSummary & { method: string | null })[];
  today?: {
    session: DailySession | null;
    summary: SessionSummaryData | null;
    suggestions: E1rmSuggestion[];
    onConfirm: (s: E1rmSuggestion) => void;
    onDismiss: (s: E1rmSuggestion) => void;
    onCorrect: (() => void) | null;
  };
}

const CARD = 'day-card flex flex-col px-[14px] py-3';
const KICKER = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500';

function Header({ kicker, aside }: { kicker: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className={KICKER}>{kicker}</h2>
      {aside !== undefined && <span className="text-right text-xs text-neutral-500">{aside}</span>}
    </div>
  );
}

/** Cuánto ha cambiado frente a la última vez. */
function Delta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="shrink-0 text-xs text-neutral-400">Igual</span>;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`num flex shrink-0 items-center gap-0.5 text-[13px] font-semibold ${up ? 'text-good' : 'text-neutral-300'}`}>
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{up ? 'Subes' : 'Bajas'} </span>
      {num(Math.abs(delta))} kg
    </span>
  );
}

function Trend({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 3 + (i * 66) / (values.length - 1);
  const y = (v: number) => (max === min ? 11 : 19 - ((v - min) / (max - min)) * 16);
  const last = values.length - 1;
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <svg viewBox="0 0 72 22" className="h-[22px] w-[72px]" role="img" aria-label={`Peso de las últimas ${values.length} veces: ${values.map(num).join(', ')} kilos`}>
        <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-white) / 0.45)' }} />
        <circle cx={x(last)} cy={y(values[last])} r="2.6" style={{ fill: 'rgb(var(--c-white))' }} />
      </svg>
      <span className="text-[11px] text-neutral-500">últimas {values.length} veces</span>
    </span>
  );
}

function LiftCard({ lift }: { lift: LiftDetail }) {
  const done = lift.sets.length;
  const facts = [lift.pct !== null ? `${lift.pct} % de tu 1RM` : null, lift.record ? 'récord' : null].filter(Boolean).join(' · ');
  return (
    <section className={CARD} data-testid="detail-lift">
      <Header kicker={lift.block === 'oly' ? 'Halterofilia' : 'Fuerza'} aside={done === 0 ? undefined : lift.planned && done <= lift.planned ? `${done} de ${lift.planned} series` : `${done} ${done === 1 ? 'serie' : 'series'}`} />
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold text-white">{lift.name}</p>
        {lift.delta !== null && <Delta delta={lift.delta} />}
      </div>
      {done > 0 ? (
        <ol className="mt-2.5 grid grid-cols-4 gap-1.5" aria-label={`Series de ${lift.name}`}>
          {lift.sets.map((s, i) => (
            <li key={i} className={`flex flex-col items-center rounded-lg px-1 py-1.5 ${s.quality === 'fallada' ? 'bg-bad/10' : 'bg-white/[0.05]'}`}>
              <span className={`num text-[15px] font-semibold ${s.quality === 'fallada' ? 'text-bad' : 'text-white'}`}>{setFigure(s).value}</span>
              <span className={`text-[11px] ${s.quality === 'fallada' ? 'text-bad' : s.quality === 'justa' ? 'text-warn' : 'text-neutral-500'}`}>
                {s.quality === 'fallada' ? 'fallada' : s.quality === 'justa' ? 'justa' : setFigure(s).unit}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 text-[13px] text-neutral-400">
          Sin series anotadas{lift.prescription ? ` · previsto ${lift.prescription}` : ''}
        </p>
      )}
      {(facts || lift.trend.length > 1) && (
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <span className="text-xs text-neutral-300">{facts}</span>
          {lift.trend.length > 1 && <Trend values={lift.trend} />}
        </div>
      )}
    </section>
  );
}

function Splits({ splits }: { splits: NonNullable<WodDetail['splits']> }) {
  const max = Math.max(...splits.segments);
  const min = Math.min(...splits.segments);
  const unit = splits.mode === 'ronda' ? 'ronda' : 'tramo';
  return (
    <div className="mt-2.5" data-testid="detail-splits">
      <div className="flex h-9 items-end gap-[3px]" role="img" aria-label={`Tiempo por ${unit}: ${splits.segments.map(secondsText).join(', ')}`}>
        {splits.segments.map((s, i) => (
          <i key={i} className="flex-1 rounded-sm bg-white/25" style={{ height: `${Math.max(25, (s / max) * 100)}%` }} />
        ))}
      </div>
      <p className="num mt-1 text-[11px] text-neutral-500">
        Tiempo por {unit} · de {secondsText(min)} a {secondsText(max)}
      </p>
    </div>
  );
}

function WodCard({ wod, double }: { wod: WodDetail; double: boolean }) {
  return (
    <section className={CARD} data-testid="detail-wod">
      <Header kicker={double ? `WOD · parte ${wod.part}` : 'WOD'} aside={wod.result ? (wod.rx ? 'Rx' : 'Escalado') : undefined} />
      <p className="mt-1 text-[15px] font-semibold text-white">{wod.title}</p>
      {wod.format && <p className="mt-0.5 text-xs leading-snug text-neutral-400">{wod.format}</p>}
      {wod.result ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="num text-[28px] font-semibold leading-none text-white">{wod.result}</span>
          {wod.previous && <span className="text-xs text-neutral-400">la vez anterior, {wod.previous}</span>}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] text-neutral-500">Sin resultado anotado</p>
      )}
      {wod.moves.length > 1 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[13px] text-neutral-300">
          {wod.moves.map((move, i) => (
            <li key={i}>{move}</li>
          ))}
        </ul>
      )}
      {wod.splits && <Splits splits={wod.splits} />}
      {(wod.scaled.length > 0 || wod.feel) && <p className="mt-2 text-xs text-neutral-500">{[wod.scaled.length > 0 ? `Escalado: ${wod.scaled.join(', ')}` : null, wod.feel].filter(Boolean).join(' · ')}</p>}
    </section>
  );
}

/** Lo que hará el coach con lo de ese día, levantamiento a levantamiento. */
function NextTime({ lifts }: { lifts: LiftDetail[] }) {
  const rows = lifts.flatMap((l) => (l.progression ? [{ lift: l, view: l.progression }] : []));
  if (rows.length === 0) return null;
  return (
    <section className={CARD} data-testid="detail-next">
      <Header kicker="La próxima vez" />
      <ul className="mt-1.5 flex flex-col gap-2">
        {rows.map(({ lift, view }) => (
          <li key={lift.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-neutral-200">{resolveMovementDisplayName(view.record.movementId)}</span>
              <span className="block text-xs leading-snug text-neutral-500">{progressionReason(view)}</span>
            </span>
            <span className={`num shrink-0 text-right text-[13px] font-semibold ${view.change === 'subio' ? 'text-good' : view.change === 'bajo' ? 'text-warn' : 'text-neutral-400'}`}>
              {view.change === 'igual' ? 'Mismo peso' : `${view.change === 'subio' ? 'Sube' : 'Baja'} a ≈ ${num(view.nextKg ?? view.record.prescribedKg)} kg`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ActivityScreen({ onClose, backLabel, title, subtitle, stats, effort, detail, test, programs, today }: ActivityScreenProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const over = effort ? effort.value > effort.high : false;
  const nothing = programs.length === 0 && (!detail || (detail.lifts.length === 0 && detail.wods.length === 0 && detail.accessory.length === 0 && !detail.note && detail.fallback.length === 0 && !detail.skipped));
  const prMessage = today?.summary?.prMessage ?? null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}, ${backLabel}`} className="animate-section-in fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-brand-bg motion-reduce:animate-none" data-testid="activity-screen">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="sticky top-0 z-10 -mx-4 bg-brand-bg px-2 pb-1 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-0.5 rounded-lg pr-3 text-[13px] font-semibold text-neutral-300 hover:text-white" data-testid="activity-back">
            <ChevronLeft size={20} aria-hidden="true" />
            {backLabel}
          </button>
        </div>
        <header>
          <h1 className="text-[22px] font-semibold leading-tight text-white">{title}</h1>
          <p className="mt-0.5 text-[13px] text-neutral-400">{subtitle}</p>
        </header>

        {test}

        {(prMessage || (today?.suggestions.length ?? 0) > 0) && today && (
          <section className="flex flex-col gap-2.5 rounded-2xl bg-brand-gold/10 p-3.5" aria-label="Logros de hoy" data-testid="detail-achievements">
            {prMessage && <p className="text-[13px] text-neutral-200">{prMessage}</p>}
            {today.suggestions.map((s) => (
              <div key={`${s.target.kind}-${s.target.key}`}>
                <p className="text-[13px] font-semibold text-white">
                  ¿Subir tu 1RM de {s.movementName} a {num(s.estimatedKg)} kg?
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">Ahora tienes {num(s.currentKg)} kg. Es una estimación a partir de tu serie de hoy, no un test.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => today.onConfirm(s)} className="rounded-lg bg-brand-gold px-3.5 py-2 text-xs font-semibold text-black hover:bg-brand-gold-soft">
                    Sí, subir
                  </button>
                  <button type="button" onClick={() => today.onDismiss(s)} className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/5">
                    Ahora no
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {stats && (
          <section className={CARD} aria-label="Resumen" data-testid="detail-summary">
            <div className="flex items-center justify-between gap-2">
              {stats.cost !== null && <EnergyPill cost={stats.cost} gain={stats.gain} />}
              <Stat value={num(stats.rpe)} label="RPE" />
              <Stat value={num(stats.minutes)} label="minutos" />
              {stats.rx && <Stat value={stats.rx} label="WOD" />}
            </div>
            {effort && (
              <div className="mt-3 border-t border-white/[0.08] pt-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-neutral-300">Esfuerzo del día</span>
                  <span className="num text-[15px] font-semibold" style={{ color: over ? OVER : EFFORT }}>
                    {effort.value}
                  </span>
                </div>
                <div className="relative my-1.5 h-1.5 rounded-full bg-white/[0.09]" aria-hidden="true">
                  <span className="absolute inset-y-0 rounded-full bg-white/25" style={{ left: `${effort.low}%`, width: `${effort.high - effort.low}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, effort.value)}%`, background: over ? OVER : EFFORT }} />
                </div>
                <p className="text-[11px] text-neutral-500">
                  {over ? 'Por encima de' : effort.value < effort.low ? 'Por debajo de' : 'Dentro de'} tu objetivo ({effort.low}–{effort.high})
                </p>
              </div>
            )}
          </section>
        )}

        {detail?.lifts.map((lift) => <LiftCard key={`${lift.block}-${lift.id}`} lift={lift} />)}
        {detail?.wods.map((wod) => <WodCard key={wod.part} wod={wod} double={detail.wods.length > 1} />)}

        {detail && detail.accessory.length > 0 && (
          <section className={CARD} data-testid="detail-accessory">
            <Header kicker="Accesorio" />
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {detail.accessory.map((a, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-neutral-200">{a.name}</span>
                  <span className="num shrink-0 text-neutral-400">{a.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {detail?.note && <p className={`${CARD} text-[13px] leading-relaxed text-neutral-300`}>{detail.note}</p>}
        {detail && detail.fallback.length > 0 && <p className={`${CARD} text-[13px] text-neutral-300`}>Hecho: {detail.fallback.join(' · ')}</p>}
        {detail?.skipped && (
          <p className="px-1 text-[13px] text-neutral-400" data-testid="detail-skipped">
            {detail.skipped}
          </p>
        )}

        {programs.map((p, i) => (
          <section key={`${p.title}-${i}`} className={CARD} data-testid="detail-program">
            <Header kicker={`Programa de fuerza${p.method ? ` · ${p.method}` : ''}`} aside={p.outcome === 'saltada' ? 'Saltada' : (p.stats ?? undefined)} />
            <p className="mt-1 text-[15px] font-semibold text-white">{p.title}</p>
            {p.lines.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-neutral-300">
                {p.lines.map((line, k) => (
                  <li key={k}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {detail && <NextTime lifts={detail.lifts} />}

        {nothing && <p className="px-1 text-[13px] text-neutral-500">No queda guardado el detalle de este entreno.</p>}

        {today && (
          <>
            {today.session && today.session.source !== 'custom' && <NutritionTip session={today.session} variant="post" />}
            {today.summary && (
              <p className="flex justify-between gap-3 px-1 text-xs text-neutral-400" data-testid="detail-streak">
                <span>
                  Racha: {today.summary.streak} {today.summary.streak === 1 ? 'día' : 'días'}
                </span>
                <span>
                  Esta semana: {today.summary.weekCount.done} de {today.summary.weekCount.planned}
                </span>
              </p>
            )}
            {today.onCorrect && (
              <button type="button" onClick={today.onCorrect} className="day-card flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold text-white" data-testid="detail-correct">
                <Pencil size={14} aria-hidden="true" />
                Corregir la sesión
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-1 flex-col items-center">
      <span className="num text-xl font-semibold text-white">{value}</span>
      <span className="text-[11px] text-neutral-500">{label}</span>
    </span>
  );
}
