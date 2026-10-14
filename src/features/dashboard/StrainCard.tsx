import type { StrainRange, StrainStatus } from '../../engine/strain';
import { SectionLabel } from '../shell/SectionLabel';

const CX = 110;
const CY = 108;
const R = 88;

/** Punto del semicírculo para un valor 0-100: 0 a la izquierda, 100 a la derecha, pasando por arriba. */
function point(value: number, radius = R): { x: number; y: number } {
  const theta = Math.PI * (1 - Math.min(100, Math.max(0, value)) / 100);
  return { x: CX + radius * Math.cos(theta), y: CY - radius * Math.sin(theta) };
}

function arc(from: number, to: number, radius = R): string {
  const a = point(from, radius);
  const b = point(to, radius);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const STATUS_COLOR: Record<StrainStatus, string> = {
  'sin-entrenar': 'rgb(var(--c-white) / 0.5)',
  'por-debajo': 'rgb(var(--c-state-cool))',
  dentro: 'rgb(var(--c-state-good))',
  pasado: 'rgb(var(--c-state-hot))',
};

function statusText(status: StrainStatus, range: StrainRange): string {
  switch (status) {
    case 'sin-entrenar':
      return `Aún sin entrenar · hoy te conviene entre ${range.low} y ${range.high}`;
    case 'por-debajo':
      return 'Por debajo del rango · aún tenías margen';
    case 'dentro':
      return 'Dentro del rango · justo lo que tocaba';
    case 'pasado':
      return 'Por encima del rango · mañana, con cuidado';
  }
}

/**
 * "Esfuerzo de hoy": un semicírculo con el rango que el coach recomienda hoy (la banda verde, según tu preparación y tu
 * carga) y, una vez entrenado, dónde caíste. Estimación de carga percibida (RPE x duración), no una medida fisiológica.
 */
export function StrainCard({
  strain,
  range,
  status,
  readiness,
  loadWord,
}: {
  strain: number | null;
  range: StrainRange;
  status: StrainStatus;
  readiness: number | null;
  loadWord: string | null;
}) {
  const color = STATUS_COLOR[status];
  const marker = strain !== null ? point(strain) : null;
  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Esfuerzo de hoy">
      <SectionLabel>Esfuerzo de hoy</SectionLabel>
      <div className="relative mx-auto mt-2 w-full max-w-[17rem]">
        <svg viewBox="0 0 220 124" className="w-full" role="img" aria-label={strain !== null ? `Esfuerzo ${strain} de 100, rango recomendado ${range.low} a ${range.high}` : `Rango recomendado ${range.low} a ${range.high}`}>
          <path d={arc(0, 100)} fill="none" stroke="rgb(var(--c-white) / 0.08)" strokeWidth={12} strokeLinecap="round" />
          <path d={arc(range.low, range.high)} fill="none" stroke="rgb(var(--c-state-good) / 0.38)" strokeWidth={18} strokeLinecap="butt" />
          {strain !== null && strain > 0 && <path d={arc(0, strain)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />}
          {marker && <circle cx={marker.x} cy={marker.y} r={7} fill="rgb(var(--c-white))" stroke={color} strokeWidth={3} />}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="num text-[2.6rem] font-semibold leading-none tracking-tight text-white">{strain ?? '—'}</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-neutral-500">de 100</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-neutral-400">
        <span className="h-2 w-5 rounded-sm" style={{ backgroundColor: 'rgb(var(--c-state-good) / 0.45)' }} aria-hidden="true" />
        Rango recomendado <span className="num font-semibold text-neutral-200">{range.low}–{range.high}</span>
      </div>
      <p className="mt-2 text-center text-sm font-semibold" style={{ color: status === 'sin-entrenar' ? undefined : color }}>
        {statusText(status, range)}
      </p>
      <p className="mt-1.5 text-center text-[11px] leading-relaxed text-neutral-600">
        {readiness !== null ? `Sale de tu preparación (${readiness} %)` : 'Sin check-in de hoy'}
        {loadWord ? ` y tu carga (${loadWord})` : ''}. Es una estimación del esfuerzo percibido (RPE × duración), no una medida fisiológica.
      </p>
    </section>
  );
}
