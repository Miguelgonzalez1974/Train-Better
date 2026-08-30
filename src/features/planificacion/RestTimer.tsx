import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Pause, Play, RotateCcw, X } from 'lucide-react';

const PRESETS = [60, 90, 120, 180];

function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pitido corto sin assets — oscilador de Web Audio. Silencioso si el navegador no lo permite. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* sin sonido, no pasa nada */
  }
}

/**
 * Cronómetro de descanso flotante — la herramienta que un levantador toca entre series. Presets
 * 60/90/120/180 s, ajuste ±15, y aviso (pitido + vibración) al llegar a 0. Vive mientras haya una
 * sesión activa en Planificación; el estado se pierde al salir de la pestaña, que es aceptable para
 * un temporizador de descanso.
 */
export function RestTimer() {
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (endRef.current == null) return;
    const left = (endRef.current - Date.now()) / 1000;
    if (left <= 0) {
      setRemaining(0);
      setRunning(false);
      setDone(true);
      endRef.current = null;
      beep();
      navigator.vibrate?.([180, 90, 180]);
      return;
    }
    setRemaining(left);
    rafRef.current = window.setTimeout(tick, 200);
  }, []);

  useEffect(() => {
    if (running) {
      endRef.current = Date.now() + remaining * 1000;
      rafRef.current = window.setTimeout(tick, 200);
    }
    return () => {
      if (rafRef.current != null) window.clearTimeout(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tick]);

  const start = (secs?: number) => {
    const d = secs ?? duration;
    setDuration(d);
    setRemaining(d);
    setDone(false);
    setRunning(true);
  };
  const toggle = () => {
    if (done) return start(duration);
    setRunning((r) => !r);
  };
  const reset = () => {
    setRunning(false);
    setDone(false);
    setRemaining(duration);
    endRef.current = null;
  };
  const adjust = (delta: number) => {
    const next = Math.max(15, Math.round((running ? remaining : duration) + delta));
    if (running) {
      setRemaining(next);
      endRef.current = Date.now() + next * 1000;
    } else {
      setDuration(next);
      setRemaining(next);
    }
    setDone(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        aria-label="Cronómetro de descanso"
        className={`fixed bottom-24 right-4 z-40 flex h-14 min-w-14 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6 ${
          done
            ? 'animate-pulse bg-brand-orange text-black'
            : running
              ? 'bg-brand-gold text-black'
              : 'bg-brand-surface text-neutral-300 ring-1 ring-brand-border'
        }`}
      >
        {running || done ? mmss(remaining) : <Timer size={20} strokeWidth={2.25} />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-60 rounded-2xl bg-brand-surface p-3.5 shadow-2xl shadow-black/50 ring-1 ring-brand-border md:bottom-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Descanso</span>
        <button onClick={() => setExpanded(false)} className="text-neutral-500 hover:text-white" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      <p className={`text-center text-4xl font-bold tabular-nums ${done ? 'text-brand-orange' : 'text-white'}`}>
        {mmss(remaining)}
      </p>

      <div className="my-2.5 grid grid-cols-4 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => start(p)}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-colors duration-200 ${
              duration === p ? 'bg-brand-gold text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
            }`}
          >
            {p}s
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => adjust(-15)}
          className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10"
        >
          −15
        </button>
        <button
          onClick={toggle}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-orange py-2 text-sm font-bold text-black transition-colors duration-200 hover:bg-brand-orange-dark"
        >
          {running ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
          {running ? 'Pausa' : done ? 'Otra vez' : 'Empezar'}
        </button>
        <button
          onClick={() => adjust(15)}
          className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10"
        >
          +15
        </button>
        <button
          onClick={reset}
          className="rounded-lg bg-white/5 px-2 py-2 text-neutral-300 hover:bg-white/10"
          aria-label="Reiniciar"
        >
          <RotateCcw size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
