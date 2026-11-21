import { useEffect, useMemo, useState } from 'react';
import { X, Timer, Hourglass, HeartPulse, Check, Layers } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult, WorkSetEntry } from '../../data/athlete/types';
import { benchmarkWorkouts, getMovementById } from '../../data/movements';
import { complexLogId } from '../../data/complexes';
import { loadUnitLabel } from '../../data/movements/loadUnits';
import { localizeWodText } from '../../engine/wodUnits';
import { clockBus, useClockActive } from '../../lib/clockState';
import { fmtKgValue } from '../../lib/format';
import { clearListStart, clockLabel, elapsedMinutes, listStartedAt } from '../../lib/trainMode';
import { useVisibleViewport } from '../../lib/useVisibleViewport';
import { BLOCK_ORDER } from './DaySessionBlocks';
import { groupWodByPart } from './wodPartGroups';

/**
 * Modo «Entrenar»: la sesión de hoy como una lista simple, sin deslizar tarjetas ni anotar nada mientras entrenas. Arriba, el tiempo de la
 * sesión y el cronómetro del WOD y el descanso siempre a un toque; al acabar, «Terminé» abre las tarjetas de revisión con todo lo previsto
 * ya rellenado (los minutos reales ya puestos) para tocar solo lo que fue distinto. No escribe nada por sí sola: lo anotado sale de ahí,
 * así que el coach recibe exactamente los mismos datos que con las tarjetas serie a serie.
 */

const LABEL: Record<Block, string> = {
  warmup: 'Calentamiento',
  strength: 'Fuerza',
  wod: 'WOD',
  oly: 'Halterofilia',
  accessory: 'Accesorio',
  skill: 'Skill',
  cooldown: 'Vuelta a la calma',
};

const ACCENT: Record<Block, string> = {
  warmup: '#ffd166',
  strength: '#ffb27a',
  wod: '#ff8a80',
  oly: '#6ee7b7',
  accessory: '#b9a7ff',
  skill: '#7fe0d4',
  cooldown: '#9db4ff',
};

function nameOf(id: string): string {
  if (id.startsWith('benchmark:')) {
    const b = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === b)?.name ?? b;
  }
  return getMovementById(id)?.name ?? id;
}

/** «5 × 5 · 100 kg» o «12 min» o «3 rondas»: lo que el atleta necesita ver de un vistazo. */
function detailOf(b: SessionBlockResult): string {
  const volume = b.sets && b.reps ? `${b.sets} × ${b.reps}` : b.reps ?? (b.sets ? `${b.sets} series` : '');
  const load = b.loadKg ? ` · ${fmtKgValue(b.loadKg)} ${loadUnitLabel(b.movementId, b.block)}` : '';
  return `${volume}${load}`.trim();
}

/** Si la sesión lleva una rampa serie a serie, se enseña corta debajo («60×5 · 70×3 · 80×1»). */
function rampOf(b: SessionBlockResult): string | null {
  if (!b.setPlan || b.setPlan.length < 2) return null;
  return b.setPlan.map((s) => `${fmtKgValue(s.kg)}×${s.reps}`).join(' · ');
}

function loggedOf(b: SessionBlockResult, log: WorkSetEntry[]): { done: number; total: number } | null {
  if (b.block !== 'strength' && b.block !== 'oly') return null;
  const total = b.setPlan && b.setPlan.length >= 2 ? b.setPlan.length : b.sets ?? 0;
  if (total < 1) return null;
  const mid = b.complex ? complexLogId(b.complex.id) : b.movementId;
  const done = log.filter((e) => e.movementId === mid && e.setNumber >= 1 && e.setNumber <= total).length;
  return done > 0 ? { done: Math.min(done, total), total } : null;
}

interface Row {
  key: string;
  entry: SessionBlockResult;
}

type Section =
  | { key: string; block: Exclude<Block, 'wod'>; rows: Row[] }
  | { key: string; block: 'wod'; part: 1 | 2 | null; rows: Row[] };

function Pill({ onClick, label, children, testId }: { onClick: () => void; label: string; children: React.ReactNode; testId?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className="flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-bold text-white active:bg-white/20"
    >
      {children}
    </button>
  );
}

export interface TrainListProps {
  session: DailySession;
  todayWorkLog: WorkSetEntry[];
  /** Cerrar la lista sin terminar (la sesión sigue como estaba). */
  onExit: () => void;
  /** «Terminé»: se abren las tarjetas de revisión; los minutos que ha durado ya vienen puestos. */
  onFinish: (minutes: number) => void;
  /** «Prefiero ir apuntando serie a serie»: pasa a las tarjetas de siempre. */
  onSwitchToCards: () => void;
  onPain?: () => void;
}

