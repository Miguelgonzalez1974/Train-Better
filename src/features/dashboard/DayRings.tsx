import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { ReadinessScore } from '../../engine/readinessScore';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { LearnedInsights } from './LearnedInsights';
import type { YearConsistency } from '../../engine/yearConsistency';
import { SectionLabel } from '../shell/SectionLabel';
import { AcwrGauge } from './AcwrGauge';
import { GoalFillRow, MAX_GOALS, remainingDaysOf } from './JourneyProgress';
import type { ProgressRow } from './progressOverview';
import { RECOVERY_GOOD, RECOVERY_LOW, RecoveryDetail, recoveryColor } from './RecoveryCard';
import { StrainDetail, StrainRing, strainColor, strainWord, type StrainView } from './StrainRing';

type RingKey = 'plan' | 'prep' | 'strain' | 'consistency';

const NEUTRAL = '#525252';

/** Color de cada zona de carga: azul = poca, verde = óptima, naranja y rojo = demasiada. */
const ZONE_COLOR: Record<AcwrResult['zone'], string> = {
  baja: 'rgb(var(--c-state-cool))',
  optima: 'rgb(var(--c-state-good))',
  moderada: 'rgb(var(--c-state-hot))',
  alta: 'rgb(var(--c-state-low))',
};
const ZONE_WORD: Record<AcwrResult['zone'], string> = { baja: 'Carga baja', optima: 'Carga óptima', moderada: 'Carga alta', alta: 'Carga muy alta' };

/** Nivel de preparación en una sola palabra, para que quepa bajo un anillo de un tercio de pantalla. */
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

/**
 * Anillo doble: por fuera lo principal (la preparación, trazo grueso) y por dentro, más fino y tenue, la carga. Cada uno
 * se llena desde cero al aparecer. El hueco del centro lleva el número.
 */
function DoubleRing({
  outer,
  outerColor,
  inner,
  innerColor,
  children,
}: {
  outer: number;
  outerColor: string;
  inner: number;
  innerColor: string;
  children: ReactNode;
}) {
  const rOuter = 45;
  const rInner = 34;
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const arc = 'transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none';
  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={rOuter} fill="none" strokeWidth={8} className="stroke-white/[0.07]" />
        <circle
          cx="50"
          cy="50"
          r={rOuter}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          style={{ stroke: outerColor }}
          strokeDasharray={cOuter}
          strokeDashoffset={cOuter * (1 - (filled ? clamp01(outer) : 0))}
          className={arc}
        />
        <circle cx="50" cy="50" r={rInner} fill="none" strokeWidth={4.5} className="stroke-white/[0.06]" />
        <circle
          cx="50"
          cy="50"
          r={rInner}
          fill="none"
          strokeWidth={4.5}
          strokeLinecap="round"
          style={{ stroke: innerColor, opacity: 0.85 }}
          strokeDasharray={cInner}
          strokeDashoffset={cInner * (1 - (filled ? clamp01(inner) : 0))}
          className={arc}
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
  extraWord,
  extraColor,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  word: string;
  wordColor?: string;
  /** Segunda palabra de estado, más pequeña (la carga bajo la preparación). */
  extraWord?: string;
  extraColor?: string;
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
      {extraWord && (
        <p className="w-full truncate text-center text-[11px] font-medium" style={{ color: extraColor ?? undefined }}>
          {extraWord}
        </p>
      )}
    </button>
  );
}

