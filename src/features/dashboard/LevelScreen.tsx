import { useMemo, useState, type ReactNode } from 'react';
import type { AthleteProfile, BodyweightEntry, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { analysisHeadline } from '../../engine/analysisHeadline';
import { rpeTrend } from '../../engine/analysisStats';
import { learnHardness } from '../../engine/hardnessLearning';
import { getImbalanceBias, type ImbalanceGroup } from '../../engine/imbalances';
import { computeLevel } from '../../engine/levelCategories';
import { buildLoadRows } from '../../engine/loadLearning';
import { computeMonthPlan } from '../../engine/monthPlan';
import { computeResponseProfile, RESPONSE_MIN_WEEKS } from '../../engine/responseProfile';
import { PerfilAtleta } from '../objetivos/PerfilAtleta';
import { ChipTabs } from '../shell/ChipTabs';
import { Fold } from '../shell/Fold';
import { PartGuard } from '../shell/PartGuard';
import { RexNote } from '../shell/RexNote';
import { SectionLabel } from '../shell/SectionLabel';
import { Term } from '../shell/Term';
import { BodyweightCard } from './BodyweightCard';
import { CoachAccuracyCard } from './CoachAccuracyCard';
import { EnergyDomainsCard } from './EnergyDomainsCard';
import { ImbalancesCard } from './ImbalancesCard';
import { LevelReferenceView } from './LevelReferenceView';
import { MarksContent } from './MarksContent';
import { recentWods } from './myLevelModel';
import { PR_ROWS } from './prRows';
import { analysisRexLine, openGoalMovements, PROPOSAL_WEEKS } from './rexAnalysis';
import type { MarkKey } from './rexMarks';
import { ResponseProfileCard } from './ResponseProfileCard';
import type { MonthlyStats } from './stats';
import { VolumeContent } from './VolumeSummaryModal';
import { WodPacingCard } from './WodPacingCard';
import { WodZonesCard } from './WodZonesCard';

export type LevelChip = 'nivel' | 'marcas' | 'wods' | 'cuerpo';

const CHIPS: { id: LevelChip; label: string }[] = [
  { id: 'nivel', label: 'Nivel' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'wods', label: 'WODs' },
  { id: 'cuerpo', label: 'Cuerpo' },
];

const comma = (n: number | string) => String(n).replace('.', ',');
const SHORT_DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const shortDate = (iso: string) => SHORT_DATE.format(new Date(`${iso}T12:00:00`)).replace('.', '');

interface LevelScreenProps {
  chip: LevelChip;
  onChip: (chip: LevelChip) => void;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  imbalanceGroups: ImbalanceGroup[];
  /** Total de los tres grandes en veces tu peso (null sin peso). */
  strengthRatio: number | null;
  stats: MonthlyStats;
  bodyweightLog: BodyweightEntry[];
  onBodyweightChange: (log: BodyweightEntry[]) => void;
  todayIso: string;
  /** El levantamiento que «Marcas» abre desplegado. */
  marksKey: MarkKey | null;
  onSaveProfile: (patch: Partial<AthleteProfile>) => void;
  /** Guardar marcas corregidas (recalcula las sesiones preparadas). */
  onSaveMarks: (patch: Pick<AthleteProfile, 'prs' | 'variantPrs'>) => void;
  /** Rex crea un objetivo «Subir PR» con lo que ha visto. */
  onCreateGoal: (movementId: string) => void;
  /** «Trabajarlo» en Tu WOD por zonas o en tu ritmo. */
  onCreateWorkGoal: (goal: Goal) => void;
  onOpenObjetivos: () => void;
  onOpenProgramming: () => void;
}

/** La nota de Rex del apartado Nivel: dónde estás y, si hay un levantamiento claro que mejorar, un objetivo ya montado. */
function LevelNote({ profile, history, imbalanceGroups, strengthRatio, todayIso, onCreateGoal, onOpenObjetivos }: Pick<LevelScreenProps, 'profile' | 'history' | 'imbalanceGroups' | 'strengthRatio' | 'todayIso' | 'onCreateGoal' | 'onOpenObjetivos'>) {
  const [state, setState] = useState<'idle' | 'confirm'>('idle');
  const [created, setCreated] = useState<string | null>(null);
  const rex = useMemo(() => {
    const setFeedbackLog = profile.setFeedbackLog ?? [];
    const response = computeResponseProfile(history, profile.prLog ?? [], new Date(), setFeedbackLog, profile.bodyweightLog ?? [], profile.workLog ?? [], profile.prs);
    const desbalances = imbalanceGroups.filter((g) => g.status === 'desbalance').length;
    const equilibrados = imbalanceGroups.filter((g) => g.status === 'equilibrado').length;
    const line = analysisRexLine({
      tab: 'equilibrio',
      headline: analysisHeadline({ loadRows: buildLoadRows(profile.prs, response, setFeedbackLog), perLift: response.perLift, desbalances, equilibrados }),
      strengthRatio,
      perLift: response.perLift,
      imbalances: imbalanceGroups,
      weakLiftIds: getImbalanceBias(profile.prs, profile.variantPrs, history).strengthLiftIds,
      confident: response.confident,
      weeks: Math.floor(response.dataWeeks),
      minWeeks: RESPONSE_MIN_WEEKS,
      ledger: { resolved: 0, hits: 0, rows: [] },
      openGoalMovementIds: openGoalMovements(profile, todayIso),
    });
    const level = computeLevel({ profile, history });
    const text =
      level.overall !== null
        ? `Estás en ${level.overall}${level.delta ? ` (${level.delta > 0 ? '+' : '−'}${Math.abs(level.delta)} en 3 meses)` : ''}, con ${level.filled} de ${level.categories.length} categorías con datos. Toca una para ver sus últimos entrenos.`
        : `Tienes ${level.filled} de ${level.categories.length} categorías con datos. Se van rellenando con tus marcas de barra y tus WODs en Rx.`;
    return { text, proposal: line.proposal };
  }, [profile, history, imbalanceGroups, strengthRatio, todayIso]);

  const pill = 'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors';
  return (
    <RexNote tone="info" mood={created ? 'happy' : 'idle'}>
      <p className="text-[13px] leading-relaxed text-neutral-200">
        <strong className="font-bold text-white">Tu progreso.</strong> {rex.text}
      </p>
      {created ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-good">Creado: Subir PR · {created}.</p>
          <button onClick={onOpenObjetivos} className={`${pill} border border-brand-border text-neutral-200 hover:border-brand-gold hover:text-white`}>
            Ver objetivos
          </button>
        </div>
      ) : (
        rex.proposal &&
        (state === 'idle' ? (
          <button onClick={() => setState('confirm')} className={`${pill} mt-2.5 bg-brand-orange text-black hover:bg-brand-orange-dark`}>
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
                  const p = rex.proposal;
                  if (!p) return;
                  onCreateGoal(p.movementId);
                  setCreated(p.label);
                  setState('idle');
                }}
                className={`${pill} bg-brand-orange text-black hover:bg-brand-orange-dark`}
              >
                Crearlo
              </button>
              <button onClick={onOpenObjetivos} className={`${pill} border border-brand-border text-neutral-200 hover:border-brand-gold hover:text-white`}>
                Cambiar algo con Rex
              </button>
              <button onClick={() => setState('idle')} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
                No
              </button>
            </div>
          </div>
        ))
      )}
    </RexNote>
  );
}

