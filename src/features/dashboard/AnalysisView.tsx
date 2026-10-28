import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Dumbbell, Fingerprint, Scale } from 'lucide-react';
import type { AthleteProfile, PersonalRecords, SessionHistoryEntry } from '../../data/athlete/types';
import { analysisHeadline } from '../../engine/analysisHeadline';
import { competitionTile, rpeTrend, topRiser } from '../../engine/analysisStats';
import { computeMonthPlan } from '../../engine/monthPlan';
import { learnHardness } from '../../engine/hardnessLearning';
import type { ImbalanceGroup } from '../../engine/imbalances';
import { buildLoadRows, type LoadRow } from '../../engine/loadLearning';
import { buildPrSeries, summarisePrProgress } from '../../engine/progressSeries';
import { computeResponseProfile, RESPONSE_MIN_WEEKS, type LiftResponse } from '../../engine/responseProfile';
import { buildStrengthEvolution, RANGE_LABEL, type EvolutionRange } from '../../engine/strengthEvolution';
import { EnergyDomainsCard } from './EnergyDomainsCard';
import { EvolutionChart, fmtKg } from './EvolutionChart';
import { ImbalancesCard } from './ImbalancesCard';
import { PR_ROWS } from './PersonalRecordsCard';
import { Term } from '../shell/Term';
import { ResponseProfileCard } from './ResponseProfileCard';
import type { MonthlyStats } from './stats';

type AnalysisTab = 'fuerza' | 'equilibrio' | 'coach';

const RANGES: EvolutionRange[] = ['8s', '6m', 'todo'];
const OLYMPIC_KEYS: (keyof PersonalRecords)[] = ['snatch', 'cleanAndJerk'];
const STRENGTH_KEYS: (keyof PersonalRecords)[] = ['backSquat', 'benchPress', 'deadlift'];