/** Anillo mediano con su título completo debajo, en letra pequeña: para plan y constancia, que van arriba. */
function SmallRingButton({
  selected,
  onClick,
  label,
  word,
  title,
  ring,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  word: string;
  title: string;
  ring: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`flex min-w-0 flex-col items-center rounded-2xl px-1 pb-2 pt-2 transition-colors duration-200 ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
    >
      <div className="w-[4.75rem]">{ring}</div>
      <p className="mt-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-neutral-500">{label}</p>
      <p className="mt-0.5 text-center text-[11px] font-medium leading-tight text-neutral-300">{word}</p>
    </button>
  );
}

/**
 * El estado del día en círculos, al estilo Whoop. Arriba, los dos que deciden el día: tu preparación (cuánto aguantas hoy,
 * con la carga acumulada dentro) y tu esfuerzo (el objetivo fijado por la mañana, la sesión prevista y lo que llevas
 * hecho). Debajo, en pequeño, tu plan y tu constancia. Tocar un anillo abre su detalle justo debajo; solo uno a la vez.
 */
export function DayRings({
  structureRow,
  goalRows,
  readiness,
  learning,
  acwr,
  trend,
  yearConsistency,
  consistencyDetail,
  strain,
  checkIn,
  onAdjustSession,
  onNavigateToObjetivos,
}: {
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  readiness: ReadinessScore;
  /** Qué factores del check-in te suben el esfuerzo de las sesiones (solo informativo). */
  learning: ReadinessLearning;
  acwr: AcwrResult;
  trend: (number | null)[];
  /** Constancia del año: el número grande del anillo de "Constancia". */
  yearConsistency: YearConsistency;
  /** Lo que se abre al tocar "Constancia" (el calendario de entrenos). */
  consistencyDetail: ReactNode;
  /** El esfuerzo de hoy (objetivo, previsto, real); null si aún no hay objetivo que enseñar. */
  strain: StrainView | null;
  /** El check-in de hoy ("¿Cómo llegas?"): va entre plan/constancia y los dos círculos grandes. */
  checkIn?: ReactNode;
  /** "Ajustar sesión": lleva a Planificación, donde se puede cambiar el WOD o bajar la sesión. */
  onAdjustSession: () => void;
  onNavigateToObjetivos: () => void;
}) {
  const [open, setOpen] = useState<RingKey | null>(null);
  const toggle = (key: RingKey) => setOpen((cur) => (cur === key ? null : key));

  const { total, level } = readiness;
  const recoveryTint = total !== null ? recoveryColor(total) : NEUTRAL;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;

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

  // El detalle del anillo tocado: el de plan y constancia se abre bajo su fila (arriba) y el de preparación y esfuerzo bajo los círculos grandes.
  const panel = open ? (
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

          {open === 'prep' && (
            <div className="flex flex-col gap-7">
              <RecoveryDetail readiness={readiness} />
              <LearnedInsights learning={learning} />
              <div className="flex flex-col gap-3">
                <SectionLabel>Carga acumulada</SectionLabel>
                <AcwrGauge result={acwr} trend={trend} />
              </div>
            </div>
          )}

          {open === 'strain' && strain && <StrainDetail view={strain} onAdjust={onAdjustSession} />}

          {open === 'consistency' && consistencyDetail}
        </div>
  ) : null;

  return (
    <section>
      {/* Plan y constancia: lo primero bajo "Hoy", en círculos con su título completo debajo. */}
      <div className={`grid gap-1.5 ${structureRow ? 'grid-cols-2' : 'grid-cols-1 px-[28%]'}`}>
        {structureRow && (
          <SmallRingButton
            selected={open === 'plan'}
            onClick={() => toggle('plan')}
            label="Plan activo"
            word={week ? `Semana ${week[1]} de ${week[2]}` : 'En curso'}
            title={`${structureRow.label} · ${structureRow.sublabel}`}
            ring={
              <Ring fraction={planPct / 100} color="rgb(var(--c-white))">
                <span className={`${numberClass} text-[1.15rem]`}>
                  {planPct}
                  <span className="text-[0.55em] font-medium text-neutral-400">%</span>
                </span>
              </Ring>
            }
          />
        )}
        <SmallRingButton
          selected={open === 'consistency'}
          onClick={() => toggle('consistency')}
          label="Constancia"
          word={yearConsistency.pct !== null ? `${yearConsistency.days} días este año` : 'Sin datos'}
          title="Constancia del año: días entrenados frente a los previstos desde que empezaste"
          ring={
            <Ring fraction={(yearConsistency.pct ?? 0) / 100} color="rgb(var(--c-white))">
              <span className={`${numberClass} text-[1.15rem]`}>
                {yearConsistency.pct !== null ? yearConsistency.pct : '—'}
                {yearConsistency.pct !== null && <span className="text-[0.55em] font-medium text-neutral-400">%</span>}
              </span>
            </Ring>
          }
        />
      </div>
      {(open === 'plan' || open === 'consistency') && panel}

      {checkIn && <div className="mt-4">{checkIn}</div>}

      <div className={`mt-3 grid items-end gap-1.5 ${strain ? 'grid-cols-2' : 'grid-cols-1 px-[22%]'}`}>
        <RingButton
          selected={open === 'prep'}
          onClick={() => toggle('prep')}
          label="Preparación"
          word={level ? LEVEL_SHORT[level] : 'Sin datos'}
          wordColor={recoveryTint}
          extraWord={hasLoad ? ZONE_WORD[acwr.zone] : undefined}
          extraColor={hasLoad ? ZONE_COLOR[acwr.zone] : undefined}
          title="Preparación (anillo exterior) y carga (anillo interior)"
        >
          <DoubleRing
            outer={(total ?? 0) / 100}
            outerColor={recoveryTint}
            inner={(acwr.acwr ?? 0) / 2}
            innerColor={hasLoad ? ZONE_COLOR[acwr.zone] : NEUTRAL}
          >
            <span className={`${numberClass} text-[clamp(1.3rem,6.4vw,1.95rem)]`}>
              {total !== null ? total : '—'}
              {total !== null && <span className="text-[0.5em] font-medium text-neutral-400">%</span>}
            </span>
          </DoubleRing>
        </RingButton>

        {strain && (
          <RingButton
            selected={open === 'strain'}
            onClick={() => toggle('strain')}
            label="Esfuerzo"
            word={strainWord(strain)}
            wordColor={strainColor(strain)}
            extraWord={`Objetivo ${strain.target.low}–${strain.target.high}`}
            title="Esfuerzo de hoy: el objetivo (anillo exterior) y tu esfuerzo (anillo interior)"
          >
            <StrainRing view={strain} />
          </RingButton>
        )}
      </div>

      {advice && (
        <p className="mt-3 text-center text-sm font-semibold" style={{ color: advice.color }}>
          {advice.text}
        </p>
      )}
      {driver && <p className={`${advice ? 'mt-0.5' : 'mt-3'} text-center text-xs text-neutral-400`}>{driver}</p>}
      {open === null && !advice && !driver && <p className="mt-3 text-center text-[11px] text-neutral-600">Toca un anillo para ver el detalle</p>}

      {(open === 'prep' || open === 'strain') && panel}
    </section>
  );
}
