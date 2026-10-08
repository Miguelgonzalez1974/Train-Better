import { Minus, Plus } from 'lucide-react';

const RPE_SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

/** Cómo se llama cada nivel de esfuerzo y cómo se pinta (de verde suave a rojo máximo). */
const RPE_META: Record<number, { label: string; hint: string; color: string }> = {
  1: { label: 'Muy suave', hint: 'Apenas lo has notado.', color: '#34d399' },
  2: { label: 'Muy suave', hint: 'Apenas lo has notado.', color: '#34d399' },
  3: { label: 'Suave', hint: 'Podrías haber hecho bastante más.', color: '#34d399' },
  4: { label: 'Suave', hint: 'Podrías haber hecho bastante más.', color: '#a3e635' },
  5: { label: 'Moderado', hint: 'Trabajo sólido, con margen de sobra.', color: '#d4af37' },
  6: { label: 'Moderado', hint: 'Trabajo sólido, con margen de sobra.', color: '#d4af37' },
  7: { label: 'Duro', hint: 'Cansado, pero te quedaban unas 3 repeticiones en reserva.', color: '#fb923c' },
  8: { label: 'Muy duro', hint: 'Te quedaban 2 repeticiones, como mucho.', color: '#f97316' },
  9: { label: 'Casi al límite', hint: 'Te quedaba 1 repetición.', color: '#ef4444' },
  10: { label: 'Máximo', hint: 'No había una más. Todo fuera.', color: '#ef4444' },
};

/** Diez botones de color con la descripción del nivel elegido debajo. Lo usan el cierre de sesión y el registro rápido ("Hice otra cosa"). */
export function RpePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const meta = RPE_META[value] ?? RPE_META[7];
  return (
    <div>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Esfuerzo percibido (RPE)">
        {RPE_SCALE.map((n) => {
          const selected = value === n;
          const color = RPE_META[n].color;
          return (
            <button
              key={n}
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className="flex h-11 items-center justify-center rounded-lg text-sm font-bold transition-all duration-150"
              style={
                selected
                  ? { background: color, color: '#0b0b0b', transform: 'scale(1.12)', boxShadow: `0 4px 14px ${color}55` }
                  : { background: `${color}1f`, color }
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-semibold" style={{ color: meta.color }}>
        {meta.label}
        <span className="font-normal text-neutral-400"> · {meta.hint}</span>
      </p>
    </div>
  );
}

const DURATION_STEP = 5;
const DURATION_MIN = 10;
const DURATION_MAX = 240;

/** Duración del entreno con − y + de 5 en 5 minutos; `hint` es la línea pequeña de debajo del título. */
export function DurationStepper({ value, onChange, hint }: { value: number; onChange: (minutes: number) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3">
      <div>
        <p className="text-sm font-medium text-neutral-300">Duración entreno</p>
        {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(DURATION_MIN, value - DURATION_STEP))}
          aria-label="Menos tiempo"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:border-brand-gold hover:text-brand-gold"
        >
          <Minus size={15} />
        </button>
        <span className="num w-20 text-center text-lg font-bold text-white">
          {value}
          <span className="ml-1 text-xs font-normal text-neutral-500">min</span>
        </span>
        <button
          onClick={() => onChange(Math.min(DURATION_MAX, value + DURATION_STEP))}
          aria-label="Más tiempo"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:border-brand-gold hover:text-brand-gold"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
