import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, LayoutList, ChevronRight, Target } from 'lucide-react';
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

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
}

/** Flag booleano recordado por navegador (secciones plegables del Dashboard). */
function usePersistedFlag(key: string): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setValue((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* almacenamiento no disponible — el estado vive solo esta sesión */
      }
      return next;
    });
  return [value, toggle];
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  // La sección "Más detalle" arranca plegada — lo esencial (sesión de hoy, avisos, los 6 gauges)
  // queda arriba y el resto (PRs, heatmap, peso, y lo que antes vivía en un plegable anidado
  // "Análisis del coach": perfil de respuesta, dominios, desequilibrios) detrás de un clic. Cada
  // gauge puede abrir esta sección Y la tarjeta concreta a la vez (ver `jumpTo`).
  const [detailOpen, toggleDetail] = usePersistedFlag('train-better:dashboard-detail-open');
  const [energyCollapsed, setEnergyCollapsed] = useState(true);
  const [imbalancesCollapsed, setImbalancesCollapsed] = useState(true);
  const [acwrExpanded, setAcwrExpanded] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<GaugeTarget | null>(null);

  const prsRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);
  const weakRef = useRef<HTMLDivElement>(null);
  const energyRef = useRef<HTMLDivElement>(null);
  const imbalancesRef = useRef<HTMLDivElement>(null);

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

  // Salta a la tarjeta de detalle del gauge tocado: abre "Más detalle" (y su plegable propio, si lo
  // tiene) y desplaza suave hasta ella una vez montada — el gauge es el atajo, no hace falta bucear.
  function jumpTo(target: GaugeTarget) {
    if (target === 'acwr') {
      setAcwrExpanded((v) => !v);
      return;
    }
    if (!detailOpen) toggleDetail();
    if (target === 'energy') setEnergyCollapsed(false);
    if (target === 'imbalances') setImbalancesCollapsed(false);
    setScrollTarget(target);
  }

  useEffect(() => {
    if (!scrollTarget) return;
    const refs: Record<Exclude<GaugeTarget, 'acwr'>, React.RefObject<HTMLDivElement>> = {
      prs: prsRef,
      heatmap: heatmapRef,
      weak: weakRef,
      energy: energyRef,
      imbalances: imbalancesRef,
    };
    const target = scrollTarget;
    const frame = requestAnimationFrame(() => {
      refs[target as Exclude<GaugeTarget, 'acwr'>].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget, detailOpen, energyCollapsed, imbalancesCollapsed]);

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
            onClick={() => setShowVolume(true)}
            title="Volumen por día"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <BarChart3 size={17} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {showVolume && <VolumeSummaryModal onClose={() => setShowVolume(false)} />}

      {/*
        El titular: que toca hoy, en una linea, sin tener que entrar a Planificacion para saberlo.
        Sustituye al boton generico "Entrenamiento de hoy" del header — este ya lleva el contenido.
      */}
      <TodayPreviewCard profile={profile} history={history} onNavigateToPlanificacion={onNavigateToPlanificacion} />

      <AttentionBanner items={attentionItems} />

      {/*
        Los 6 gauges: todo lo esencial de un vistazo, cada uno un atajo directo a su detalle. Fila 1
        = cómo vas ahora mismo (carga, constancia, dominios); fila 2 = qué tal progresas (patrones,
        desequilibrios, PRs). El de carga expande el gauge completo de ACWR justo debajo, sin salir
        de aquí; el resto abre "Más detalle" y salta a su tarjeta.
      */}
      <MetricsGauges row1={row1} row2={row2} onJumpTo={jumpTo} />
      {acwrExpanded && <AcwrGauge result={acwr} trend={acwrTrend} />}

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

      <div className="flex flex-col gap-4">
        <button
          onClick={toggleDetail}
          className="flex items-center justify-between rounded-xl border border-brand-border/70 bg-brand-surface/40 px-4 py-3 text-left transition-colors duration-200 hover:border-brand-gold/40"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <LayoutList size={15} strokeWidth={2.25} className="text-neutral-500" />
            {detailOpen ? 'Ocultar detalle' : 'Más detalle'}
          </span>
          <span className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="hidden sm:inline">PRs · constancia · peso · análisis del coach</span>
            {detailOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {detailOpen && (
          <>
            {/*
              Lo que el atleta mira y acciona: PRs, constancia, peso corporal y puntos débiles.
              Emparejadas por altura natural (PRs y constancia son las más altas); items-start para
              no estirar ninguna a la del vecino.
            */}
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <div ref={prsRef}>
                <PersonalRecordsCard
                  prs={profile.prs}
                  trends={prTrends}
                  prLog={profile.prLog ?? []}
                  macroStartIso={getActiveMacrocycle(profile.macrocycles, todayIso)?.startDate}
                />
              </div>

              <div ref={heatmapRef}>
                <TrainingHeatmap history={history} trainingDaysPerWeek={profile.trainingDaysPerWeek} macrocycles={profile.macrocycles} />
              </div>
            </div>

            <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} />

            <div ref={weakRef}>
              <WeakPointsCard points={weakPoints} />
            </div>

            {/*
              Lo que antes vivía en el plegable anidado "Análisis del coach" — ahora cada tarjeta es
              el destino directo de un gauge, así que el paso intermedio ya no aporta nada; siguen
              plegadas por defecto (menos ruido), pero un toque en el gauge las abre solas.
            */}
            <div ref={energyRef}>
              <EnergyDomainsCard profile={profile} history={history} collapsed={energyCollapsed} onToggleCollapsed={() => setEnergyCollapsed((c) => !c)} />
            </div>

            <div ref={imbalancesRef}>
              <ImbalancesCard groups={imbalanceGroups} collapsed={imbalancesCollapsed} onToggleCollapsed={() => setImbalancesCollapsed((c) => !c)} />
            </div>

            <ResponseProfileCard
              history={history}
              prLog={profile.prLog ?? []}
              setFeedbackLog={profile.setFeedbackLog ?? []}
              bodyweightLog={profile.bodyweightLog ?? []}
              workLog={profile.workLog ?? []}
              prs={profile.prs}
            />
          </>
        )}
      </div>
    </div>
  );
}
