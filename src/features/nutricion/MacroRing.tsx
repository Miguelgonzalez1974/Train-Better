interface MacroRingProps {
  label: string;
  value: number;
  target: number;
  /** Color del trazo cuando la toma aún no está cubierta (clase de Tailwind `stroke-*`). */
  strokeClass: string;
}

/** Anillo de progreso de un macro: verde al cubrirlo, naranja si se pasa. Se lee de un vistazo, con el número en el centro. */
export function MacroRing({ label, value, target, strokeClass }: MacroRingProps) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = target > 0 ? value / target : 0;
  const covered = ratio >= 0.9 && ratio <= 1.15;
  const over = ratio > 1.15;
  const colorClass = over ? 'stroke-brand-orange' : covered ? 'stroke-emerald-400' : strokeClass;
  const dash = Math.min(1, ratio) * circ;
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${label}: ${value} de ${target} gramos`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
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
          <span className="num text-xl font-bold leading-none text-white">{value}</span>
          <span className="mt-0.5 text-[10px] text-neutral-500">de {target} g</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}
