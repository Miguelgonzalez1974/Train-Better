import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { ACWR_ZONE_LABEL, type AcwrResult } from '../../engine/loadMetrics';
import type { ReadinessScore } from '../../engine/readinessScore';
import { SectionLabel } from '../shell/SectionLabel';
import { AcwrGauge } from './AcwrGauge';
import { GoalFillRow, MAX_GOALS, remainingDaysOf } from './JourneyProgress';
import type { ProgressRow } from './progressOverview';
import { RECOVERY_GOOD, RECOVERY_LOW, RecoveryDetail, recoveryColor } from './RecoveryCard';

type RingKey = 'plan' | 'recovery' | 'load';

/** Color de cada zona de carga: azul = poca, verde = óptima, naranja y rojo = demasiada. */
const ZONE_COLOR: Record<AcwrResult['zone'], string> = {
  baja: 'rgb(var(--c-state-cool))',
  optima: 'rgb(var(--c-state-good))',
  moderada: 'rgb(var(--c-state-hot))',
  alta: 'rgb(var(--c-state-low))',
};
const NEUTRAL = '#525252';

/** Nivel de recuperación en una sola palabra, para que quepa bajo un anillo de un tercio de pantalla. */
const LEVEL_SHORT = { alta: 'Con ganas', normal: 'Normal', baja: 'Cansado' } as const;

const PART_SHORT = { feel: 'cómo te sientes', load: 'tu carga', performance: 'cómo te salen las sesiones' } as const;

/**
 * Un anillo que se adapta al ancho de su columna (SVG con viewBox) y lleva su contenido centrado. Al aparecer se llena
 * desde cero hasta su valor (no se anima si el dispositivo pide menos movimiento).
 */
