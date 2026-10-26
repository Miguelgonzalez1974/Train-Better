import type { ReactNode } from 'react';
import { SectionLabel } from '../shell/SectionLabel';

/**
 * Lo que comparten los gráficos del Dashboard para hablar el mismo idioma que la evolución de fuerza: cabecera con el título a la
 * izquierda y el dato actual a la derecha, tres valores fijos en el eje vertical, cuatro fechas escritas en el horizontal, el
 * último valor escrito al final de la línea y una fila corta de leyenda debajo.
 */

/** "26 oct" (con el año de dos cifras si se pide). */
export function fmtDay(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', ...(withYear ? { year: '2-digit' } : {}) }).format(new Date(`${iso}T12:00:00`));
}

/** Los índices de las cuatro fechas del eje horizontal: primero, último y dos intermedios repartidos. */
export function xTickIndexes(n: number): number[] {
  if (n <= 1) return [0];
  return [...new Set([0, 1, 2, 3].map((k) => Math.round((k / 3) * (n - 1))))];
}

/** Cabecera de un gráfico: título a la izquierda, dato actual grande a la derecha. */
export function ChartHeader({ title, value, unit }: { title: ReactNode; value?: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <SectionLabel>{title}</SectionLabel>
      {value !== undefined && (
        <p className="num shrink-0 text-xl font-extrabold leading-none text-white">
          {value}
          {unit && <span className="ml-1 text-[11px] font-semibold text-neutral-500">{unit}</span>}
        </p>
      )}
    </div>
  );
}

/** Fila de leyenda bajo un gráfico: elementos a la izquierda y, si hace falta, un resumen a la derecha. */
export function ChartLegend({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-neutral-400">
      {children}
      {right && <span className="ml-auto text-neutral-400">{right}</span>}
    </div>
  );
}

/** Un elemento de la leyenda: un punto (o una barrita) de color y su nombre. */
export function LegendItem({ color, label, shape = 'dot' }: { color: string; label: string; shape?: 'dot' | 'bar' | 'line' }) {
  const cls = shape === 'dot' ? 'h-2 w-2 rounded-full' : shape === 'bar' ? 'h-2 w-3 rounded-sm' : 'h-0.5 w-3.5 rounded-full';
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block ${cls}`} style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
