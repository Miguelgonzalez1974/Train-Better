import { secondsText } from '../../engine/wodGhost';

/**
 * La cinta del modo fantasma: un tramo por movimiento (o por ronda), con el ancho de lo que tardó el fantasma en él. Los tramos cerrados se
 * pintan de verde (ganas al fantasma) o de naranja (pierdes) con su diferencia; el activo lleva borde naranja y es el único que responde al
 * toque; el fantasma avanza como una línea blanca. Con más de seis tramos la cinta se desdobla en dos filas. Solo pinta: lo que enseña lo
 * decide el reloj (`TrainingTimer`) con el cálculo de `engine/wodGhost.ts`.
 */
export interface WodRibbonProps {
  /** Nombre de cada tramo de la ventana que se ve (una vuelta de movimientos, o todas las rondas). */
  labels: string[];
  /** Ancho relativo de cada tramo (lo que tardó el fantasma); sin fantasma, todos iguales. */
  widths: number[];
  /** Cuántos tramos de la ventana están cerrados. */
  doneCount: number;
  /** Segundos que ganas (+) o pierdes (−) a cada tramo cerrado; null sin fantasma. */
  deltas: (number | null)[];
  /** Dónde va el fantasma, en tramos de la ventana (0 = al principio; 2,5 = a mitad del tercero); null sin fantasma. */
  ghostAt: number | null;
  /** Lo que se enseña bajo el nombre del tramo activo («40 · 1:12 / 1:48»). */
  activeDetail?: string;
  /** Pantalla completa: más alta y con letra grande. */
  big?: boolean;
  /** Pantalla completa apaisada: la cinta va a todo lo ancho del móvil, así que caben más tramos por fila y es más baja. */
  wide?: boolean;
  /** Por movimientos la cinta solo enseña una vuelta: esta fila fina (solo apaisado) cuenta las rondas, con cómo fue cada una contra el fantasma. */
  roundStrip?: { count: number; doneCount: number; deltas: (number | null)[] } | null;
  onTapActive?: () => void;
}

const MAX_PER_ROW = 6;
const MAX_PER_ROW_WIDE = 12;

