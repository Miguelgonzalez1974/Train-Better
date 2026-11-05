import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Pause, Play, SkipForward, X } from 'lucide-react';
import { MOBILITY_ZONE_LABEL, mobilityVideoUrl } from '../../data/mobility';
import { expandPhases, type RoutineItem } from '../../engine/mobility';

/** Un pitido corto de vibración al cambiar de ejercicio o de lado, si el móvil lo permite. */
function nudge() {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* sin vibración */
  }
}

/**
 * La rutina paso a paso: el ejercicio, la cuenta atrás y qué lado toca (los ejercicios de dos lados son dos fases seguidas). Pasa solo
 * al siguiente al acabar el tiempo; «Me molesta» salta el ejercicio entero. Entrega a `onFinish` cuántas fases se hicieron y cuántos
 * segundos pasaron de verdad, para apuntar los minutos reales.
 */
export function MobilityGuide({
  items,
  onFinish,
  onExit,
}: {
  items: RoutineItem[];
  onFinish: (donePhases: number, totalPhases: number, elapsedSeconds: number) => void;
  onExit: () => void;
}) {
  const phases = useMemo(() => expandPhases(items), [items]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(phases[0]?.seconds ?? 0);
  const [paused, setPaused] = useState(false);
  const [skippedNote, setSkippedNote] = useState(false);
  const elapsed = useRef(0);
  /** Fases hechas de verdad (las saltadas con «me molesta» no cuentan). */
  const done = useRef(0);

  const phase = phases[i];

  useEffect(() => {
    if (paused || !phase) return;
    const id = window.setInterval(() => {
      elapsed.current += 1;
      setLeft((l) => l - 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, phase]);

  function goTo(next: number, counted: boolean) {
    if (counted) done.current += 1;
    if (next >= phases.length) {
      onFinish(done.current, phases.length, elapsed.current);
      return;
    }
    nudge();
    setI(next);
    setLeft(phases[next].seconds);
    setSkippedNote(false);
  }

  useEffect(() => {
    if (phase && left <= 0) goTo(i + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  if (!phase) return null;

  /** Salta al primer ejercicio distinto del actual. */
  function hurt() {
    const next = phases.findIndex((p, k) => k > i && p.index !== phase.index);
    setSkippedNote(true);
    window.setTimeout(() => goTo(next === -1 ? phases.length : next, false), 1400);
  }

  const pct = Math.round((1 - left / phase.seconds) * 100);

  return (
    <div className="flex flex-col gap-4" aria-label="Rutina en marcha">
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={phases.length} aria-valuenow={i}>
        {phases.map((_, k) => (
          <span key={k} className={`h-1 flex-1 rounded-full ${k < i ? 'bg-good' : k === i ? 'bg-brand-orange' : 'bg-white/10'}`} />
        ))}
      </div>

      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          {MOBILITY_ZONE_LABEL[phase.exercise.zones[0]]} · {phase.index + 1} de {items.length}
        </p>
        <p className="num mt-2 text-6xl font-semibold leading-none text-white" aria-live="off">
          {Math.max(0, left)}
        </p>
        <p className="mt-3 text-lg font-semibold text-white">{phase.exercise.name}</p>
        {phase.sides === 2 && <p className="mt-1 text-xs font-semibold text-brand-orange">{phase.side === 1 ? 'Primer lado' : 'Cambia de lado'}</p>}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-good transition-[width] duration-700 ease-linear motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-center text-[13px] leading-relaxed text-neutral-300">
        {skippedNote ? 'Vale, lo salto. Si la zona te molesta, avísale a Rex en Planificación para que la tenga en cuenta.' : phase.exercise.how}
      </p>

      <a
        href={mobilityVideoUrl(phase.exercise)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-white"
      >
        Ver cómo se hace <ExternalLink size={10} aria-hidden="true" />
      </a>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-1.5 rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:border-white/30"
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {paused ? 'Seguir' : 'Pausa'}
        </button>
        <button
          onClick={() => goTo(i + 1, true)}
          className="flex items-center gap-1.5 rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark"
        >
          <SkipForward size={14} aria-hidden="true" /> Siguiente
        </button>
        <button onClick={hurt} disabled={skippedNote} className="rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:border-warn/60 disabled:opacity-40">
          Me molesta
        </button>
      </div>

      <button onClick={() => (done.current / phases.length >= 0.5 ? onFinish(done.current, phases.length, elapsed.current) : onExit())} className="mx-auto flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
        <X size={12} aria-hidden="true" /> Parar
      </button>
    </div>
  );
}