const comma = (n: number | string) => String(n).replace('.', ',');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${comma(Math.abs(n))}`;

/** El ajuste del coach a la carga de un levantamiento, en una palabra corta y su color. */
function adjustMeta(row: LoadRow | undefined): { text: string; className: string } {
  if (!row || row.source === null) return { text: 'sin datos', className: 'text-neutral-500' };
  if (row.direction === 'igual') return { text: 'sin cambios', className: 'text-neutral-300' };
  return { text: `${signed(row.adjustPct)} %`, className: row.direction === 'sube' ? 'text-good' : 'text-warn' };
}

/** El ritmo de progreso de un levantamiento: la tasa mensual, o la palabra cuando no avanza. */
function paceMeta(lift: LiftResponse | undefined): { text: string; className: string } {
  if (!lift) return { text: 'sin datos', className: 'text-neutral-500' };
  if (lift.tier === 'regresion') return { text: 'en caída', className: 'text-bad' };
  if (lift.tier === 'lento') return { text: 'estancado', className: 'text-warn' };
  const rate = Math.round(lift.ratePerMonthPct * 10) / 10;
  return { text: `${signed(rate)} %/mes`, className: lift.tier === 'rapido' ? 'text-good' : 'text-neutral-300' };
}

const HEADLINE_DOT = { good: 'bg-good', warn: 'bg-warn', neutral: 'bg-neutral-500' } as const;

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
      <p className={`mt-0.5 text-[9px] font-bold leading-tight ${TILE_TONE[tone]}`}>{note}</p>
      <p className="mt-0.5 text-[8.5px] leading-tight text-neutral-500">{labelNode ?? label}</p>
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
      <span className={`truncate text-[10px] font-semibold ${hintClass}`}>{hint}</span>
    </button>
  );
}

/**
 * El Análisis: un titular con lo importante y tres pestañas (Fuerza, Equilibrio, Coach) que enseñan una cosa cada una, en vez de
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
}: {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  imbalanceGroups: ImbalanceGroup[];
  strengthRatio: number | null;
  energyAdherencePct: number | null;
  bodyweightKg?: number;
  stats: MonthlyStats;
  todayIso: string;
}) {
  const [tab, setTab] = useState<AnalysisTab>('fuerza');
  const [liftKey, setLiftKey] = useState<keyof PersonalRecords>('backSquat');
  const [range, setRange] = useState<EvolutionRange>('6m');
  const [energyOpen, setEnergyOpen] = useState(true);
  const [imbalancesOpen, setImbalancesOpen] = useState(true);

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

  // Cuántos levantamientos han subido su PR desde el primer test registrado.
  const rising = useMemo(
    () => PR_ROWS.filter(({ key }) => (summarisePrProgress(buildPrSeries(prLog, key))?.deltaKg ?? 0) > 0).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.prLog],
  );

  const evo = useMemo(
    () => buildStrengthEvolution(liftKey, prs, prLog, setFeedbackLog, workLog, todayIso, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liftKey, prs, profile.prLog, profile.setFeedbackLog, profile.workLog, todayIso, range],
  );
  const liftLabel = PR_ROWS.find((r) => r.key === liftKey)?.label ?? liftKey;
  const adjust = adjustMeta(loadRows.find((r) => r.key === liftKey));
  const adjustRow = loadRows.find((r) => r.key === liftKey);
  const pace = paceMeta(response.perLift.find((l) => l.key === liftKey));
  const ratio = bodyweightKg ? comma((evo.currentPr / bodyweightKg).toFixed(1)) : null;

  const sum = (keys: (keyof PersonalRecords)[]) => keys.reduce((s, k) => s + (prs[k] || 0), 0);
  const olympic = sum(OLYMPIC_KEYS);
  const strength = sum(STRENGTH_KEYS);
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

  const strengthHint = rising > 0 ? { text: `▲ ${rising} subiendo`, cls: 'text-good' } : { text: 'estable', cls: 'text-neutral-500' };
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

      {/* Titular: lo importante en una o dos frases. */}
      <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Resumen del análisis">
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HEADLINE_DOT[headline.tone]}`} aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-neutral-200">{headline.sentences.join(' ')}</p>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Análisis">
        <TabButton
          active={tab === 'fuerza'}
          onClick={() => setTab('fuerza')}
          label="Fuerza"
          value={strengthRatio !== null ? `${comma(strengthRatio.toFixed(1))}×` : '—'}
          hint={strengthHint.text}
          hintClass={strengthHint.cls}
        />
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
      </div>

      {tab === 'fuerza' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Levantamiento">
            {PR_ROWS.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={liftKey === r.key}
                onClick={(e) => {
                  setLiftKey(r.key);
                  e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  liftKey === r.key ? 'bg-brand-gold text-black' : 'bg-white/[0.06] text-neutral-300 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <section className="pb-1" aria-label={`Evolución de ${liftLabel}`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-neutral-400">{liftLabel} · tu PR</p>
                <p className="num text-3xl font-bold leading-tight text-white">
                  {fmtKg(evo.currentPr)} <span className="text-sm font-medium text-neutral-400">kg</span>
                </p>
                {ratio && <p className="text-[11px] text-neutral-500">×{ratio} tu peso</p>}
              </div>
              <div className="flex flex-col items-end gap-1 text-right">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    evo.prDeltaKg > 0 ? 'bg-brand-neon/15 text-brand-neon' : evo.prDeltaKg < 0 ? 'bg-warn/15 text-warn' : 'bg-white/[0.06] text-neutral-300'
                  }`}
                >
                  {signed(Math.round(evo.prDeltaKg * 10) / 10)} kg {range === 'todo' ? 'desde el inicio' : `en ${RANGE_LABEL[range].toLowerCase()}`}
                </span>
                {evo.latestE1rm !== null && (
                  <span className="text-xs text-neutral-400">
                    <Term k="e1rm">1RM estimado</Term> hoy <span className="num font-bold text-brand-neon">{fmtKg(evo.latestE1rm)} kg</span>
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3">
              {evo.hasData ? (
                <EvolutionChart evo={evo} />
              ) : (
                <p className="border-y border-white/10 px-3 py-4 text-center text-xs leading-relaxed text-neutral-400">
                  Todavía no hay datos de {liftLabel} en este periodo. El gráfico se llena con tus tests de PR y con las series que registras en el modo enfocado.
                </p>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Periodo">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={range === r}
                    onClick={() => setRange(r)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${range === r ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>
              <p className="flex items-center gap-3 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1">
                  <span className="h-0.5 w-3.5 rounded-full bg-brand-gold" /> PR
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-neon" /> 1RM estimado
                </span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_1px_1fr] gap-3.5 border-t border-white/10 pt-3.5">
              <div>
                <p className="text-[10px] font-semibold text-neutral-500">Ajuste del coach</p>
                <p className={`num text-sm font-bold ${adjust.className}`}>{adjust.text}</p>
                {adjustRow && adjustRow.source !== null && (
                  <p className="text-[10px] text-neutral-500">
                    {adjustRow.reference} → {adjustRow.estimated} kg
                  </p>
                )}
              </div>
              <div className="bg-white/10" aria-hidden="true" />
              <div>
                <p className="text-[10px] font-semibold text-neutral-500">Ritmo</p>
                <p className={`num text-sm font-bold ${pace.className}`}>{pace.text}</p>
              </div>
            </div>
          </section>

          <details className="group border-t border-white/10 pt-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-[13px] font-semibold text-white [&::-webkit-details-marker]:hidden">
              Todos los levantamientos
              <ChevronDown size={16} className="text-neutral-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="pb-2">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="pb-1.5 font-semibold">Levantamiento</th>
                    <th className="pb-1.5 text-right font-semibold">PR</th>
                    <th className="pb-1.5 text-right font-semibold">Ajuste</th>
                    <th className="pb-1.5 text-right font-semibold">Ritmo</th>
                  </tr>
                </thead>
                <tbody>
                  {PR_ROWS.map(({ key, label }) => {
                    const a = adjustMeta(loadRows.find((r) => r.key === key));
                    const p = paceMeta(response.perLift.find((l) => l.key === key));
                    return (
                      <tr key={key} className="border-t border-white/5">
                        <td className="py-1.5 text-neutral-300">{label}</td>
                        <td className="num py-1.5 text-right font-semibold text-white">{fmtKg(prs[key])}</td>
                        <td className={`num py-1.5 text-right font-semibold ${a.className}`}>{a.text}</td>
                        <td className={`num py-1.5 text-right font-semibold ${p.className}`}>{p.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-[1fr_1px_1fr] gap-3.5 border-t border-white/10 pt-3.5">
                {[
                  { label: 'Olímpico', kg: olympic, hint: 'Snatch + C&J' },
                  { label: 'Fuerza', kg: strength, hint: 'Sentadilla + banca + peso muerto' },
                ].map((t, i) => (
                  <Fragment key={t.label}>
                    {i === 1 && <div className="bg-white/10" aria-hidden="true" />}
                    <div>
                      <p className="text-[10px] font-semibold text-neutral-500">{t.label}</p>
                      <p className="num text-sm font-bold text-white">
                        {fmtKg(t.kg)} <span className="text-[10px] font-normal text-neutral-500">kg</span>
                      </p>
                      <p className="text-[10px] text-neutral-500">
                        {bodyweightKg && t.kg > 0 ? `×${comma((t.kg / bodyweightKg).toFixed(1))} tu peso · ` : ''}
                        {t.hint}
                      </p>
                    </div>
                  </Fragment>
                ))}
              </div>
              {!bodyweightKg && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-neutral-500">
                  <Scale size={11} aria-hidden="true" /> Registra tu peso corporal para ver las marcas en veces tu peso.
                </p>
              )}
            </div>
          </details>
        </div>
      )}

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
          <p className="flex items-center gap-2 px-1 text-[11px] leading-snug text-neutral-500">
            <Dumbbell size={13} className="shrink-0" aria-hidden="true" />
            Los ajustes de carga por levantamiento están en la pestaña Fuerza.
          </p>
        </div>
      )}
    </div>
  );
}
