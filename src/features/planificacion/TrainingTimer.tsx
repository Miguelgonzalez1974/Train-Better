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

const SCREEN_LOCK_KEY = 'train-better:screen-lock';

/** Preferencia del atleta ("mantener pantalla activa") — encendida por defecto la primera vez. */
function readScreenLockPref(): boolean {
  try {
    const v = localStorage.getItem(SCREEN_LOCK_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

/**
 * Screen Wake Lock API a bajo nivel — solo pide/suelta, sin decidir cuándo. Soportada en
 * Chrome/Android en cualquier pestaña y en Safari/iOS 16.4+ **solo si la app está instalada en la
 * pantalla de inicio** (en Safari normal la propiedad puede existir pero la petición se rechaza en
 * silencio). El llamador decide cuándo pedirla — mejor dentro del propio gesto del usuario (pulsar
 * "Empezar"), porque algunos navegadores exigen que la petición ocurra pegada a esa interacción.
 */
function useWakeLock(): { held: boolean; supported: boolean; request: () => void; release: () => void } {
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const release = useCallback(() => {
    sentinelRef.current?.release().catch(() => {});
    sentinelRef.current = null;
    setHeld(false);
  }, []);

  const request = useCallback(() => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    nav.wakeLock
      .request('screen')
      .then((sentinel) => {
        sentinelRef.current = sentinel;
        setHeld(true);
        sentinel.addEventListener?.('release', () => setHeld(false));
      })
      .catch(() => setHeld(false));
  }, []);

  useEffect(() => () => release(), [release]);

  return { held, supported, request, release };
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
  const wakeLock = useWakeLock();
  const [screenLockOn, setScreenLockOn] = useState<boolean>(readScreenLockPref);

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

  const toggleWorkout = () => {
    const next = !workoutRunning;
    setWorkoutRunning(next);
    if (next && screenLockOn) wakeLock.request();
    else wakeLock.release();
  };
  const resetWorkout = () => {
    setWorkoutRunning(false);
    setWorkoutElapsed(0);
    setRounds(0);
    workoutStartRef.current = null;
    wakeLock.release();
  };
  const setScreenLock = (on: boolean) => {
    setScreenLockOn(on);
    try {
      localStorage.setItem(SCREEN_LOCK_KEY, on ? '1' : '0');
    } catch {
      /* sin persistencia, no pasa nada */
    }
    if (on && workoutRunning) wakeLock.request();
    else if (!on) wakeLock.release();
  };

  // Si el móvil se bloquea y vuelve a mitad de entreno, reengancha la pantalla activa.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && workoutRunning && screenLockOn) wakeLock.request();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutRunning, screenLockOn]);

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

          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="text-xs font-semibold text-neutral-300">Mantener pantalla activa</span>
            <button
              role="switch"
              aria-checked={screenLockOn}
              aria-label="Mantener pantalla activa durante el entreno"
              onClick={() => setScreenLock(!screenLockOn)}
              disabled={!wakeLock.supported}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-30 ${
                screenLockOn ? 'bg-brand-neon' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-black/80 transition-transform duration-200 ${
                  screenLockOn ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="mb-2 mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${wakeLock.held ? 'bg-brand-neon' : 'bg-neutral-600'}`}
              aria-hidden="true"
            />
            {!wakeLock.supported
              ? 'Tu navegador no permite mantener la pantalla activa.'
              : !screenLockOn
                ? 'Desactivado — la pantalla puede apagarse sola.'
                : !workoutRunning
                  ? 'Se activará al pulsar Empezar.'
                  : wakeLock.held
                    ? 'Pantalla activa mientras entrenas.'
                    : 'No se pudo activar — si estás en iPhone, añade la app a tu pantalla de inicio; si no, revisa el ahorro de batería.'}
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
