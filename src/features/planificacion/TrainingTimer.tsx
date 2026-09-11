import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Pause, Play, RotateCcw, X, Minus, Plus } from 'lucide-react';

const PRESETS = [60, 90, 120, 180];

type TimerMode = 'rest' | 'workout';

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

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (type: string, cb: () => void) => void };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

/**
 * Mantiene la pantalla encendida mientras `active` es true — para que el reloj de entreno se pueda
 * leer sin tocar el móvil a mitad de un AMRAP. Usa la Screen Wake Lock API (Chrome/Android y
 * Safari/iOS 16.4+ instalada como PWA); si el navegador no la soporta, `supported` es false y no se
 * rompe nada, solo no hay garantía de pantalla encendida. Se reengancha sola si el móvil se bloquea
 * y el atleta vuelve a la app (`visibilitychange`).
 */
function useWakeLock(active: boolean): { held: boolean; supported: boolean } {
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const release = useCallback(() => {
    sentinelRef.current?.release().catch(() => {});
    sentinelRef.current = null;
    setHeld(false);
  }, []);

  const acquire = useCallback(async () => {
    try {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock) return;
      const sentinel = await nav.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setHeld(true);
      sentinel.addEventListener?.('release', () => setHeld(false));
    } catch {
      setHeld(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      release();
      return;
    }
    acquire();
    return () => release();
  }, [active, acquire, release]);

  useEffect(() => {
    const onVisibility = () => {
      if (active && document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active, acquire]);

  return { held, supported };
}

/**
 * Reloj flotante del entreno — un único botón en la esquina con dos pestañas:
 * - **Descanso**: cuenta atrás entre series (presets 60/90/120/180 s, ajuste ±15, pitido + vibración
 *   al llegar a 0). Es el cronómetro que ya había.
 * - **Entreno**: cronómetro ascendente para cronometrar el bloque entero (AMRAP, EMOM, For Time),
 *   con contador de rondas y la pantalla encendida mientras corre.
 * Vive mientras haya una sesión activa en Planificación; el estado se pierde al salir de la
 * pestaña, aceptable para un reloj que solo importa durante el entreno de hoy.
 */
export function TrainingTimer() {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimerMode>('rest');

  // Descanso — cuenta atrás.
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

  // Entreno — cronómetro ascendente + rondas.
  const [workoutElapsed, setWorkoutElapsed] = useState(0);
  const [workoutRunning, setWorkoutRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const workoutStartRef = useRef<number | null>(null);
  const workoutRafRef = useRef<number | null>(null);
  const wakeLock = useWakeLock(workoutRunning);

  const workoutTick = useCallback(() => {
    if (workoutStartRef.current == null) return;
    setWorkoutElapsed((Date.now() - workoutStartRef.current) / 1000);
    workoutRafRef.current = window.setTimeout(workoutTick, 200);
  }, []);

  useEffect(() => {
    if (workoutRunning) {
      workoutStartRef.current = Date.now() - workoutElapsed * 1000;
      workoutRafRef.current = window.setTimeout(workoutTick, 200);
    }
    return () => {
      if (workoutRafRef.current != null) window.clearTimeout(workoutRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutRunning, workoutTick]);

  const toggleWorkout = () => setWorkoutRunning((r) => !r);
  const resetWorkout = () => {
    setWorkoutRunning(false);
    setWorkoutElapsed(0);
    setRounds(0);
    workoutStartRef.current = null;
  };

  const openTo = (m: TimerMode) => {
    setMode(m);
    setExpanded(true);
  };

  if (!expanded) {
    if (running || done) {
      return (
        <button
          onClick={() => openTo('rest')}
          aria-label="Cronómetro de descanso"
          className={`fixed bottom-24 right-4 z-40 flex h-14 min-w-14 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6 ${
            done ? 'animate-pulse bg-brand-orange text-black' : 'bg-brand-gold text-black'
          }`}
        >
          {mmss(remaining)}
        </button>
      );
    }
    if (workoutRunning) {
      return (
        <button
          onClick={() => openTo('workout')}
          aria-label="Reloj de entreno"
          className="fixed bottom-24 right-4 z-40 flex h-14 min-w-14 items-center justify-center gap-1.5 rounded-full bg-brand-neon px-3 text-sm font-bold text-black shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6"
        >
          {mmss(workoutElapsed)}
        </button>
      );
    }
    return (
      <button
        onClick={() => setExpanded(true)}
        aria-label="Reloj de entreno"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-surface text-neutral-300 shadow-lg shadow-black/40 ring-1 ring-brand-border transition-colors duration-200 md:bottom-6"
      >
        <Timer size={20} strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-64 rounded-2xl bg-brand-surface p-3.5 shadow-2xl shadow-black/50 ring-1 ring-brand-border md:bottom-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-0.5 rounded-lg bg-white/5 p-0.5">
          <button
            onClick={() => setMode('rest')}
            className={`flex-1 rounded-md py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              mode === 'rest' ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Descanso
          </button>
          <button
            onClick={() => setMode('workout')}
            className={`flex-1 rounded-md py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              mode === 'workout' ? 'bg-brand-neon text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Entreno
          </button>
        </div>
        <button onClick={() => setExpanded(false)} className="shrink-0 text-neutral-500 hover:text-white" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {mode === 'rest' ? (
        <>
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
        </>
      ) : (
        <>
          <p className="text-center text-4xl font-bold tabular-nums text-white">{mmss(workoutElapsed)}</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${wakeLock.held ? 'bg-brand-neon' : 'bg-neutral-600'}`}
              aria-hidden="true"
            />
            {wakeLock.held
              ? 'Pantalla activa'
              : wakeLock.supported
                ? 'Pantalla puede apagarse'
                : 'Tu navegador no soporta mantener la pantalla activa'}
          </p>

          <div className="my-2.5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Rondas</span>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setRounds((r) => Math.max(0, r - 1))}
                aria-label="Restar ronda"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-neutral-300 hover:bg-white/10"
              >
                <Minus size={12} strokeWidth={2.5} />
              </button>
              <span className="w-4 text-center text-sm font-bold tabular-nums text-white">{rounds}</span>
              <button
                onClick={() => setRounds((r) => r + 1)}
                aria-label="Sumar ronda"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-neutral-300 hover:bg-white/10"
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleWorkout}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-neon py-2 text-sm font-bold text-black transition-colors duration-200 hover:opacity-90"
            >
              {workoutRunning ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
              {workoutRunning ? 'Pausa' : workoutElapsed > 0 ? 'Reanudar' : 'Empezar'}
            </button>
            <button
              onClick={resetWorkout}
              className="rounded-lg bg-white/5 px-2 py-2 text-neutral-300 hover:bg-white/10"
              aria-label="Reiniciar"
            >
              <RotateCcw size={15} strokeWidth={2.25} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
