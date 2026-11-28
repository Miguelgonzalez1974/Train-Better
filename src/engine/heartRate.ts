/**
 * El pulso en directo de una pulsera que lo emite por Bluetooth (perfil estándar «Heart Rate»): leer cada medición y llevar la cuenta de cómo de
 * bien aguanta la conexión (cortes y huecos sin datos). De momento es una PRUEBA: no se guarda nada ni cambia la energía. Puro.
 */

/** Sin ninguna medición en este tiempo, la señal se da por perdida. */
export const HR_GAP_MS = 5000;

/** La medición de una trama «Heart Rate Measurement»; null si no vale (sin contacto con la piel o cero). */
export function parseHeartRate(data: DataView): number | null {
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  const wide = (flags & 0x01) !== 0;
  if (wide && data.byteLength < 3) return null;
  // Bits 1 y 2: si el aparato sabe decir si toca la piel (bit 2) y dice que no (bit 1 apagado), la cifra no vale.
  if ((flags & 0x04) !== 0 && (flags & 0x02) === 0) return null;
  const bpm = wide ? data.getUint16(1, true) : data.getUint8(1);
  return bpm > 0 ? bpm : null;
}

export interface HrSession {
  /** La primera medición; null si todavía no ha llegado ninguna. */
  startedAt: number | null;
  lastAt: number | null;
  /** Cuándo se paró (desconectar o darse por vencido); null mientras sigue. */
  endedAt: number | null;
  count: number;
  sum: number;
  max: number;
  /** Veces que se ha caído la conexión sin pedirlo tú. */
  cuts: number;
  /** El mayor rato sin datos y si en él la app estaba oculta (pantalla apagada u otra app delante). */
  gapMs: number;
  gapHidden: boolean;
}

export const EMPTY_HR_SESSION: HrSession = { startedAt: null, lastAt: null, endedAt: null, count: 0, sum: 0, max: 0, cuts: 0, gapMs: 0, gapHidden: false };

export function withReading(s: HrSession, bpm: number, now: number, wasHidden: boolean): HrSession {
  const gap = s.lastAt === null ? 0 : now - s.lastAt;
  const longer = gap >= HR_GAP_MS && gap > s.gapMs;
  return {
    ...s,
    startedAt: s.startedAt ?? now,
    lastAt: now,
    count: s.count + 1,
    sum: s.sum + bpm,
    max: Math.max(s.max, bpm),
    gapMs: longer ? gap : s.gapMs,
    gapHidden: longer ? wasHidden : s.gapHidden,
  };
}

export const withCut = (s: HrSession): HrSession => ({ ...s, cuts: s.cuts + 1 });

/** Al parar, el rato que llevaba sin datos también cuenta como hueco. */
export function ended(s: HrSession, now: number, wasHidden: boolean): HrSession {
  if (s.endedAt !== null) return s;
  const gap = s.lastAt === null ? 0 : now - s.lastAt;
  const longer = gap >= HR_GAP_MS && gap > s.gapMs;
  return { ...s, endedAt: now, gapMs: longer ? gap : s.gapMs, gapHidden: longer ? wasHidden : s.gapHidden };
}

const duration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ''}`;
};

/** Cómo ha ido la prueba, en dos líneas; vacío si no llegó ninguna medición. */
export function hrSummary(s: HrSession, now: number, hiddenNow = false): string[] {
  if (s.startedAt === null || s.lastAt === null) return [];
  const end = s.endedAt ?? now;
  const open = s.endedAt === null ? now - s.lastAt : 0;
  const ongoing = open >= HR_GAP_MS && open > s.gapMs;
  const gap = ongoing ? open : s.gapMs;
  const hidden = ongoing ? hiddenNow : s.gapHidden;
  const cuts = s.cuts === 0 ? 'sin cortes' : `${s.cuts} ${s.cuts === 1 ? 'corte' : 'cortes'}`;
  const holes = gap === 0 ? 'sin huecos' : `mayor hueco ${duration(gap)}${hidden ? ' (app oculta)' : ''}`;
  return [`${duration(end - s.startedAt)} · ${cuts} · ${holes}`, `Media ${Math.round(s.sum / s.count)} · máximo ${s.max}`];
}
