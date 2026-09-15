import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Pause, Play, RotateCcw, X, Minus, Plus } from 'lucide-react';

const PRESETS = [60, 90, 120, 180];
const PRE_START_SECONDS = 10;
const TABATA_DEFAULT_WORK = 20;
const TABATA_DEFAULT_REST = 10;
const TABATA_DEFAULT_ROUNDS = 8;

type TimerMode = 'rest' | 'workout' | 'tabata';

function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pitido corto sin assets — oscilador de Web Audio. Silencioso si el navegador no lo permite. */
function beep(freq = 880, ms = 500) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
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

/** Interruptor "mantener pantalla activa" — compartido entre Entreno y Tabata. */
function ScreenLockToggle({
  screenLockOn,
  supported,
  onChange,
}: {
  screenLockOn: boolean;
  supported: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
      <span className="text-xs font-semibold text-neutral-300">Mantener pantalla activa</span>
      <button
        role="switch"
        aria-checked={screenLockOn}
        aria-label="Mantener pantalla activa durante el entreno"
        onClick={() => onChange(!screenLockOn)}
        disabled={!supported}
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
  );
}

/** Frase de estado del wake lock — compartida entre Entreno y Tabata (cada una con su propio `running`). */
function WakeLockStatusLine({
  supported,
  screenLockOn,
  running,
  held,
}: {
  supported: boolean;
  screenLockOn: boolean;
  running: boolean;
  held: boolean;
}) {
  return (
    <p className="mb-2 mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${held ? 'bg-brand-neon' : 'bg-neutral-600'}`} aria-hidden="true" />
      {!supported
        ? 'Tu navegador no permite mantener la pantalla activa.'
        : !screenLockOn
          ? 'Desactivado — la pantalla puede apagarse sola.'
          : !running
            ? 'Se activará al pulsar Empezar.'
            : held
              ? 'Pantalla activa mientras entrenas.'
              : 'No se pudo activar — si estás en iPhone, añade la app a tu pantalla de inicio; si no, revisa el ahorro de batería.'}
    </p>
  );
}

