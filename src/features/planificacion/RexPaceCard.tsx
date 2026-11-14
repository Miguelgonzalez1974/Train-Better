import { RexMascot } from '../objetivos/RexMascot';
import { secondsText } from '../../engine/wodGhost';
import type { PaceTip } from '../../engine/wodPace';

const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/**
 * Antes de empezar un WOD por tiempo con rondas: la pauta de ritmo de Rex (ver `engine/wodPace.ts`). Cuenta cómo sueles repartir el esfuerzo
 * en tus últimos WODs parecidos y propone un ritmo constante para hoy; si lo aceptas, es el fantasma de esa sesión. Aceptada, se queda en
 * una línea con «Quitar».
 */
export function RexPaceCard({ tip, active, onUse, onDismiss, onRemove }: { tip: PaceTip; active: boolean; onUse: () => void; onDismiss: () => void; onRemove: () => void }) {
  if (active) {
    return (
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
        <p className="text-xs text-neutral-300">
          Pauta de Rex: <span className="font-semibold text-white">{mmss(tip.pace)} por ronda</span> · acabarías en {mmss(tip.projectedTotal)}
        </p>
        <button onClick={onRemove} className="shrink-0 text-[11px] font-semibold text-neutral-400 hover:text-white">
          Quitar
        </button>
      </div>
    );
  }
  const max = Math.max(...tip.lastRounds, tip.pace);
  // El eje no parte de cero: así se ve la caída ronda a ronda, que es de lo que habla la tarjeta.
  const min = Math.min(...tip.lastRounds, tip.pace) * 0.7;
  const n = tip.lastRounds.length;
  const w = 280;
  const h = 64;
  const slot = w / n;
  const y = (v: number) => h - 4 - ((v - min) / Math.max(1, max - min)) * (h - 12);
  return (
    <section className="mb-2 flex flex-col gap-2 rounded-lg bg-white/5 px-3 py-2.5" aria-label="Pauta de ritmo de Rex">
      <div className="flex items-center gap-2">
        <RexMascot size={22} mood="think" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Pauta de ritmo</p>
          <p className="truncate text-[11px] text-neutral-500">Rex · por tus {tip.samples} últimos WODs de {tip.rounds} rondas</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-neutral-300">
        Sueles <span className="font-semibold text-white">salir a {mmss(tip.opening)} y acabar a {mmss(tip.closing)}</span> por ronda: se te va hundiendo. Hoy sal a{' '}
        <span className="font-semibold text-white">{mmss(tip.pace)} y aguántalo</span>: acabarías en {mmss(tip.projectedTotal)}
        {tip.vsBest !== null ? `, ${secondsText(tip.vsBest)} menos que tu mejor marca de este WOD` : ''}.
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Tu ritmo ronda a ronda la última vez frente a la pauta de ${mmss(tip.pace)}`}>
        {tip.lastRounds.map((v, i) => (
          <rect key={i} x={i * slot + 2} y={y(v)} width={slot - 4} height={h - 4 - y(v)} rx="2" className="fill-white/25" />
        ))}
        <line x1="0" x2={w} y1={y(tip.pace)} y2={y(tip.pace)} className="stroke-brand-neon" strokeWidth="2" strokeDasharray="5 4" />
      </svg>
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>R1</span>
        <span>tu última vez, ronda a ronda</span>
        <span>R{n}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <button onClick={onUse} className="rounded-lg bg-brand-neon px-3 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90 active:opacity-80">
          Correr contra esta pauta
        </button>
        <button onClick={onDismiss} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/5">
          Mantener mi mejor marca
        </button>
      </div>
    </section>
  );
}
