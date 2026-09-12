import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Scale, ChevronRight, Target } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeWeekCount } from '../../engine/adherence';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import { getMonthlyStats } from './stats';
import { computeWeakPoints, computePrTrends } from '../../engine/weakPoints';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { MetricsGauges, ACWR_ZONE_STROKE, type GaugeSpec, type GaugeTarget } from './MetricsGauges';
import { AcwrGauge } from './AcwrGauge';
import { TodayPreviewCard } from './TodayPreviewCard';
import { WeakPointsCard } from './WeakPointsCard';
import { TrainingHeatmap } from './TrainingHeatmap';
import { VolumeSummaryModal } from './VolumeSummaryModal';
import { BodyweightCard } from './BodyweightCard';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { AttentionBanner, buildAttentionItems } from './AttentionBanner';
import { ThemeToggle } from '../shell/ThemeToggle';
import { ImbalancesCard } from './ImbalancesCard';
import { computeImbalances } from '../../engine/imbalances';
import { ResponseProfileCard } from './ResponseProfileCard';
import { EnergyDomainsCard } from './EnergyDomainsCard';
import { Modal } from '../shell/Modal';

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  const [showBodyweight, setShowBodyweight] = useState(false);

  // Cada gauge abre (o cierra, si ya estaba abierta) su propia tarjeta de detalle — sin un "Más
  // detalle" intermedio que bucear. El de carga expande el gauge completo de ACWR ahí mismo; el
  // resto revela su tarjeta justo debajo de la fila de gauges.
  const [acwrOpen, setAcwrOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [weakOpen, setWeakOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [imbalancesOpen, setImbalancesOpen] = useState(false);
  const [prsOpen, setPrsOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<GaugeTarget | null>(null);

  const heatmapRef = useRef<HTMLDivElement>(null);
  const weakRef = useRef<HTMLDivElement>(null);
  const energyRef = useRef<HTMLDivElement>(null);
  const imbalancesRef = useRef<HTMLDivElement>(null);
  const prsRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => getMonthlyStats(history, profile.trainingDatesLog ?? []), [history, profile.trainingDatesLog]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const acwrTrend = useMemo(() => getAcwrTrend(history), [history]);
  const weakPoints = useMemo(() => computeWeakPoints(history), [history]);
  const prTrends = useMemo(() => computePrTrends(history), [history]);
  const todayIso = toLocalIsoDate(new Date());
  const structureRow = useMemo(() => buildStructureRow(profile, todayIso), [profile, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);
  const attentionItems = useMemo(() => buildAttentionItems(acwr, weakPoints), [acwr, weakPoints]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);
  const weekCount = useMemo(() => computeWeekCount(profile, history, new Date()), [profile, history]);
  const conditioningBalance = useMemo(() => computeConditioningBalance(profile, history, new Date()), [profile, history]);

  // Alterna la tarjeta (abre si estaba cerrada, cierra si ya estaba abierta) y solo desplaza la
  // vista cuando se abre — cerrarla no necesita mover nada.
  function toggleAndMaybeScroll(current: boolean, setOpen: (v: boolean) => void, target: GaugeTarget) {
    const next = !current;
    setOpen(next);
    if (next) setScrollTarget(target);
  }

  function jumpTo(target: GaugeTarget) {
    switch (target) {
      case 'acwr':
        return setAcwrOpen((v) => !v);
      case 'heatmap':
        return toggleAndMaybeScroll(heatmapOpen, setHeatmapOpen, target);
      case 'weak':
        return toggleAndMaybeScroll(weakOpen, setWeakOpen, target);
      case 'energy':
        return toggleAndMaybeScroll(energyOpen, setEnergyOpen, target);
      case 'imbalances':
        return toggleAndMaybeScroll(imbalancesOpen, setImbalancesOpen, target);
      case 'prs':
        return toggleAndMaybeScroll(prsOpen, setPrsOpen, target);
    }
  }

  useEffect(() => {
    if (!scrollTarget) return;
    const refs: Partial<Record<GaugeTarget, React.RefObject<HTMLDivElement>>> = {
      heatmap: heatmapRef,
      weak: weakRef,
      energy: energyRef,
      imbalances: imbalancesRef,
      prs: prsRef,
    };
    const frame = requestAnimationFrame(() => {
      refs[scrollTarget]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget]);

  // --- Los 6 gauges: solo métricas que ya se calculan en algún sitio de la app, ninguna inventada. ---
  const healthyPatterns = weakPoints.filter((p) => p.status !== 'sin-datos');
  const patternsOk = healthyPatterns.filter((p) => p.status === 'en-progreso').length;
  const balancedPairs = imbalanceGroups.filter((g) => g.status !== 'faltan-datos');
  const balancedOk = balancedPairs.filter((g) => g.status === 'equilibrado').length;
  const prTrendValues = Object.values(prTrends);
  const prsUp = prTrendValues.filter((t) => t === 'subida').length;
  const energyAdherencePct =
    conditioningBalance && conditioningBalance.totalPlanned > 0
      ? Math.round((conditioningBalance.totalDone / conditioningBalance.totalPlanned) * 100)
      : null;

  const row1: GaugeSpec[] = [
    {
      label: 'Carga (ACWR)',
      valueLabel: acwr.acwr !== null ? acwr.acwr.toFixed(2) : '—',
      fraction: acwr.acwr !== null ? acwr.acwr / 2 : 0,
      strokeClass: acwr.acwr !== null ? ACWR_ZONE_STROKE[acwr.zone] : 'stroke-neutral-600',
      target: 'acwr',
    },
    {
      label: 'Constancia (semana)',
      valueLabel: `${weekCount.done}/${weekCount.planned}`,
      fraction: weekCount.planned > 0 ? weekCount.done / weekCount.planned : 0,
      strokeClass: 'stroke-brand-gold',
      target: 'heatmap',
    },
    {
      label: 'Dominios energéticos',
      valueLabel: energyAdherencePct !== null ? `${energyAdherencePct}%` : '—',
      fraction: (energyAdherencePct ?? 0) / 100,
      strokeClass: energyAdherencePct !== null ? 'stroke-sky-400' : 'stroke-neutral-600',
      target: 'energy',
    },
  ];

  const row2: GaugeSpec[] = [
    {
      label: 'Salud de patrones',
      valueLabel: healthyPatterns.length > 0 ? `${patternsOk}/${healthyPatterns.length}` : '—',
      fraction: healthyPatterns.length > 0 ? patternsOk / healthyPatterns.length : 0,
      strokeClass: healthyPatterns.length > 0 ? 'stroke-brand-neon' : 'stroke-neutral-600',
      target: 'weak',
    },
    {
      label: 'Desequilibrios',
      valueLabel: balancedPairs.length > 0 ? `${balancedOk}/${balancedPairs.length}` : '—',
      fraction: balancedPairs.length > 0 ? balancedOk / balancedPairs.length : 0,
      strokeClass: balancedPairs.length > 0 ? 'stroke-purple-400' : 'stroke-neutral-600',
      target: 'imbalances',
    },
    {
      label: 'Progreso de PRs',
      valueLabel: prTrendValues.length > 0 ? `${prsUp}/${prTrendValues.length}` : '—',
      fraction: prTrendValues.length > 0 ? prsUp / prTrendValues.length : 0,
      strokeClass: prTrendValues.length > 0 ? 'stroke-rose-400' : 'stroke-neutral-600',
      target: 'prs',
    },
  ];

  const hasStructure = Boolean(structureRow) || goalRows.length > 0;
  const goalsLabel = `${goalRows.length} ${goalRows.length === 1 ? 'objetivo activo' : 'objetivos activos'}`;
  const StructureIcon = structureRow?.Icon ?? Target;
  const structureColor = structureRow?.color ?? '#d4af37';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400 capitalize">{MONTH_LABEL}</p>
          <p className="text-lg font-semibold text-white">Resumen</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <ThemeToggle className="h-10 w-10" />
          <button
            onClick={() => setShowBodyweight(true)}
            title="Peso corporal"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Scale size={17} strokeWidth={2.25} />
          </button>
          <button
            onClick={() => setShowVolume(true)}
            title="Volumen por día"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <BarChart3 size={17} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {showVolume && <VolumeSummaryModal onClose={() => setShowVolume(false)} />}
      {showBodyweight && (
        <Modal open onClose={() => setShowBodyweight(false)} title="Peso corporal">
          <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
        </Modal>
      )}

      {/*
        El titular: que toca hoy, en una linea, sin tener que entrar a Planificacion para saberlo.
      */}
      <TodayPreviewCard profile={profile} history={history} onNavigateToPlanificacion={onNavigateToPlanificacion} />

      <AttentionBanner items={attentionItems} />

      {/*
        Los 6 gauges: todo lo esencial de un vistazo, cada uno la puerta directa a su detalle. Fila 1
        = cómo vas ahora mismo (carga, constancia, dominios); fila 2 = qué tal progresas (patrones,
        desequilibrios, PRs). Debajo, solo la(s) tarjeta(s) cuyo gauge se ha tocado — nada se ve sin
        pedirlo antes.
      */}
      <MetricsGauges row1={row1} row2={row2} onJumpTo={jumpTo} />
      {acwrOpen && <AcwrGauge result={acwr} trend={acwrTrend} />}

      {heatmapOpen && (
        <div ref={heatmapRef}>
          <TrainingHeatmap history={history} trainingDaysPerWeek={profile.trainingDaysPerWeek} macrocycles={profile.macrocycles} />
        </div>
      )}

      {energyOpen && (
        <div ref={energyRef}>
          <EnergyDomainsCard profile={profile} history={history} collapsed={false} onToggleCollapsed={() => setEnergyOpen(false)} />
        </div>
      )}

      {weakOpen && (
        <div ref={weakRef}>
          <WeakPointsCard points={weakPoints} />
        </div>
      )}

      {imbalancesOpen && (
        <div ref={imbalancesRef}>
          <ImbalancesCard groups={imbalanceGroups} collapsed={false} onToggleCollapsed={() => setImbalancesOpen(false)} />
        </div>
      )}

      {prsOpen && (
        <div ref={prsRef}>
          <PersonalRecordsCard
            prs={profile.prs}
            trends={prTrends}
            prLog={profile.prLog ?? []}
            macroStartIso={getActiveMacrocycle(profile.macrocycles, todayIso)?.startDate}
          />
        </div>
      )}

      {/* Lo que no encaja en un gauge (no es "N de M"): totales del mes, tal cual, en una línea. */}
      {stats.diasEntrenados > 0 && (
        <p className="px-1 text-center text-[11px] text-neutral-500">
          <span className="num font-semibold text-neutral-300">{stats.diasEntrenados}</span> días entrenados este mes
          {stats.diasEsteAnio > 0 && (
            <>
              {' '}
              (<span className="num">{stats.diasEsteAnio}</span> en el año)
            </>
          )}
          {' · '}
          <span className="num font-semibold text-neutral-300">
            {stats.diasRx}/{stats.diasEntrenados}
          </span>{' '}
          Rx
          {stats.rpeMedio !== null && (
            <>
              {' · RPE medio '}
              <span className="num font-semibold text-neutral-300">{stats.rpeMedio.toFixed(1)}</span>
            </>
          )}
        </p>
      )}

      {hasStructure && (
        <button
          onClick={onNavigateToObjetivos}
          title="Ver macrociclos y objetivos"
          className="card flex items-center gap-2.5 p-3 text-left transition-colors duration-200 hover:border-brand-gold/40"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${structureColor}26`, color: structureColor }}
          >
            <StructureIcon size={14} strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">
            {structureRow ? (
              <>
                {structureRow.label} <span className="text-neutral-500">· {structureRow.sublabel}</span>
                {goalRows.length > 0 && <span className="text-neutral-500"> · {goalsLabel}</span>}
              </>
            ) : (
              goalsLabel
            )}
          </span>
          <ChevronRight size={14} strokeWidth={2.25} className="shrink-0 text-neutral-600" />
        </button>
      )}

      {/*
        Perfil de respuesta se queda siempre visible, sin gauge propio — es una actividad continua
        del coach (calibrando cómo respondes), no un "N de M" puntual. Ya colapsa sola a una frase
        (ver ResponseProfileCard), así que no pesa aunque esté siempre aquí.
      */}
      <ResponseProfileCard
        history={history}
        prLog={profile.prLog ?? []}
        setFeedbackLog={profile.setFeedbackLog ?? []}
        bodyweightLog={profile.bodyweightLog ?? []}
        workLog={profile.workLog ?? []}
        prs={profile.prs}
      />
    </div>
  );
}
