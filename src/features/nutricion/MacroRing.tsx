interface MacroRingProps {
  label: string;
  value: number;
  target: number;
  /** Sin uso en el estilo minimalista (todos los anillos son blancos salvo el estado); se conserva para no tocar a los llamadores. */
  strokeClass?: string;
  /** Diámetro en px. Por defecto 92 (dentro del constructor de una comida); la línea del día usa uno mayor, las listas compactas uno menor. */
  size?: number;
  /** Oculta la etiqueta de abajo y el "de X g" — solo el número, para usarlo en listas compactas (fila de la semana). El significado sigue accesible por `aria-label`. */
  compact?: boolean;
}

/**
 * Anillo de progreso de un macro: fino y blanco, con el número grande en el centro. El color queda para el
 * estado — verde al cubrirlo, naranja si se pasa.
 */
export function MacroRing({ label, value, target, size = 92, compact = false }: MacroRingProps) {
  const stroke = size >= 110 ? 4 : size <= 56 ? 3 : 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = target > 0 ? value / target : 0;
  const covered = ratio >= 0.9 && ratio <= 1.15;
  const over = ratio > 1.15;
  const colorClass = over ? 'stroke-brand-orange' : covered ? 'stroke-emerald-400' : 'stroke-white';
  const dash = Math.min(1, ratio) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`${label}: ${value} de ${target} gramos`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/[0.08]" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            className={`${colorClass} transition-all duration-300`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`num font-semibold leading-none tracking-tight text-white ${size >= 110 ? 'text-4xl' : compact ? 'text-[11px]' : 'text-2xl'}`}>{value}</span>
          {!compact && <span className="mt-1 text-[10px] text-neutral-500">de {target} g</span>}
        </div>
      </div>
      {!compact && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</span>}
    </div>
  );
}