function Tile({ value, label, note, tone = 'neutral' }: { value: string; label: ReactNode; note?: string; tone?: 'good' | 'warn' | 'neutral' }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.04] px-2 py-3 text-center">
      <p className="num text-base font-bold leading-tight text-white">{value}</p>
      {note && <p className={`mt-0.5 text-[11px] font-semibold ${tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-neutral-400'}`}>{note}</p>}
      <p className="mt-0.5 text-[11px] leading-tight text-neutral-500">{label}</p>
    </div>
  );
}

/** El apartado «WODs»: las cifras del mes, dónde escalas, tus últimos resultados y, plegados, el ritmo y el volumen. */
function WodsPanel({ profile, history, stats, todayIso, onCreateWorkGoal }: Pick<LevelScreenProps, 'profile' | 'history' | 'stats' | 'todayIso' | 'onCreateWorkGoal'>) {
  const month = useMemo(() => computeMonthPlan(profile, history, new Date()), [profile, history]);
  const recent = useMemo(() => recentWods(history), [history]);
  const trend = rpeTrend(stats.rpeMedioSemana, stats.rpeMedio);
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Este mes">
        <div className="grid grid-cols-3 gap-2">
          <Tile value={month.pct === null ? '—' : `${month.done}/${month.planned}`} note={month.pct === null ? undefined : `${month.pct} %`} tone={month.pct !== null && month.pct >= 80 ? 'good' : month.pct !== null && month.pct < 60 ? 'warn' : 'neutral'} label="sesiones del plan" />
          <Tile value={stats.diasEntrenados === 0 ? '—' : `${stats.diasRx}/${stats.diasEntrenados}`} label={<>WODs <Term k="rx">Rx</Term> este mes</>} />
          <Tile
            value={stats.rpeMedioSemana === null ? '—' : comma(stats.rpeMedioSemana.toFixed(1))}
            note={trend === 'duro' ? 'más duro' : trend === 'suave' ? 'más suave' : trend === 'igual' ? 'igual' : undefined}
            tone={trend === 'duro' ? 'warn' : trend === 'suave' ? 'good' : 'neutral'}
            label={<><Term k="rpe">RPE</Term> semana</>}
          />
        </div>
      </section>
      <WodZonesCard profile={profile} history={history} todayIso={todayIso} onCreateWorkGoal={onCreateWorkGoal} />
      <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Resultados recientes">
        <SectionLabel>Recientes</SectionLabel>
        {recent.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">Cuando anotes el resultado de un WOD al cerrar la sesión, saldrá aquí.</p>
        ) : (
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {recent.map((w) => (
              <li key={`${w.date}-${w.value}`} className="flex items-center gap-3 py-2.5" data-testid="recent-wod">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-white">{w.title}</span>
                  <span className={`block text-[11px] ${w.best ? 'text-good' : 'text-neutral-500'}`}>
                    {shortDate(w.date)} · {w.best ? 'mejor marca' : w.rx ? 'Rx' : 'escalado'}
                  </span>
                </span>
                <span className="num shrink-0 text-[15px] font-bold text-white">{w.value}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Fold title="Tu ritmo">
        <WodPacingCard profile={profile} history={history} todayIso={todayIso} onCreateWorkGoal={onCreateWorkGoal} />
      </Fold>
      <Fold title="Volumen por día">
        <VolumeContent />
      </Fold>
    </div>
  );
}

/** El apartado «Cuerpo»: tu peso (con su evolución y dónde apuntarlo) y tu fuerza frente a él. */
function BodyPanel({ profile, bodyweightLog, onBodyweightChange }: Pick<LevelScreenProps, 'profile' | 'bodyweightLog' | 'onBodyweightChange'>) {
  const latest = [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg;
  const ratios = latest ? PR_ROWS.filter(({ key }) => profile.prs[key] > 0) : [];
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Peso corporal">
        <SectionLabel className="mb-3">Peso corporal</SectionLabel>
        <BodyweightCard log={bodyweightLog} onChange={onBodyweightChange} embedded />
      </section>
      <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Tu fuerza frente a tu peso">
        <SectionLabel>Tu fuerza frente a tu peso</SectionLabel>
        {ratios.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">Apunta tu peso para ver cuántas veces lo levantas en cada marca.</p>
        ) : (
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {ratios.map(({ key, label }) => (
              <li key={key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[13px] text-neutral-200">{label}</span>
                <span className="num text-[15px] font-bold text-white">×{comma((profile.prs[key] / (latest as number)).toFixed(1))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** El apartado «Marcas»: tus levantamientos y, plegado, su equilibrio, cómo respondes a las cargas y si el coach acierta. */
function MarksPanel(props: LevelScreenProps) {
  const { profile, history, imbalanceGroups, todayIso } = props;
  const [balanceOpen, setBalanceOpen] = useState(true);
  const hardness = useMemo(() => learnHardness(profile, history, todayIso), [profile, history, todayIso]);
  const off = imbalanceGroups.filter((g) => g.status === 'desbalance').length;
  return (
    <div className="flex flex-col gap-3">
      <MarksContent
        profile={profile}
        history={history}
        imbalanceGroups={imbalanceGroups}
        strengthRatio={props.strengthRatio}
        bodyweightKg={[...props.bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg}
        todayIso={todayIso}
        initialKey={props.marksKey}
        onSaveProfile={props.onSaveMarks}
        onCreateGoal={props.onCreateGoal}
        onOpenObjetivos={props.onOpenObjetivos}
      />
      <Fold title="Equilibrio entre levantamientos" summary={off > 0 ? <span className="text-warn">{off} desviado{off === 1 ? '' : 's'}</span> : undefined}>
        <ImbalancesCard groups={imbalanceGroups} collapsed={!balanceOpen} onToggleCollapsed={() => setBalanceOpen((v) => !v)} />
      </Fold>
      <Fold title="Cómo respondes a las cargas">
        <ResponseProfileCard
          history={history}
          prLog={profile.prLog ?? []}
          setFeedbackLog={profile.setFeedbackLog ?? []}
          bodyweightLog={props.bodyweightLog}
          workLog={profile.workLog ?? []}
          prs={profile.prs}
          defaultOpen
          hardness={hardness}
        />
      </Fold>
      <Fold title="Aciertos del coach">
        <CoachAccuracyCard profile={profile} todayIso={todayIso} />
      </Fold>
    </div>
  );
}

/**
 * La pantalla «Tu nivel»: todas tus mediciones en cuatro apartados. Reúne lo que antes estaba en «Tu nivel», el Análisis, «Mis marcas» y el peso
 * corporal; solo reordena lo que ya se calcula, no cambia nada de lo que programa el coach.
 */
export function LevelScreen(props: LevelScreenProps) {
  const { chip, onChip, profile, history } = props;
  const [energyOpen, setEnergyOpen] = useState(false);
  // Dentro de «Nivel»: frente a gente como tú, o tu progreso contra ti.
  const [view, setView] = useState<'nivel' | 'progreso'>('nivel');
  return (
    <div className="flex flex-col gap-3">
      <ChipTabs items={CHIPS} active={chip} onChange={onChip} label="Tu nivel" />
      <PartGuard key={chip} name={`el apartado ${chip} de Tu nivel`} fallback={<p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-neutral-400">Esta parte no se ha podido mostrar. Prueba con otra.</p>}>
        {chip === 'nivel' ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 rounded-full bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Qué ver de tu nivel">
              {(
                [
                  ['nivel', 'Nivel'],
                  ['progreso', 'Progreso'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={view === id}
                  onClick={() => setView(id)}
                  className={`min-h-8 rounded-full text-xs font-semibold transition-colors ${view === id ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === 'nivel' ? (
              <LevelReferenceView
                profile={profile}
                history={history}
                todayIso={props.todayIso}
                onSaveProfile={props.onSaveProfile}
                onOpenMarks={() => onChip('marcas')}
                onOpenBody={() => onChip('cuerpo')}
              />
            ) : (
              <>
                <LevelNote {...props} />
                <PerfilAtleta
                  profile={profile}
                  history={history}
                  onChange={props.onSaveProfile}
                  mode="analisis"
                  onOpenOther={props.onOpenProgramming}
                  extra={<EnergyDomainsCard profile={profile} history={history} collapsed={!energyOpen} onToggleCollapsed={() => setEnergyOpen((v) => !v)} />}
                />
              </>
            )}
          </div>
        ) : chip === 'marcas' ? (
          <MarksPanel {...props} />
        ) : chip === 'wods' ? (
          <WodsPanel {...props} />
        ) : (
          <BodyPanel {...props} />
        )}
      </PartGuard>
    </div>
  );
}