export function WodRibbon({ labels, widths, doneCount, deltas, ghostAt, activeDetail, big, wide, roundStrip, onTapActive }: WodRibbonProps) {
  const strip = wide && roundStrip && roundStrip.count >= 2 ? roundStrip : null;
  const n = labels.length;
  const maxPerRow = wide ? MAX_PER_ROW_WIDE : MAX_PER_ROW;
  const perRow = n > maxPerRow ? Math.ceil(n / 2) : n;
  const rows = Array.from({ length: Math.ceil(n / perRow) }, (_, r) => Array.from({ length: Math.min(perRow, n - r * perRow) }, (_, i) => r * perRow + i));
  const avg = widths.reduce((s, w) => s + w, 0) / Math.max(1, n) || 1;
  const grow = (i: number) => Math.max(widths[i] || avg, avg * 0.55);

  // La línea del fantasma va en la fila que la contiene, proporcional al ancho de los tramos de esa fila.
  const ghostIndex = ghostAt === null ? null : Math.min(n - 1, Math.max(0, Math.floor(ghostAt)));
  const ghostFrac = ghostAt === null || ghostIndex === null ? 0 : Math.min(1, ghostAt - ghostIndex);
  const ghostRow = ghostIndex === null ? -1 : Math.floor(ghostIndex / perRow);
  const ghostLeft = (() => {
    if (ghostIndex === null || ghostRow < 0) return 0;
    const row = rows[ghostRow];
    const total = row.reduce((s, i) => s + grow(i), 0);
    const before = row.filter((i) => i < ghostIndex).reduce((s, i) => s + grow(i), 0);
    return ((before + ghostFrac * grow(ghostIndex)) / total) * 100;
  })();

  // En el panel pequeño, con dos filas, cada una baja de altura para que la cinta no empuje el panel fuera de la pantalla.
  const h = wide ? (rows.length > 1 || strip ? 'h-11' : 'h-14') : big ? 'h-24' : rows.length > 1 ? 'h-11' : 'h-16';
  const crowded = perRow > (wide ? 12 : 7);
  return (
    <div className={`flex flex-col ${big && !wide ? 'gap-5 pt-5' : strip ? 'gap-4 pt-1' : 'gap-4 pt-4'}`} role="group" aria-label="Tramos del WOD">
      {strip && (
        <div className="flex h-4 gap-[3px]" role="img" aria-label={`Rondas: ${strip.doneCount} de ${strip.count} hechas`}>
          {Array.from({ length: strip.count }, (_, r) => {
            const d = strip.deltas[r] ?? null;
            const cls =
              r < strip.doneCount
                ? d === null
                  ? 'bg-white/10 text-neutral-200'
                  : d < -2
                    ? 'bg-brand-orange/30 text-brand-orange'
                    : 'bg-brand-neon/25 text-brand-neon'
                : r === strip.doneCount
                  ? 'border-[1.5px] border-brand-orange text-white'
                  : 'border border-white/10 text-neutral-500';
            return (
              <div key={r} className={`flex min-w-0 flex-1 items-center justify-center rounded text-[11px] font-semibold leading-none ${cls}`}>
                {r + 1}
              </div>
            );
          })}
        </div>
      )}
      {rows.map((row, r) => (
        <div key={r} className={`relative flex gap-[3px] ${h}`}>
          {row.map((i) => {
            const done = i < doneCount;
            const active = i === doneCount;
            const delta = deltas[i] ?? null;
            const cls = done
              ? delta !== null && delta < -2
                ? 'bg-brand-orange/25 text-brand-orange'
                : delta === null
                  ? 'bg-white/10 text-neutral-200'
                  : 'bg-brand-neon/20 text-brand-neon'
              : active
                ? 'border-2 border-brand-orange bg-white/5 text-white'
                : 'border border-white/10 text-neutral-500';
            // Con muchas rondas por fila, el rótulo «R12» pasa a «12» y las cifras de abajo a letra pequeña, para que no se corten.
            const label = crowded && /^R\d+$/.test(labels[i]) ? labels[i].slice(1) : labels[i];
            const body = (
              <>
                <span className={`block w-full truncate font-bold ${big && !wide ? 'text-base' : wide ? 'text-sm' : 'text-xs'}`}>{label}</span>
                <span className={`block w-full truncate ${big ? 'text-sm' : crowded ? 'text-[10px]' : 'text-[11px]'} ${done ? '' : 'font-medium opacity-80'}`}>
                  {done ? (delta === null ? '✓' : delta > 2 ? `−${secondsText(delta)}` : delta < -2 ? `+${secondsText(delta)}` : '=') : active ? (activeDetail ?? '') : ''}
                </span>
              </>
            );
            // Con muchos tramos por fila el relleno lateral se reduce: así 20 tramos caben en un móvil de 360 px.
            const base = `flex min-w-0 flex-col justify-between overflow-hidden rounded-lg py-1.5 text-left ${crowded ? 'px-0.5' : 'px-1.5'}`;
            return active && onTapActive ? (
              <button key={i} onClick={onTapActive} aria-label={`${labels[i]} hecho`} style={{ flexGrow: grow(i), flexBasis: 0 }} className={`${base} ${cls} active:bg-white/15`}>
                {body}
              </button>
            ) : (
              <div key={i} style={{ flexGrow: grow(i), flexBasis: 0 }} className={`${base} ${cls}`}>
                {body}
              </div>
            );
          })}
          {ghostRow === r && (
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-1 -top-1 w-0.5 rounded-full bg-white" style={{ left: `${ghostLeft}%` }}>
              {/* El rótulo se alinea al borde cuando el fantasma está cerca de un extremo, para que no se salga de la cinta. */}
              <span className={`absolute -top-3.5 whitespace-nowrap ${wide ? 'text-xs' : 'text-[10px]'} font-semibold text-white ${ghostLeft < 14 ? 'left-0' : ghostLeft > 86 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>Fantasma</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
