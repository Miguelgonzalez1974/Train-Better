import { CoachAccuracyCard } from './CoachAccuracyCard';
import { useMemo, useState, type ReactNode } from 'react';
import { Dumbbell, Fingerprint } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import { analysisRexLine, openGoalMovements, PROPOSAL_WEEKS } from './rexAnalysis';
import { getImbalanceBias } from '../../engine/imbalances';
import { buildProgressionLedger } from '../../engine/progression';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { analysisHeadline } from '../../engine/analysisHeadline';
import { competitionTile, rpeTrend, topRiser } from '../../engine/analysisStats';
import { computeMonthPlan } from '../../engine/monthPlan';
import { learnHardness } from '../../engine/hardnessLearning';
import type { ImbalanceGroup } from '../../engine/imbalances';
import { buildLoadRows } from '../../engine/loadLearning';
import { computeResponseProfile, RESPONSE_MIN_WEEKS } from '../../engine/responseProfile';
import { EnergyDomainsCard } from './EnergyDomainsCard';
import { ImbalancesCard } from './ImbalancesCard';
import { PR_ROWS } from './PersonalRecordsCard';
import { Term } from '../shell/Term';
import { ResponseProfileCard } from './ResponseProfileCard';
import { PerfilAtleta } from '../objetivos/PerfilAtleta';
import { computeAthleteDiagnosis } from '../../engine/athleteDiagnosis';
import type { MonthlyStats } from './stats';

export type AnalysisTab = 'equilibrio' | 'coach' | 'perfil';

const comma = (n: number | string) => String(n).replace('.', ',');

/** Nombre corto de cada levantamiento para caber en una casilla de la fila de arriba. */
const SHORT_LIFT: Record<string, string> = {
  backSquat: 'B. Squat',
  frontSquat: 'F. Squat',
  deadlift: 'Deadlift',
  benchPress: 'Bench',
  strictPress: 'Strict',
  snatch: 'Snatch',
  clean: 'Clean',
  cleanAndJerk: 'C&J',
};

interface StatTileProps {
  value: string;
  /** La palabra de debajo del número (la que dice si va bien o mal). */
  note: ReactNode;
  label: string;
  /** La etiqueta con algún término explicable (ver `Term`); si no se da, sale `label`. */
  labelNode?: ReactNode;
  tone: 'good' | 'warn' | 'neutral' | 'gold';
  /** Nombre en vez de cifra: letra algo más pequeña para que quepa. */
  small?: boolean;
  highlight?: boolean;
}

const TILE_TONE: Record<StatTileProps['tone'], string> = {
  good: 'text-good',
  warn: 'text-warn',
  neutral: 'text-neutral-400',
  gold: 'text-brand-gold',
};

function StatTile({ value, note, label, labelNode, tone, small, highlight }: StatTileProps) {
  return (
    <div className={`min-w-0 rounded-xl px-0.5 pb-1.5 pt-2 ${highlight ? 'bg-brand-gold/15' : 'bg-white/[0.035]'}`}>
      <p className={`num truncate font-extrabold leading-tight ${small ? 'pt-px text-[11px]' : 'text-[13px]'} ${tone === 'gold' ? 'text-brand-gold' : 'text-white'}`}>{value}</p>
      <p className={`mt-0.5 text-[11px] font-bold leading-tight ${TILE_TONE[tone]}`}>{note}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-neutral-500">{labelNode ?? label}</p>
    </div>
  );
}

function TabButton({ active, onClick, label, value, hint, hintClass }: { active: boolean; onClick: () => void; label: string; value: string; hint: string; hintClass: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-w-0 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-white/[0.09]' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
    >
      <span className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-neutral-400'}`}>{label}</span>
      <span className="num text-lg font-bold leading-tight text-white">{value}</span>
      <span className={`truncate text-[11px] font-semibold ${hintClass}`}>{hint}</span>
    </button>
  );
}

/**
 * El Análisis: un titular con lo importante y tres pestañas (Equilibrio, Coach, Perfil; las marcas están en «Mis marcas») que enseñan una cosa cada una, en vez de
 * una pila de tarjetas. Solo reordena lo que ya se calcula en otros sitios; no cambia nada de lo que programa el coach.
 */
