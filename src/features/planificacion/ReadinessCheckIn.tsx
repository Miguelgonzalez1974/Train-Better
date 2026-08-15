import { useState } from 'react';
import { Moon, Activity, Zap, Flame, type LucideIcon } from 'lucide-react';
import type { MotivationLevel, ReadinessCheck, SleepLevel, SorenessLevel, StressLevel } from '../../data/athlete/types';

const SLEEP_OPTIONS: { value: SleepLevel; label: string }[] = [
  { value: 'mal', label: 'Mal' },
  { value: 'regular', label: 'Regular' },
  { value: 'bien', label: 'Bien' },
];
const SORENESS_OPTIONS: { value: SorenessLevel; label: string }[] = [
  { value: 'alto', label: 'Alto' },
  { value: 'leve', label: 'Leve' },
  { value: 'ninguno', label: 'Ninguno' },
];
const STRESS_OPTIONS: { value: StressLevel; label: string }[] = [
  { value: 'alto', label: 'Alto' },
  { value: 'medio', label: 'Medio' },
  { value: 'bajo', label: 'Bajo' },
];
const MOTIVATION_OPTIONS: { value: MotivationLevel; label: string }[] = [
  { value: 'baja', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
];

function PillRow<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/5 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Icon size={16} strokeWidth={2.25} className="text-neutral-400" />
        <span className="text-sm text-neutral-200">{label}</span>
      </div>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 ${
              value === opt.value
                ? 'border-brand-orange bg-brand-orange/15 text-brand-orange'
                : 'border-brand-border text-neutral-400 hover:border-brand-gold/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ReadinessCheckInProps {
  dateIso: string;
  onConfirm: (check: ReadinessCheck) => void;
  onSkip: () => void;
}

/** Check-in diario de 4 preguntas — ver `src/engine/readiness.ts` para como el resultado se convierte en un factor de carga acotado, igual que ya hace el ACWR o el RPE reciente. */
export function ReadinessCheckIn({ dateIso, onConfirm, onSkip }: ReadinessCheckInProps) {
  const [sleep, setSleep] = useState<SleepLevel>('regular');
  const [soreness, setSoreness] = useState<SorenessLevel>('leve');
  const [stress, setStress] = useState<StressLevel>('medio');
  const [motivation, setMotivation] = useState<MotivationLevel>('normal');

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 text-xs text-neutral-500">
        Toca una opción por fila — el coach ajusta la carga de hoy dentro de un margen pequeño, nunca cambia lo que toca entrenar.
      </p>
      <PillRow icon={Moon} label="Sueño" options={SLEEP_OPTIONS} value={sleep} onChange={setSleep} />
      <PillRow icon={Activity} label="Agujetas" options={SORENESS_OPTIONS} value={soreness} onChange={setSoreness} />
      <PillRow icon={Zap} label="Estrés" options={STRESS_OPTIONS} value={stress} onChange={setStress} />
      <PillRow icon={Flame} label="Motivación" options={MOTIVATION_OPTIONS} value={motivation} onChange={setMotivation} />
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onConfirm({ date: dateIso, sleep, soreness, stress, motivation })}
          className="flex-1 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
        >
          Confirmar
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg border border-brand-border px-4 py-2.5 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