/** Fila de ajuste ±paso para la configuración del Tabata (trabajo/descanso/rondas). */
function TabataConfigRow({
  label,
  value,
  suffix,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  step: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Restar ${label.toLowerCase()}`}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-neutral-300 hover:bg-white/10"
        >
          <Minus size={12} strokeWidth={2.5} />
        </button>
        <span className="w-12 text-center text-sm font-bold tabular-nums text-white">
          {value}
          {suffix}
        </span>
        <button
          onClick={() => onChange(value + step)}
          aria-label={`Sumar ${label.toLowerCase()}`}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-neutral-300 hover:bg-white/10"
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/**
 * Reloj flotante del entreno — un único botón en la esquina con tres pestañas:
 * - **Descanso**: cuenta atrás entre series (presets 60/90/120/180 s, ajuste ±15, pitido + vibración
 *   al llegar a 0).
 * - **Entreno**: cronómetro ascendente para cronometrar el bloque entero (AMRAP, EMOM, For Time),
 *   con contador de rondas manual y la pantalla encendida mientras corre.
 * - **Tabata**: trabajo/descanso automático con rondas (20/10×8 por defecto, ajustable), cambia de
 *   fase sola con pitido + vibración, también con pantalla activa.
 * Entreno y Tabata arrancan con una cuenta atrás de preparación de `PRE_START_SECONDS` — tiempo para
 * colocarte antes de que el crono empiece de verdad; se puede saltar tocando la pantalla. Solo se
 * muestra en el arranque en frío, no al reanudar tras una pausa.
 * Vive mientras haya una sesión activa en Planificación; el estado se pierde al salir de la
 * pestaña, aceptable para un reloj que solo importa durante el entreno de hoy.
 */
export function TrainingTimer() {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimerMode>('rest');
  const wakeLock = useWakeLock();
  const [screenLockOn, setScreenLockOn] = useState<boolean>(readScreenLockPref);

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

  // Entreno — cronómetro ascendente + rondas manuales.
  const [workoutElapsed, setWorkoutElapsed] = useState(0);
  const [workoutRunning, setWorkoutRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const workoutStartRef = useRef<number | null>(null);
  const workoutRafRef = useRef<number | null>(null);

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
    if (on && (workoutRunning || tabataRunning)) wakeLock.request();
    else if (!on) wakeLock.release();
  };

  // Tabata — trabajo/descanso automático con rondas.
  const [tabataWork, setTabataWork] = useState(TABATA_DEFAULT_WORK);
  const [tabataRest, setTabataRest] = useState(TABATA_DEFAULT_REST);
  const [tabataTotalRounds, setTabataTotalRounds] = useState(TABATA_DEFAULT_ROUNDS);
  const [tabataPhase, setTabataPhase] = useState<'work' | 'rest'>('work');
  const [tabataRound, setTabataRound] = useState(0); // 0 = aun no arrancado
  const [tabataRemaining, setTabataRemaining] = useState(TABATA_DEFAULT_WORK);
  const [tabataRunning, setTabataRunning] = useState(false);
  const [tabataDone, setTabataDone] = useState(false);
  const tabataEndRef = useRef<number | null>(null);
  const tabataRafRef = useRef<number | null>(null);
  // Refs con el valor "vivo" de fase/ronda para que el tick (deps estables) nunca lea un cierre viejo.
  const tabataPhaseRef = useRef<'work' | 'rest'>('work');
  const tabataRoundRef = useRef(0);

  const tabataTick = useCallback(() => {
    if (tabataEndRef.current == null) return;
    const left = (tabataEndRef.current - Date.now()) / 1000;
    if (left > 0) {
      setTabataRemaining(left);
      tabataRafRef.current = window.setTimeout(tabataTick, 200);
      return;
    }
    const wasWork = tabataPhaseRef.current === 'work';
    if (wasWork && tabataRoundRef.current >= tabataTotalRounds) {
      setTabataRemaining(0);
      setTabataRunning(false);
      setTabataDone(true);
      tabataEndRef.current = null;
      beep(660, 700);
      navigator.vibrate?.([200, 100, 200, 100, 200]);
      wakeLock.release();
      return;
    }
    let nextPhase: 'work' | 'rest';
    let nextRound = tabataRoundRef.current;
    let nextDuration: number;
    if (wasWork && tabataRest > 0) {
      nextPhase = 'rest';
      nextDuration = tabataRest;
    } else {
      nextPhase = 'work';
      nextRound = tabataRoundRef.current + 1;
      nextDuration = tabataWork;
    }
    tabataPhaseRef.current = nextPhase;
    tabataRoundRef.current = nextRound;
    setTabataPhase(nextPhase);
    setTabataRound(nextRound);
    setTabataRemaining(nextDuration);
    tabataEndRef.current = Date.now() + nextDuration * 1000;
    beep();
    navigator.vibrate?.(120);
    tabataRafRef.current = window.setTimeout(tabataTick, 200);
    // wakeLock.release (no el objeto wakeLock entero, que es literal nuevo cada render) — asi el
    // tick no se recrea en cada renderizado mientras corre y no se solapan cadenas de setTimeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabataTotalRounds, tabataRest, tabataWork, wakeLock.release]);

  useEffect(() => {
    if (tabataRunning) {
      tabataEndRef.current = Date.now() + tabataRemaining * 1000;
      tabataRafRef.current = window.setTimeout(tabataTick, 200);
    }
    return () => {
      if (tabataRafRef.current != null) window.clearTimeout(tabataRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabataRunning, tabataTick]);

  const toggleTabata = () => {
    if (tabataDone || tabataRound === 0) return startWithPreStart('tabata');
    const next = !tabataRunning;
    setTabataRunning(next);
    if (next && screenLockOn) wakeLock.request();
    else wakeLock.release();
  };
  const resetTabata = () => {
    setTabataRunning(false);
    setTabataDone(false);
    setTabataPhase('work');
    setTabataRound(0);
    tabataPhaseRef.current = 'work';
    tabataRoundRef.current = 0;
    setTabataRemaining(tabataWork);
    tabataEndRef.current = null;
    wakeLock.release();
  };

  // Si el móvil se bloquea y vuelve a mitad de entreno, reengancha la pantalla activa.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (workoutRunning || tabataRunning) && screenLockOn) wakeLock.request();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutRunning, tabataRunning, screenLockOn]);

  // Cuenta atrás de preparación (Entreno/Tabata) — arranque en frío solamente, nunca al reanudar.
  const [preStartFor, setPreStartFor] = useState<'workout' | 'tabata' | null>(null);
  const [preStartRemaining, setPreStartRemaining] = useState(PRE_START_SECONDS);

  function reallyStartWorkout() {
    setWorkoutRunning(true);
  }
  function reallyStartTabata() {
    tabataPhaseRef.current = 'work';
    tabataRoundRef.current = 1;
    setTabataDone(false);
    setTabataPhase('work');
    setTabataRound(1);
    setTabataRemaining(tabataWork);
    setTabataRunning(true);
  }
  function beginReal(forMode: 'workout' | 'tabata') {
    if (forMode === 'workout') reallyStartWorkout();
    else reallyStartTabata();
  }
  function startWithPreStart(forMode: 'workout' | 'tabata') {
    if (screenLockOn) wakeLock.request();
    setPreStartFor(forMode);
    setPreStartRemaining(PRE_START_SECONDS);
  }
  function skipPreStart() {
    if (preStartFor == null) return;
    const forMode = preStartFor;
    setPreStartFor(null);
    beginReal(forMode);
  }

  useEffect(() => {
    if (preStartFor == null) return;
    if (preStartRemaining <= 0) {
      const forMode = preStartFor;
      setPreStartFor(null);
      beep(660, 700);
      navigator.vibrate?.(250);
      beginReal(forMode);
      return;
    }
    if (preStartRemaining <= 3) {
      beep();
      navigator.vibrate?.(80);
    }
    const id = window.setTimeout(() => setPreStartRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preStartFor, preStartRemaining]);

  const handleWorkoutButton = () => {
    if (workoutRunning) return toggleWorkout();
    if (workoutElapsed > 0) return toggleWorkout();
    startWithPreStart('workout');
  };

  const openTo = (m: TimerMode) => {
    setMode(m);
    setExpanded(true);
  };

  if (!expanded) {
    if (preStartFor) {
      return (
        <button
          onClick={() => openTo(preStartFor)}
          aria-label="Cuenta atrás de inicio"
          className="fixed bottom-24 right-4 z-40 flex h-16 min-w-16 items-center justify-center gap-1.5 rounded-full bg-brand-orange px-3.5 text-base font-bold text-black shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6"
        >
          {preStartRemaining}
        </button>
      );
    }
    if (running || done) {
      return (
        <button
          onClick={() => openTo('rest')}
          aria-label="Cronómetro de descanso"
          className={`fixed bottom-24 right-4 z-40 flex h-16 min-w-16 items-center justify-center gap-1.5 rounded-full px-3.5 text-base font-bold shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6 ${
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
          className="fixed bottom-24 right-4 z-40 flex h-16 min-w-16 items-center justify-center gap-1.5 rounded-full bg-brand-neon px-3.5 text-base font-bold text-black shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6"
        >
          {mmss(workoutElapsed)}
        </button>
      );
    }
    if (tabataRunning || tabataDone) {
      return (
        <button
          onClick={() => openTo('tabata')}
          aria-label="Reloj Tabata"
          className={`fixed bottom-24 right-4 z-40 flex h-16 min-w-16 items-center justify-center gap-1.5 rounded-full px-3.5 text-base font-bold text-black shadow-lg shadow-black/40 transition-colors duration-200 md:bottom-6 ${
            tabataDone ? 'animate-pulse bg-brand-orange' : tabataPhase === 'work' ? 'bg-brand-orange' : 'bg-brand-gold'
          }`}
        >
          {tabataDone ? 'Listo' : mmss(tabataRemaining)}
        </button>
      );
    }
    return (
      <button
        onClick={() => setExpanded(true)}
        aria-label="Reloj de entreno"
        className="fixed bottom-24 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-brand-surface text-neutral-300 shadow-lg shadow-black/40 ring-1 ring-brand-border transition-colors duration-200 md:bottom-6"
      >
        <Timer size={22} strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-72 rounded-2xl bg-brand-surface p-4 shadow-2xl shadow-black/50 ring-1 ring-brand-border md:bottom-6">
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
          <button
            onClick={() => setMode('tabata')}
            className={`flex-1 rounded-md py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              mode === 'tabata' ? 'bg-brand-orange text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Tabata
          </button>
        </div>
        <button onClick={() => setExpanded(false)} className="shrink-0 text-neutral-500 hover:text-white" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {preStartFor === mode ? (
        <button onClick={skipPreStart} className="flex w-full flex-col items-center gap-1 py-2" aria-label="Saltar cuenta atrás y empezar ya">
          <span className="text-xs font-bold uppercase tracking-wide text-brand-orange">Prepárate</span>
          <span className="text-8xl font-bold tabular-nums text-white">{preStartRemaining}</span>
          <span className="my-2 flex gap-1">
            {Array.from({ length: PRE_START_SECONDS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < PRE_START_SECONDS - preStartRemaining ? 'bg-brand-neon' : 'bg-white/15'}`}
              />
            ))}
          </span>
          <span className="text-[11px] text-neutral-500">toca para saltar y empezar ya</span>
        </button>
      ) : mode === 'rest' ? (
        <>
          <p className={`text-center text-5xl font-bold tabular-nums ${done ? 'text-brand-orange' : 'text-white'}`}>{mmss(remaining)}</p>

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
            <button onClick={() => adjust(-15)} className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10">
              −15
            </button>
            <button
              onClick={toggle}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-orange py-2 text-sm font-bold text-black transition-colors duration-200 hover:bg-brand-orange-dark"
            >
              {running ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
              {running ? 'Pausa' : done ? 'Otra vez' : 'Empezar'}
            </button>
            <button onClick={() => adjust(15)} className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/10">
              +15
            </button>
            <button onClick={reset} className="rounded-lg bg-white/5 px-2 py-2 text-neutral-300 hover:bg-white/10" aria-label="Reiniciar">
              <RotateCcw size={15} strokeWidth={2.25} />
            </button>
          </div>
        </>
      ) : mode === 'workout' ? (
        <>
          <p className="text-center text-5xl font-bold tabular-nums text-white">{mmss(workoutElapsed)}</p>

          <ScreenLockToggle screenLockOn={screenLockOn} supported={wakeLock.supported} onChange={setScreenLock} />
          <WakeLockStatusLine supported={wakeLock.supported} screenLockOn={screenLockOn} running={workoutRunning} held={wakeLock.held} />

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
              onClick={handleWorkoutButton}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-neon py-2 text-sm font-bold text-black transition-colors duration-200 hover:opacity-90"
            >
              {workoutRunning ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
              {workoutRunning ? 'Pausa' : workoutElapsed > 0 ? 'Reanudar' : 'Empezar'}
            </button>
            <button onClick={resetWorkout} className="rounded-lg bg-white/5 px-2 py-2 text-neutral-300 hover:bg-white/10" aria-label="Reiniciar">
              <RotateCcw size={15} strokeWidth={2.25} />
            </button>
          </div>
        </>
      ) : (
        <>
          {tabataRound === 0 && !tabataDone ? (
            <>
              <p className="text-center text-sm font-semibold text-neutral-400">
                {tabataTotalRounds} rondas · {tabataWork}s trabajo / {tabataRest}s descanso
              </p>
              <div className="my-2.5 flex flex-col gap-1.5">
                <TabataConfigRow label="Trabajo" value={tabataWork} suffix="s" step={5} min={5} onChange={setTabataWork} />
                <TabataConfigRow label="Descanso" value={tabataRest} suffix="s" step={5} min={0} onChange={setTabataRest} />
                <TabataConfigRow label="Rondas" value={tabataTotalRounds} suffix="" step={1} min={1} onChange={setTabataTotalRounds} />
              </div>
            </>
          ) : (
            <>
              <p className={`text-center text-xs font-bold uppercase tracking-wide ${tabataDone ? 'text-brand-orange' : tabataPhase === 'work' ? 'text-brand-orange' : 'text-brand-gold'}`}>
                {tabataDone ? '¡Tabata completo!' : tabataPhase === 'work' ? 'Trabajo' : 'Descanso'}
              </p>
              <p className={`text-center text-5xl font-bold tabular-nums ${tabataDone ? 'text-brand-orange' : 'text-white'}`}>
                {tabataDone ? `${tabataTotalRounds}/${tabataTotalRounds}` : mmss(tabataRemaining)}
              </p>
              <p className="mb-1 mt-1 text-center text-[11px] text-neutral-500">
                {tabataDone ? 'Bien hecho.' : `Ronda ${tabataRound} de ${tabataTotalRounds}`}
              </p>
            </>
          )}

          <ScreenLockToggle screenLockOn={screenLockOn} supported={wakeLock.supported} onChange={setScreenLock} />
          <WakeLockStatusLine supported={wakeLock.supported} screenLockOn={screenLockOn} running={tabataRunning} held={wakeLock.held} />

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              onClick={toggleTabata}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-orange py-2 text-sm font-bold text-black transition-colors duration-200 hover:opacity-90"
            >
              {tabataRunning ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
              {tabataRunning ? 'Pausa' : tabataDone ? 'Otra vez' : tabataRound > 0 ? 'Reanudar' : 'Empezar'}
            </button>
            <button onClick={resetTabata} className="rounded-lg bg-white/5 px-2 py-2 text-neutral-300 hover:bg-white/10" aria-label="Reiniciar">
              <RotateCcw size={15} strokeWidth={2.25} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