export function AnalysisView({
  profile,
  history,
  imbalanceGroups,
  strengthRatio,
  energyAdherencePct,
  bodyweightKg,
  stats,
  todayIso,
  onCreateGoal,
  onOpenObjetivos,
  initialTab = 'equilibrio',
  onSaveProfile,
  onOpenProgramming,
}: {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  imbalanceGroups: ImbalanceGroup[];
  strengthRatio: number | null;
  energyAdherencePct: number | null;
  bodyweightKg?: number;
  stats: MonthlyStats;
  todayIso: string;
  /** Rex crea un objetivo «Subir PR» a partir de lo que ha visto aquí. */
  onCreateGoal?: (movementId: string) => void;
  /** Ir a Objetivos para cambiarlo hablando con Rex. */
  onOpenObjetivos?: () => void;
  /** La pestaña con la que se abre (p. ej. «perfil» cuando se llega desde «Mi perfil»). */
  initialTab?: AnalysisTab;
  /** Guarda los cambios del perfil (el «Cuadra / No cuadra» de la pestaña Perfil). */
  onSaveProfile?: (patch: Partial<AthleteProfile>) => void;
  /** Ir a Objetivos → cómo programa el coach con el perfil. */
  onOpenProgramming?: () => void;
}) {
  const [tab, setTabRaw] = useState<AnalysisTab>(initialTab);
  // Cambiar de pestaña cierra la propuesta a medias (cada pestaña tiene la suya).
  const setTab = (next: AnalysisTab) => {
    setTabRaw(next);
    setProposalState('idle');
    setCreatedLabel(null);
  };
  const [energyOpen, setEnergyOpen] = useState(true);
  const [imbalancesOpen, setImbalancesOpen] = useState(true);
  // La propuesta de objetivo de Rex: cerrada, pidiendo confirmación, o ya creada (con el nombre del levantamiento).
  const [proposalState, setProposalState] = useState<'idle' | 'confirm'>('idle');
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);

  const { prs } = profile;
  const prLog = profile.prLog ?? [];
  const setFeedbackLog = profile.setFeedbackLog ?? [];
  const workLog = profile.workLog ?? [];
  const bodyweightLog = profile.bodyweightLog ?? [];

  const response = useMemo(
    () => computeResponseProfile(history, prLog, new Date(), setFeedbackLog, bodyweightLog, workLog, prs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, profile.prLog, profile.setFeedbackLog, profile.bodyweightLog, profile.workLog, prs],
  );
  const loadRows = useMemo(() => buildLoadRows(prs, response, setFeedbackLog), [prs, response, setFeedbackLog]);
  // Cómo aguantas la dureza que subes (se enseña en la pestaña Coach).
  const hardness = useMemo(() => learnHardness(profile, history, todayIso), [profile, history, todayIso]);
  const desbalances = imbalanceGroups.filter((g) => g.status === 'desbalance').length;
  const equilibrados = imbalanceGroups.filter((g) => g.status === 'equilibrado').length;
  const headline = useMemo(
    () => analysisHeadline({ loadRows, perLift: response.perLift, desbalances, equilibrados }),
    [loadRows, response.perLift, desbalances, equilibrados],
  );
  // Rex: la conclusión de la pestaña que miras y, si hay un levantamiento claro que mejorar, un objetivo ya montado.
  const weakLiftIds = useMemo(() => getImbalanceBias(profile.prs, profile.variantPrs, history).strengthLiftIds, [profile.prs, profile.variantPrs, history]);
  const ledger = useMemo(
    () => buildProgressionLedger(profile.progressionLog, profile.prLog, profile.progressionSettings, profile.emphasisPlan),
    [profile.progressionLog, profile.prLog, profile.progressionSettings, profile.emphasisPlan],
  );
  const diagnosis = useMemo(() => computeAthleteDiagnosis({ profile, history }), [profile, history]);
  const priorities = diagnosis.focus.filter((f) => f.kind === 'prioridad').length;
  const rexBase = analysisRexLine({
    tab: tab === 'perfil' ? 'coach' : tab,
    headline,
    strengthRatio,
    perLift: response.perLift,
    imbalances: imbalanceGroups,
    weakLiftIds,
    confident: response.confident,
    weeks: Math.floor(response.dataWeeks),
    minWeeks: RESPONSE_MIN_WEEKS,
    ledger: { resolved: ledger.resolved, hits: ledger.hits, rows: ledger.rows },
    openGoalMovementIds: openGoalMovements(profile, todayIso),
  });
  const rex = tab === 'perfil' ? { lead: 'Tu perfil.', tone: 'neutral' as const, text: diagnosis.headline, proposal: null } : rexBase;

  const weeks = Math.floor(response.dataWeeks);

  // La fila de cifras de arriba.
  const monthPlan = useMemo(() => computeMonthPlan(profile, history, new Date()), [profile, history]);
  const riser = useMemo(
    () => topRiser(prLog, PR_ROWS.map((r) => r.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.prLog],
  );
  const trend = rpeTrend(stats.rpeMedioSemana, stats.rpeMedio);
  const compTile = useMemo(() => competitionTile(profile.goals, new Date(), profile.trainingDaysPerWeek), [profile.goals, profile.trainingDaysPerWeek]);
  const rpeLabel = (
    <>
      <Term k="rpe">RPE</Term> semana
    </>
  );
  const rxLabel = (
    <>
      WODs <Term k="rx">Rx</Term>
    </>
  );
  const tiles: StatTileProps[] = [
    monthPlan.pct === null
      ? { value: '—', note: 'sin días aún', label: 'sesiones plan', tone: 'neutral' }
      : { value: `${monthPlan.done}/${monthPlan.planned}`, note: `${monthPlan.pct} %`, label: 'sesiones plan', tone: monthPlan.pct >= 80 ? 'good' : monthPlan.pct >= 60 ? 'neutral' : 'warn' },
    riser
      ? { value: SHORT_LIFT[riser.key] ?? riser.key, note: `▲ +${Math.round(riser.deltaPct)} %`, label: 'más ha subido', tone: 'good', small: true }
      : { value: '—', note: 'sin subidas', label: 'más ha subido', tone: 'neutral' },
    stats.rpeMedioSemana === null
      ? { value: '—', note: 'sin sesiones', label: 'RPE semana', labelNode: rpeLabel, tone: 'neutral' }
      : {
          value: comma(stats.rpeMedioSemana.toFixed(1)),
          note: trend === 'duro' ? 'más duro' : trend === 'suave' ? 'más suave' : 'igual',
          label: 'RPE semana',
          labelNode: rpeLabel,
          tone: trend === 'duro' ? 'warn' : trend === 'suave' ? 'good' : 'neutral',
        },
    stats.diasEntrenados === 0
      ? { value: '—', note: 'sin sesiones', label: 'WODs Rx', labelNode: rxLabel, tone: 'neutral' }
      : { value: `${stats.diasRx}/${stats.diasEntrenados}`, note: response.rx.trend === 'bajando' ? 'escalas más' : 'sin escalar', label: 'WODs Rx', labelNode: rxLabel, tone: response.rx.trend === 'bajando' ? 'warn' : 'neutral' },
  ];
  if (compTile) tiles.push({ value: compTile.value, note: compTile.word === 'taper' ? <Term k="taper">taper</Term> : compTile.word, label: 'competición', tone: 'gold', highlight: compTile.close });
  const rpeNote =
    stats.rpeMedioSemana !== null && stats.rpeMedio !== null
      ? `RPE: esfuerzo medio de tus sesiones esta semana (${comma(stats.rpeMedioSemana.toFixed(1))}) frente a la media del mes (${comma(stats.rpeMedio.toFixed(1))}). WODs Rx: los que hiciste como estaban prescritos, sin escalar.`
      : null;

  const balanceHint =
    desbalances > 0
      ? { text: `⚠ ${desbalances} ${desbalances === 1 ? 'desbalance' : 'desbalances'}`, cls: 'text-warn' }
      : equilibrados > 0
        ? { text: '● bien', cls: 'text-good' }
        : { text: 'sin datos', cls: 'text-neutral-500' };

  return (
    <div className="flex flex-col gap-4">
      {/* Las cifras del mes de un vistazo: cumples el plan, qué sube, cuánto aprietas, cuánto escalas y cuánto falta para competir. */}
      <div>
        <div className={`grid gap-1 text-center ${compTile ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {tiles.map((t) => (
            <StatTile key={t.label} {...t} />
          ))}
        </div>
        {rpeNote && <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-neutral-500">{rpeNote}</p>}
      </div>

      {/* Rex: la conclusión de la pestaña que miras. Los números están debajo, en las pestañas. */}
      <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Lo que dice Rex">
        <div className="flex items-start gap-3">
          <RexMascot size={36} mood={createdLabel ? 'happy' : rex.tone === 'good' ? 'happy' : rex.tone === 'warn' ? 'think' : 'idle'} />
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-[13px] leading-relaxed text-neutral-200">
              <strong className={`font-bold ${rex.tone === 'good' ? 'text-good' : rex.tone === 'warn' ? 'text-warn' : 'text-white'}`}>{rex.lead}</strong> {rex.text}
            </p>

            {createdLabel ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <p className="text-[13px] text-good">Creado: Subir PR · {createdLabel}.</p>
                {onOpenObjetivos && (
                  <button onClick={onOpenObjetivos} className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white">
                    Ver objetivos
                  </button>
                )}
              </div>
            ) : (
              rex.proposal &&
              onCreateGoal &&
              (proposalState === 'idle' ? (
                <button
                  onClick={() => setProposalState('confirm')}
                  className="mt-2.5 rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark"
                >
                  Crear un objetivo con esto
                </button>
              ) : (
                <div className="mt-2.5 rounded-xl border border-brand-orange/40 bg-brand-orange/[0.08] p-3">
                  <p className="text-[13px] font-semibold text-white">Subir PR · {rex.proposal.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    En {PROPOSAL_WEEKS} semanas · énfasis moderado · lo propongo porque {rex.proposal.why}.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const proposal = rex.proposal;
                        if (!proposal) return;
                        onCreateGoal(proposal.movementId);
                        setCreatedLabel(proposal.label);
                        setProposalState('idle');
                      }}
                      className="rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark"
                    >
                      Crearlo
                    </button>
                    {onOpenObjetivos && (
                      <button onClick={onOpenObjetivos} className="rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white">
                        Cambiar algo con Rex
                      </button>
                    )}
                    <button onClick={() => setProposalState('idle')} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
                      No
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Análisis">
        <TabButton
          active={tab === 'equilibrio'}
          onClick={() => setTab('equilibrio')}
          label="Equilibrio"
          value={energyAdherencePct !== null ? `${energyAdherencePct}%` : '—'}
          hint={balanceHint.text}
          hintClass={balanceHint.cls}
        />
        <TabButton
          active={tab === 'coach'}
          onClick={() => setTab('coach')}
          label="Coach"
          value={response.confident ? 'Activo' : `${weeks}/${RESPONSE_MIN_WEEKS}`}
          hint={response.confident ? 'aprende de ti' : 'aprendiendo'}
          hintClass={response.confident ? 'text-brand-neon' : 'text-neutral-500'}
        />
        <TabButton
          active={tab === 'perfil'}
          onClick={() => setTab('perfil')}
          label="Perfil"
          value={diagnosis.focus.length > 0 ? String(priorities) : '—'}
          hint={priorities > 0 ? (priorities === 1 ? 'prioridad' : 'prioridades') : 'sin datos'}
          hintClass={priorities > 0 ? 'text-brand-orange' : 'text-neutral-500'}
        />
      </div>

      {tab === 'perfil' && onSaveProfile && <PerfilAtleta profile={profile} history={history} onChange={onSaveProfile} mode="analisis" onOpenOther={onOpenProgramming} />}

      {tab === 'equilibrio' && (
        <div className="animate-section-in flex flex-col divide-y divide-white/10 motion-reduce:animate-none">
          <EnergyDomainsCard profile={profile} history={history} collapsed={!energyOpen} onToggleCollapsed={() => setEnergyOpen((v) => !v)} />
          <ImbalancesCard groups={imbalanceGroups} collapsed={!imbalancesOpen} onToggleCollapsed={() => setImbalancesOpen((v) => !v)} />
        </div>
      )}

      {tab === 'coach' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <p className="flex items-center gap-2 px-1 text-[11px] leading-snug text-neutral-500">
            <Fingerprint size={13} className="shrink-0" aria-hidden="true" />
            Lo que el coach ha aprendido de cómo respondes y cómo lo aplica a tu programación.
          </p>
          <ResponseProfileCard
            history={history}
            prLog={prLog}
            setFeedbackLog={setFeedbackLog}
            bodyweightLog={bodyweightLog}
            workLog={workLog}
            prs={prs}
            defaultOpen
            hardness={hardness}
          />
          <CoachAccuracyCard profile={profile} todayIso={todayIso} />
          <p className="flex items-center gap-2 px-1 text-[11px] leading-snug text-neutral-500">
            <Dumbbell size={13} className="shrink-0" aria-hidden="true" />
            Los ajustes de carga por levantamiento están en Mis marcas (Rex → Marcas).
          </p>
        </div>
      )}
    </div>
  );
}