function Ring({ fraction, color, children }: { fraction: number; color: string; children: ReactNode }) {
  const stroke = 8;
  const r = (100 - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = filled ? Math.min(1, Math.max(0, fraction)) : 0;
  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={stroke} className="stroke-white/[0.07]" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ stroke: color }}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function RingButton({
  selected,
  onClick,
  label,
  word,
  wordColor,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  word: string;
  wordColor?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`flex min-w-0 flex-col items-center rounded-2xl px-1 pb-2.5 pt-2 transition-colors duration-200 ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
    >
      {children}
      <SectionLabel className="mt-2 w-full truncate text-center !tracking-[0.1em]">{label}</SectionLabel>
      <p className="mt-0.5 w-full truncate text-center text-[13px] font-semibold" style={{ color: wordColor ?? undefined }}>
        {word}
      </p>
    </button>
  );
}

/**
 * Los tres números del día en una línea, al estilo Whoop: tu plan (avance del bloque), tu recuperación (cuánto aguantas
 * hoy) y tu carga (cuánto llevas encima). El del medio, algo más grande, es el que decide el día. Tocar un anillo abre su
 * detalle justo debajo; solo uno a la vez.
 */
export function DayRings({
  structureRow,
  goalRows,
  readiness,
  acwr,
  trend,
  onNavigateToObjetivos,
}: {
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  readiness: ReadinessScore;
  acwr: AcwrResult;
  trend: (number | null)[];
  onNavigateToObjetivos: () => void;
}) {
  const [open, setOpen] = useState<RingKey | null>(null);
  const toggle = (key: RingKey) => setOpen((cur) => (cur === key ? null : key));

  const { total, level } = readiness;
  const recoveryTint = total !== null ? recoveryColor(total) : NEUTRAL;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const loadTint = hasLoad ? ZONE_COLOR[acwr.zone] : NEUTRAL;

  const planPct = structureRow ? Math.min(100, Math.max(0, structureRow.pct)) : 0;
  const week = structureRow?.sublabel.match(/Semana (\d+) de (\d+)/);

  const sortedGoals = [...goalRows].sort((a, b) => remainingDaysOf(a) - remainingDaysOf(b));
  const shownGoals = sortedGoals.slice(0, MAX_GOALS);
  const hiddenGoals = sortedGoals.length - shownGoals.length;

  // Lo que más pesa hoy: solo se dice cuando algo va peor. Si todo está bien, no hace falta decir nada.
  const scored = (['feel', 'load', 'performance'] as const).filter((k) => readiness[k].score !== null);
  const worst = scored.length > 0 ? scored.reduce((a, b) => (readiness[b].score! < readiness[a].score! ? b : a)) : null;
  const driver =
    readiness.pain.count > 0
      ? `Molestia en ${readiness.pain.areas.join(', ')}`
      : worst && readiness[worst].score! < 65
        ? `Lo que más pesa: ${PART_SHORT[worst]}`
        : null;

  // El consejo del día cruza las dos señales: cuánto aguantas hoy y cuánto llevas encima. Solo se dice cuando está claro;
  // el coach ya ajusta los kilos de cada sesión con esto, aquí solo se pone en palabras.
  const advice =
    total !== null && total >= 65 && hasLoad && (acwr.zone === 'baja' || acwr.zone === 'optima')
      ? { text: 'Buen día para apretar', color: RECOVERY_GOOD }
      : (total !== null && total <= 40) || (hasLoad && acwr.zone === 'alta')
        ? { text: 'Hoy, mejor con cuidado', color: RECOVERY_LOW }
        : null;

  const numberClass = 'num font-semibold leading-none tracking-tight text-white';

  return (
    <section>
      <div className={`grid items-end gap-1.5 ${structureRow ? 'grid-cols-[1fr_1.3fr_1fr]' : 'grid-cols-2'}`}>
        {structureRow && (
          <RingButton
            selected={open === 'plan'}
            onClick={() => toggle('plan')}
            label="Plan activo"
            word={week ? `Sem. ${week[1]}/${week[2]}` : 'En curso'}
            title={`${structureRow.label} · ${structureRow.sublabel}`}
          >
            <Ring fraction={planPct / 100} color="rgb(var(--c-white))">
              <span className={`${numberClass} text-[clamp(1.2rem,6vw,1.7rem)]`}>
                {planPct}
                <span className="text-[0.55em] font-medium text-neutral-400">%</span>
              </span>
            </Ring>
          </RingButton>
        )}

        <RingButton
          selected={open === 'recovery'}
          onClick={() => toggle('recovery')}
          label="Recuperación"
          word={level ? LEVEL_SHORT[level] : 'Sin datos'}
          wordColor={recoveryTint}
          title="Recuperación: cuánto aguantas hoy"
        >
          <Ring fraction={(total ?? 0) / 100} color={recoveryTint}>
            <span className={`${numberClass} text-[clamp(1.6rem,8vw,2.4rem)]`}>
              {total !== null ? total : '—'}
              {total !== null && <span className="text-[0.5em] font-medium text-neutral-400">%</span>}
            </span>
          </Ring>
        </RingButton>

        <RingButton
          selected={open === 'load'}
          onClick={() => toggle('load')}
          label="Carga"
          word={hasLoad ? ACWR_ZONE_LABEL[acwr.zone] : 'Sin datos'}
          wordColor={loadTint}
          title="Carga: cuánto llevas encima (ACWR)"
        >
          <Ring fraction={(acwr.acwr ?? 0) / 2} color={loadTint}>
            <span className={`${numberClass} text-[clamp(1.2rem,6vw,1.7rem)]`}>{hasLoad ? acwr.acwr!.toFixed(2).replace('.', ',') : '—'}</span>
          </Ring>
        </RingButton>
      </div>

      {advice && (
        <p className="mt-3 text-center text-sm font-semibold" style={{ color: advice.color }}>
          {advice.text}
        </p>
      )}
      {driver && <p className={`${advice ? 'mt-0.5' : 'mt-3'} text-center text-xs text-neutral-400`}>{driver}</p>}
      {open === null && !advice && !driver && <p className="mt-3 text-center text-[11px] text-neutral-600">Toca un anillo para ver el detalle</p>}

      {open && (
        <div className="mt-3 animate-section-in rounded-2xl bg-white/[0.03] p-5 motion-reduce:animate-none">
          {open === 'plan' && structureRow && (
            <div className="flex flex-col gap-4">
              <div>
                <SectionLabel>Plan activo</SectionLabel>
                <p className="mt-1.5 text-base font-semibold text-white">{structureRow.label}</p>
                <p className="mt-0.5 text-xs text-neutral-400">{structureRow.sublabel}</p>
              </div>
              {shownGoals.length > 0 && (
                <div className="flex flex-col gap-3.5">
                  {shownGoals.map((row) => (
                    <GoalFillRow key={row.id} row={row} />
                  ))}
                  {hiddenGoals > 0 && <p className="text-[11px] text-neutral-500">+{hiddenGoals} {hiddenGoals === 1 ? 'objetivo más' : 'objetivos más'}</p>}
                </div>
              )}
              <button onClick={onNavigateToObjetivos} className="flex items-center gap-1 self-start text-xs font-semibold text-neutral-300 transition-colors hover:text-white">
                Ir a Objetivos <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}

          {open === 'recovery' && <RecoveryDetail readiness={readiness} />}

          {open === 'load' && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Carga</SectionLabel>
              <AcwrGauge result={acwr} trend={trend} />
              {readiness.load.score !== null && <p className="text-[11px] text-neutral-500">{readiness.load.detail}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
