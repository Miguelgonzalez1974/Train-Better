import { useState } from 'react';
import { Modal } from '../shell/Modal';
import { BAR_OPTIONS_KG, computeBarLoad, type PlatePair } from '../../engine/plateMath';

/** Colores tipo IWF, ajustados para leerse sobre fondo oscuro. */
const PLATE_COLOR: Record<number, string> = {
  25: '#e0463a',
  20: '#3b7bd4',
  15: '#e8b53a',
  10: '#3fae5a',
  5: '#e9e9e9',
  2.5: '#9aa0a8',
  1.25: '#6b7078',
};
/** Alto relativo del disco en la ilustración (los grandes más altos). */
const PLATE_HEIGHT: Record<number, number> = { 25: 56, 20: 52, 15: 48, 10: 42, 5: 32, 2.5: 24, 1.25: 20 };

function PlateChip({ kg }: { kg: number }) {
  const dark = kg === 5;
  return (
    <div
      className="flex w-5 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold"
      style={{ height: PLATE_HEIGHT[kg] ?? 24, background: PLATE_COLOR[kg] ?? '#6b7078', color: dark ? '#1a1a1a' : '#fff' }}
      title={`${kg} kg`}
    >
      {kg}
    </div>
  );
}

function Barbell({ perSide }: { perSide: PlatePair[] }) {
  const stack = perSide.flatMap((p) => Array.from({ length: p.count }, () => p.kg));
  return (
    <div className="flex items-center justify-center gap-0.5 rounded-xl bg-black/25 px-3 py-4">
      {/* lado izquierdo: de fuera a dentro (pequeños fuera) */}
      {[...stack].reverse().map((kg, i) => (
        <PlateChip key={`l-${i}`} kg={kg} />
      ))}
      {/* manguito + barra */}
      <div className="h-1.5 w-3 shrink-0 rounded-sm bg-neutral-500" />
      <div className="h-1 w-10 shrink-0 rounded-sm bg-neutral-600" />
      <div className="h-1.5 w-3 shrink-0 rounded-sm bg-neutral-500" />
      {/* lado derecho: de dentro a fuera */}
      {stack.map((kg, i) => (
        <PlateChip key={`r-${i}`} kg={kg} />
      ))}
    </div>
  );
}

/**
 * Calculadora de discos para una serie con carga. Se abre al tocar el peso en la tarjeta de la
 * sesion. Solo lectura del objetivo; el atleta cambia la barra (20/15). Muestra la barra montada,
 * el desglose por lado, y avisa si el juego estandar no cuadra al kilo exacto.
 */
export function PlateCalculator({ targetKg, open, onClose }: { targetKg: number; open: boolean; onClose: () => void }) {
  const [barKg, setBarKg] = useState(20);
  const load = computeBarLoad(targetKg, barKg);

  return (
    <Modal open={open} onClose={onClose} title="Calculadora de discos">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-white">{targetKg} kg</p>
            <p className="text-xs text-neutral-500">objetivo de la serie</p>
          </div>
          <div className="flex gap-1.5">
            {BAR_OPTIONS_KG.map((b) => (
              <button
                key={b}
                onClick={() => setBarKg(b)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                  barKg === b ? 'bg-brand-orange text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                }`}
              >
                Barra {b}
              </button>
            ))}
          </div>
        </div>

        {load.belowBar ? (
          <p className="rounded-lg bg-white/[0.04] px-3 py-4 text-center text-sm text-neutral-400">
            El objetivo ({targetKg} kg) es menor que la barra de {barKg} kg. Usa una barra más ligera o discos técnicos.
          </p>
        ) : (
          <>
            <Barbell perSide={load.perSide} />

            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Por lado</p>
              {load.perSide.length === 0 ? (
                <p className="text-sm text-neutral-300">Solo la barra.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {load.perSide.map((p) => (
                    <span key={p.kg} className="rounded-md bg-white/5 px-2 py-1 text-sm text-white">
                      {p.count}&thinsp;×&thinsp;{p.kg}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {load.leftoverKg > 0 && (
              <p className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-xs text-brand-gold">
                Con el juego estándar montas {load.achievableKg} kg — te faltan {load.leftoverKg} kg. Redondea o usa discos de
                fracción.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
