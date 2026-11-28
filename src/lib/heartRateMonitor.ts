import { ended, EMPTY_HR_SESSION, parseHeartRate, withCut, withReading, type HrSession } from '../engine/heartRate';

/**
 * La conexión con la pulsera por Web Bluetooth (Chrome en Android u ordenador; no existe en iPhone). Vive fuera de las pantallas: el reloj se
 * puede cerrar o cambiar de pestaña y sigue conectada. Si se cae sola, reintenta. No guarda nada.
 */

interface HrCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<unknown>;
}

interface HrServer {
  getPrimaryService(service: string): Promise<{ getCharacteristic(name: string): Promise<HrCharacteristic> }>;
}

export interface HrDevice extends EventTarget {
  name?: string;
  gatt?: { connect(): Promise<HrServer>; disconnect(): void };
}

export interface HrBluetooth {
  requestDevice(options: unknown): Promise<HrDevice>;
}

export type HrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface HrSnapshot {
  status: HrStatus;
  /** La última medición mientras llega; null antes de la primera y tras desconectar. */
  bpm: number | null;
  device: string | null;
  session: HrSession;
  /** El reloj de la última actualización: con él se calcula cuánto hace de la última medición. */
  now: number;
  hidden: boolean;
}

/** Esperas entre reintentos (la última se repite) y cuánto se insiste antes de dejarlo. */
const RETRY_MS = [1000, 2000, 4000, 8000, 10000];
const GIVE_UP_MS = 10 * 60 * 1000;
const FILTERS = { filters: [{ services: ['heart_rate'] }, { namePrefix: 'Amazfit' }, { namePrefix: 'Helio' }], optionalServices: ['heart_rate'] };

export function createHeartRateMonitor(env: { bluetooth: () => HrBluetooth | undefined; hidden: () => boolean; now?: () => number }) {
  const now = env.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let snapshot: HrSnapshot = { status: 'idle', bpm: null, device: null, session: EMPTY_HR_SESSION, now: now(), hidden: false };
  let device: HrDevice | null = null;
  let characteristic: HrCharacteristic | null = null;
  /** Cambia con cada conexión o desconexión pedida: lo que quede a medias de la anterior se descarta. */
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let retries = 0;
  let cutAt = 0;
  let wasHidden = false;

  function set(patch: Partial<HrSnapshot>) {
    snapshot = { ...snapshot, ...patch, now: now(), hidden: env.hidden() };
    const live = snapshot.status === 'connected' || snapshot.status === 'reconnecting';
    // Mientras está viva se refresca cada segundo: así se ve cuánto lleva y si la señal se ha parado.
    if (live && !ticker) ticker = setInterval(() => set({}), 1000);
    if (!live && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    listeners.forEach((fn) => fn());
  }

  function onValue(event: Event) {
    const value = (event.target as HrCharacteristic).value;
    const bpm = value ? parseHeartRate(value) : null;
    if (bpm === null) return;
    const hidden = wasHidden || env.hidden();
    wasHidden = false;
    set({ bpm, session: withReading(snapshot.session, bpm, now(), hidden) });
  }

  function release() {
    if (retry) clearTimeout(retry);
    retry = null;
    characteristic?.removeEventListener('characteristicvaluechanged', onValue);
    characteristic = null;
  }

  async function open(token: number) {
    const server = await device!.gatt!.connect();
    const service = await server.getPrimaryService('heart_rate');
    const found = await service.getCharacteristic('heart_rate_measurement');
    if (token !== attempt) return;
    characteristic?.removeEventListener('characteristicvaluechanged', onValue);
    characteristic = found;
    found.addEventListener('characteristicvaluechanged', onValue);
    await found.startNotifications();
    if (token !== attempt) return;
    retries = 0;
    set({ status: 'connected' });
  }

  function reconnect(token: number) {
    if (retry) clearTimeout(retry);
    retry = setTimeout(
      () => {
        retry = null;
        if (token !== attempt) return;
        open(token).catch(() => {
          if (token !== attempt) return;
          if (now() - cutAt >= GIVE_UP_MS) {
            release();
            set({ status: 'error', bpm: null, session: ended(snapshot.session, now(), wasHidden) });
          } else reconnect(token);
        });
      },
      RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)],
    );
  }

  function onDisconnected(event: Event) {
    if (event.target !== device || snapshot.status !== 'connected') return;
    cutAt = now();
    retries = 0;
    set({ status: 'reconnecting', bpm: null, session: withCut(snapshot.session) });
    reconnect(attempt);
  }

  return {
    supported: () => Boolean(env.bluetooth()),
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    snapshot: () => snapshot,
    /** Tiene que llamarse desde un toque del usuario: el navegador abre la lista de aparatos. */
    async connect() {
      const bluetooth = env.bluetooth();
      if (!bluetooth || snapshot.status === 'connecting') return;
      const token = ++attempt;
      release();
      set({ status: 'connecting', bpm: null });
      try {
        const chosen = await bluetooth.requestDevice(FILTERS);
        if (token !== attempt) return;
        device?.removeEventListener('gattserverdisconnected', onDisconnected);
        device = chosen;
        chosen.addEventListener('gattserverdisconnected', onDisconnected);
        wasHidden = false;
        set({ device: chosen.name ?? null, session: EMPTY_HR_SESSION });
        await open(token);
      } catch (error) {
        if (token !== attempt) return;
        release();
        // Cerrar la lista sin elegir no es un fallo.
        const cancelled = (error as { name?: string } | null)?.name === 'NotFoundError';
        if (!cancelled) console.warn('No se ha podido conectar con la pulsera:', error);
        set({ status: cancelled ? 'idle' : 'error' });
      }
    },
    disconnect() {
      attempt++;
      release();
      const session = ended(snapshot.session, now(), wasHidden);
      set({ status: 'idle', bpm: null, session });
      device?.gatt?.disconnect();
    },
    /** La app se oculta o vuelve: se apunta para explicar los huecos y, al volver, se reintenta sin esperar. */
    visibility() {
      if (env.hidden()) wasHidden = true;
      else if (snapshot.status === 'reconnecting' && retry) {
        retries = 0;
        reconnect(attempt);
      }
    },
  };
}

export const heartRate = createHeartRateMonitor({
  bluetooth: () => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { bluetooth?: HrBluetooth }).bluetooth),
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
});

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => heartRate.visibility());
