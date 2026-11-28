import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeartRateMonitor, type HrDevice } from './heartRateMonitor';

/** Una pulsera de mentira: se conecta, emite cifras y se cae cuando se le pide. */
function fakeStrap() {
  const characteristic = Object.assign(new EventTarget(), { value: undefined as DataView | undefined, startNotifications: vi.fn(async () => undefined) });
  const connect = vi.fn(async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }));
  const device = Object.assign(new EventTarget(), { name: 'Helio de prueba', gatt: { connect, disconnect: vi.fn() } }) as unknown as HrDevice;
  return {
    device,
    connect,
    beat(bpm: number) {
      characteristic.value = new DataView(Uint8Array.from([0, bpm]).buffer);
      characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    },
    drop: () => device.dispatchEvent(new Event('gattserverdisconnected')),
  };
}

describe('la conexión con la pulsera', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (request?: () => Promise<HrDevice>) => {
    const strap = fakeStrap();
    const state = { hidden: false };
    const monitor = createHeartRateMonitor({ bluetooth: () => ({ requestDevice: request ?? (async () => strap.device) }), hidden: () => state.hidden });
    return { strap, state, monitor };
  };

  it('conecta, enseña el pulso y avisa a quien escucha', async () => {
    const { strap, monitor } = setup();
    const seen = vi.fn();
    monitor.subscribe(seen);
    await monitor.connect();
    expect(monitor.snapshot()).toMatchObject({ status: 'connected', device: 'Helio de prueba', bpm: null });
    strap.beat(131);
    strap.beat(135);
    expect(monitor.snapshot().bpm).toBe(135);
    expect(monitor.snapshot().session).toMatchObject({ count: 2, max: 135, cuts: 0 });
    expect(seen).toHaveBeenCalled();
    monitor.disconnect();
  });

  it('si se cae sola, reintenta hasta volver y lo cuenta como corte', async () => {
    const { strap, monitor } = setup();
    await monitor.connect();
    strap.beat(120);
    strap.connect.mockRejectedValueOnce(new Error('fuera de alcance'));
    strap.drop();
    expect(monitor.snapshot()).toMatchObject({ status: 'reconnecting', bpm: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.snapshot().status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(monitor.snapshot().status).toBe('connected');
    strap.beat(125);
    // Sin duplicar la escucha: una cifra, una medición.
    expect(monitor.snapshot().session).toMatchObject({ count: 2, cuts: 1 });
    monitor.disconnect();
  });

  it('se rinde a los 10 minutos', async () => {
    const { strap, monitor } = setup();
    await monitor.connect();
    strap.beat(120);
    strap.connect.mockRejectedValue(new Error('apagada'));
    strap.drop();
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    expect(monitor.snapshot().status).toBe('error');
    expect(monitor.snapshot().session.endedAt).not.toBeNull();
    const tries = strap.connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(strap.connect.mock.calls.length).toBe(tries);
  });

  it('al parar no reintenta y conserva cómo fue la prueba', async () => {
    const { strap, monitor } = setup();
    await monitor.connect();
    strap.beat(120);
    monitor.disconnect();
    strap.drop();
    strap.beat(130);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(monitor.snapshot()).toMatchObject({ status: 'idle', bpm: null });
    expect(monitor.snapshot().session).toMatchObject({ count: 1, cuts: 0 });
    expect(strap.connect).toHaveBeenCalledTimes(1);
  });

  it('un hueco con la app oculta queda señalado', async () => {
    const { strap, state, monitor } = setup();
    await monitor.connect();
    strap.beat(120);
    state.hidden = true;
    monitor.visibility();
    await vi.advanceTimersByTimeAsync(40_000);
    state.hidden = false;
    monitor.visibility();
    strap.beat(140);
    expect(monitor.snapshot().session).toMatchObject({ gapMs: 40_000, gapHidden: true });
    monitor.disconnect();
  });

  it('cerrar la lista sin elegir no es un error; un fallo sí', async () => {
    const cancelled = setup(async () => {
      throw Object.assign(new Error('cancelado'), { name: 'NotFoundError' });
    });
    await cancelled.monitor.connect();
    expect(cancelled.monitor.snapshot().status).toBe('idle');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = setup();
    broken.strap.connect.mockRejectedValueOnce(new Error('sin servicio'));
    await broken.monitor.connect();
    expect(broken.monitor.snapshot().status).toBe('error');
    warn.mockRestore();
  });

  it('sin Bluetooth en el navegador no hace nada', async () => {
    const monitor = createHeartRateMonitor({ bluetooth: () => undefined, hidden: () => false });
    expect(monitor.supported()).toBe(false);
    await monitor.connect();
    expect(monitor.snapshot().status).toBe('idle');
  });
});
