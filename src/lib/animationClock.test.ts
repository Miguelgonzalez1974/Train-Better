import { afterEach, describe, expect, it, vi } from 'vitest';
import { animationSubscribers, subscribeAnimation } from './animationClock';

describe('reloj de animación compartido', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('un solo bucle para todos: pide fotogramas mientras haya suscritos y para al quedarse sin ninguno', () => {
    let callback: FrameRequestCallback | null = null;
    const request = vi.fn((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAnimation(a);
    const offB = subscribeAnimation(b);
    expect(animationSubscribers()).toBe(2);
    expect(request).toHaveBeenCalledTimes(1);

    callback!(1000);
    callback!(1016);
    expect(a).toHaveBeenLastCalledWith(expect.closeTo(0.016, 3));
    expect(b).toHaveBeenCalledTimes(2);

    offA();
    callback!(1032);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);

    offB();
    expect(animationSubscribers()).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });

  it('un salto largo (pestaña en segundo plano) no hace saltar la animación: el paso se recorta', () => {
    let callback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const fn = vi.fn();
    const off = subscribeAnimation(fn);
    callback!(0);
    callback!(60000);
    expect(fn).toHaveBeenLastCalledWith(0.1);
    off();
  });
});