export function TrainList({ session, todayWorkLog, onExit, onFinish, onSwitchToCards, onPain }: TrainListProps) {
  const visible = useVisibleViewport();
  const clockOn = useClockActive();
  const store = typeof window !== 'undefined' ? window.localStorage : null;
  const [startedAt] = useState(() => listStartedAt(store, session.date, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const block of BLOCK_ORDER) {
      const entries = session.blocks.map((entry, index) => ({ entry, index })).filter((e) => e.entry.block === block);
      if (entries.length === 0) continue;
      if (block === 'wod') {
        for (const g of groupWodByPart(entries.map((e) => e.entry), entries.map((e) => e.index))) {
          out.push({ key: `wod-${g.part ?? 0}`, block: 'wod', part: g.part, rows: g.entries.map((entry, k) => ({ key: `wod-${g.indices![k]}`, entry })) });
        }
      } else {
        out.push({ key: block, block, rows: entries.map((e) => ({ key: `${block}-${e.index}`, entry: e.entry })) });
      }
    }
    return out;
  }, [session]);

  const hasLifts = sections.some((s) => s.block === 'strength' || s.block === 'oly');

  const finish = () => {
    const minutes = elapsedMinutes(startedAt, Date.now());
    clearListStart(store);
    onFinish(minutes);
  };

  return (
    <div className="force-dark fixed inset-0 z-30 flex flex-col text-white" style={{ background: '#0b0b0e', ...(visible ?? {}) }} data-testid="train-list">
      <div className={`flex items-center gap-3 px-4 pb-2 ${clockOn ? 'pt-[calc(4.5rem+env(safe-area-inset-top))]' : 'pt-[calc(0.75rem+env(safe-area-inset-top))]'}`}>
        <button onClick={onExit} aria-label="Salir del entreno" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20">
          <X size={19} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Entrenando</p>
          <p className="text-2xl font-black leading-none tabular-nums" data-testid="train-list-elapsed">
            {clockLabel(now - startedAt)}
          </p>
        </div>
        {onPain && (
          <button onClick={onPain} aria-label="Me duele algo" data-testid="list-pain" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20">
            <HeartPulse size={19} strokeWidth={2.4} />
          </button>
        )}
      </div>

      <div className="flex gap-2 px-4 pb-2">
        <Pill onClick={() => clockBus.open('workout')} label="Abrir el cronómetro del WOD" testId="list-clock-wod">
          <Timer size={18} strokeWidth={2.5} /> Crono WOD
        </Pill>
        {hasLifts && (
          <Pill onClick={() => clockBus.open('rest')} label="Abrir el descanso" testId="list-clock-rest">
            <Hourglass size={18} strokeWidth={2.5} /> Descanso
          </Pill>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {sections.map((s) => {
          const accent = ACCENT[s.block];
          const first = s.rows[0].entry;
          const isBench = s.block === 'wod' && first.movementId.startsWith('benchmark:');
          const benchWod = isBench ? benchmarkWorkouts.find((w) => w.id === first.movementId.replace('benchmark:', '')) : undefined;
          const wodFormat = s.block === 'wod' ? (isBench ? ((first.format || benchWod?.format) as string | undefined) : first.format) : undefined;
          return (
            <section key={s.key} className="mb-3 rounded-2xl bg-white/[0.05] p-3.5" data-testid="list-section" data-block={s.block}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
                  {LABEL[s.block]}
                  {s.block === 'wod' && s.part ? ` · parte ${s.part} de 2` : ''}
                </p>
                {s.block === 'wod' && (
                  <button onClick={() => clockBus.open('workout')} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${accent}26`, color: accent }}>
                    <Timer size={13} strokeWidth={2.75} /> Crono
                  </button>
                )}
              </div>
              {s.block === 'wod' ? (
                <>
                  <p className="text-lg font-extrabold leading-tight text-white [overflow-wrap:anywhere]">{isBench ? benchWod?.name ?? 'Benchmark' : first.title ?? 'WOD'}</p>
                  {wodFormat && <p className="mt-0.5 text-sm font-bold" style={{ color: accent }}>{localizeWodText(wodFormat)}</p>}
                  <ul className="mt-2 flex flex-col divide-y divide-white/10">
                    {isBench && benchWod
                      ? benchWod.movements.map((m) => (
                          <li key={m} className="py-2 text-base font-semibold text-white">
                            {nameOf(first.benchmarkSwaps?.[m] ?? m)}
                          </li>
                        ))
                      : s.rows.map((r) => (
                          <li key={r.key} className="flex items-baseline justify-between gap-3 py-2">
                            <span className="min-w-0 text-base font-semibold text-white">{nameOf(r.entry.movementId)}</span>
                            <span className="shrink-0 text-sm font-bold" style={{ color: accent }}>
                              {detailOf(r.entry)}
                            </span>
                          </li>
                        ))}
                  </ul>
                </>
              ) : (
                <ul className="flex flex-col divide-y divide-white/10">
                  {s.rows.map((r) => {
                    const ramp = rampOf(r.entry);
                    const logged = loggedOf(r.entry, todayWorkLog);
                    return (
                      <li key={r.key} className="py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 text-base font-semibold text-white">
                            {r.entry.complex ? r.entry.complex.name : nameOf(r.entry.movementId)}
                            {r.entry.subgroup ? <span className="ml-1.5 text-[11px] font-normal text-white/45">{r.entry.subgroup}</span> : null}
                          </span>
                          <span className="shrink-0 text-sm font-bold" style={{ color: accent }}>
                            {detailOf(r.entry)}
                          </span>
                        </div>
                        {ramp && <p className="mt-0.5 text-xs text-white/50">{ramp}</p>}
                        {r.entry.complex && <p className="mt-0.5 text-xs text-white/50">{r.entry.complex.steps.map((st) => `${st.reps} ${nameOf(st.movementId)}`).join(' + ')}</p>}
                        {logged && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-white/60">
                            <Check size={12} strokeWidth={3} /> {logged.done} de {logged.total} series ya anotadas
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        <button onClick={onSwitchToCards} data-testid="list-to-cards" className="mx-auto mt-1 flex items-center gap-1.5 text-xs font-semibold text-white/55 underline decoration-dotted">
          <Layers size={13} /> Prefiero ir apuntando serie a serie
        </button>
      </div>

      <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
        <button
          onClick={finish}
          data-testid="list-finish"
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-center text-[clamp(0.95rem,4.6vw,1.125rem)] font-bold leading-tight text-black shadow-lg shadow-black/30 transition-transform duration-150 active:scale-[0.98]"
        >
          Terminé · anotar lo que hice
        </button>
      </div>
    </div>
  );
}
