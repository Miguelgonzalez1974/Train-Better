import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Pencil, Scale } from 'lucide-react';
import type { AthleteProfile, PersonalRecords } from '../../data/athlete/types';
import { analysisHeadline } from '../../engine/analysisHeadline';
import type { ImbalanceGroup } from '../../engine/imbalances';
import { buildLoadRows, type LoadRow } from '../../engine/loadLearning';
import { computeResponseProfile, RESPONSE_MIN_WEEKS, type LiftResponse } from '../../engine/responseProfile';
import { buildStrengthEvolution, RANGE_LABEL, type EvolutionRange } from '../../engine/strengthEvolution';
import { Modal } from '../shell/Modal';
import { RexMascot } from '../objetivos/RexMascot';
import { Term } from '../shell/Term';
import { EvolutionChart, fmtKg } from './EvolutionChart';
import { MarksEditor } from './MarksEditor';
import { PR_ROWS } from './PersonalRecordsCard';
import { analysisRexLine, openGoalMovements, PROPOSAL_WEEKS } from './rexAnalysis';
import { currentMark, MARK_LIFTS, type MarkKey } from './rexMarks';

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

/**
 * «Mis marcas»: una pantalla con todas tus marcas, una fila por levantamiento (kilos, veces tu peso, cuánto ha subido y el ritmo) y, al tocar
 * una, su evolución con el ajuste del coach. Sustituye a la pestaña Fuerza del Análisis. Rex arriba da la conclusión y, si un levantamiento
 * está estancado, propone un objetivo «Subir PR». Las marcas se corrigen con «Editar mis marcas» o diciéndoselo a Rex.
 */
export function MarksScreen({
  profile,
  history,
  imbalanceGroups,
  strengthRatio,
  bodyweightKg,
  todayIso,
  initialKey,
  onSaveProfile,
  onCreateGoal,
  onOpenObjetivos,
  onClose,
}: {
  profile: AthleteProfile;
  history: Parameters<typeof computeResponseProfile>[0];
  imbalanceGroups: ImbalanceGroup[];
  strengthRatio: number | null;
  bodyweightKg?: number;
  todayIso: string;
  /** El levantamiento que se abre desplegado. */
  initialKey?: MarkKey | null;
  onSaveProfile: (patch: Pick<AthleteProfile, 'prs' | 'variantPrs'>) => void;
  onCreateGoal: (movementId: string) => void;
  onOpenObjetivos: () => void;
  onClose: () => void;
}) {
  const baseKeys = PR_ROWS.map((r) => r.key as string);
  const [openKey, setOpenKey] = useState<keyof PersonalRecords | null>(initialKey && baseKeys.includes(initialKey) ? (initialKey as keyof PersonalRecords) : null);
  const [range, setRange] = useState<EvolutionRange>('6m');
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState<'idle' | 'confirm'>('idle');
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
  const desbalances = imbalanceGroups.filter((g) => g.status === 'desbalance').length;
  const equilibrados = imbalanceGroups.filter((g) => g.status === 'equilibrado').length;
  const headline = useMemo(() => analysisHeadline({ loadRows, perLift: response.perLift, desbalances, equilibrados }), [loadRows, response.perLift, desbalances, equilibrados]);
  const rex = analysisRexLine({
    tab: 'fuerza',
    headline,
    strengthRatio,
    perLift: response.perLift,
    imbalances: imbalanceGroups,
    weakLiftIds: [],
    confident: response.confident,
    weeks: Math.floor(response.dataWeeks),
    minWeeks: RESPONSE_MIN_WEEKS,
    ledger: { resolved: 0, hits: 0, rows: [] },
    openGoalMovementIds: openGoalMovements(profile, todayIso),
  });

  // Lo que ha subido cada levantamiento en las últimas 8 semanas, para la fila.
  const deltas = useMemo(
    () => Object.fromEntries(PR_ROWS.map(({ key }) => [key, buildStrengthEvolution(key, prs, prLog, setFeedbackLog, workLog, todayIso, '8s').prDeltaKg])) as Record<string, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prs, profile.prLog, profile.setFeedbackLog, profile.workLog, todayIso],
  );
  const evo = useMemo(
    () => (openKey ? buildStrengthEvolution(openKey, prs, prLog, setFeedbackLog, workLog, todayIso, range) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openKey, prs, profile.prLog, profile.setFeedbackLog, profile.workLog, todayIso, range],
  );

  const sum = (keys: (keyof PersonalRecords)[]) => keys.reduce((s, k) => s + (prs[k] || 0), 0);
  const variants = MARK_LIFTS.filter((l) => l.variant && currentMark(profile, l.key) > 0);
  const ratioOf = (kg: number) => (bodyweightKg && kg > 0 ? comma((kg / bodyweightKg).toFixed(1)) : null);

  return (
    <Modal open onClose={onClose} title="Mis marcas">
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl bg-white/[0.03] p-3.5" aria-label="Lo que dice Rex">
          <div className="flex items-start gap-3">
            <RexMascot size={34} mood={createdLabel || rex.tone === 'good' ? 'happy' : rex.tone === 'warn' ? 'think' : 'idle'} />
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-[13px] leading-relaxed text-neutral-200">
                <strong className={`font-bold ${rex.tone === 'good' ? 'text-good' : rex.tone === 'warn' ? 'text-warn' : 'text-white'}`}>{rex.lead}</strong> {rex.text}
              </p>
              {createdLabel ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-[13px] text-good">Creado: Subir PR · {createdLabel}.</p>
                  <button onClick={onOpenObjetivos} className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white">
                    Ver objetivos
                  </button>
                </div>
              ) : (
                rex.proposal &&
                (proposal === 'idle' ? (
                  <button onClick={() => setProposal('confirm')} className="mt-2 rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark">
                    Crear un objetivo con esto
                  </button>
                ) : (
                  <div className="mt-2 rounded-xl border border-brand-orange/40 bg-brand-orange/[0.08] p-3">
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
                          setCreatedLabel(p.label);
                          setProposal('idle');
                        }}
                        className="rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark"
                      >
                        Crearlo
                      </button>
                      <button onClick={onOpenObjetivos} className="rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white">
                        Cambiar algo con Rex
                      </button>
                      <button onClick={() => setProposal('idle')} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
                        No
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-[1fr_1px_1fr] gap-3.5 px-1">
          {[
            { label: 'Olímpico', kg: sum(OLYMPIC_KEYS), hint: 'Snatch + C&J' },
            { label: 'Fuerza', kg: sum(STRENGTH_KEYS), hint: 'Sentadilla + banca + peso muerto' },
          ].map((t, i) => (
            <Fragment key={t.label}>
              {i === 1 && <div className="bg-white/10" aria-hidden="true" />}
              <div>
                <p className="text-[11px] font-semibold text-neutral-500">{t.label}</p>
                <p className="num text-base font-bold text-white">
                  {fmtKg(t.kg)} <span className="text-[11px] font-normal text-neutral-500">kg</span>
                </p>
                <p className="text-[11px] text-neutral-500">
                  {ratioOf(t.kg) ? `×${ratioOf(t.kg)} tu peso · ` : ''}
                  {t.hint}
                </p>
              </div>
            </Fragment>
          ))}
        </div>

        <ul className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03]">
          {PR_ROWS.map(({ key, label }) => {
            const open = openKey === key;
            const pace = paceMeta(response.perLift.find((l) => l.key === key));
            const delta = Math.round((deltas[key] ?? 0) * 10) / 10;
            const ratio = ratioOf(prs[key]);
            const adjust = adjustMeta(loadRows.find((r) => r.key === key));
            const adjustRow = loadRows.find((r) => r.key === key);
            return (
              <li key={key}>
                <button onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{label}</span>
                    <span className="block text-[11px] text-neutral-500">
                      {[ratio ? `×${ratio} tu peso` : null, delta !== 0 ? `${signed(delta)} kg en 8 sem` : null].filter(Boolean).join(' · ') || 'sin cambios en 8 sem'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-base font-bold text-white">
                      {fmtKg(prs[key])} <span className="text-[11px] font-normal text-neutral-500">kg</span>
                    </span>
                    <span className={`num block text-[11px] font-semibold ${pace.className}`}>{pace.text}</span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {open && evo && (
                  <div className="animate-section-in px-3.5 pb-4 motion-reduce:animate-none">
                    <div className="flex items-end justify-between gap-3">
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

                    <div className="mt-3">
                      {evo.hasData ? (
                        <EvolutionChart evo={evo} />
                      ) : (
                        <p className="border-y border-white/10 px-3 py-4 text-center text-xs leading-relaxed text-neutral-400">
                          Todavía no hay datos de {label} en este periodo. El gráfico se llena con tus tests de PR y con las series que registras en el modo enfocado.
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
                        <p className="text-[11px] font-semibold text-neutral-500">Ajuste del coach</p>
                        <p className={`num text-sm font-bold ${adjust.className}`}>{adjust.text}</p>
                        {adjustRow && adjustRow.source !== null && (
                          <p className="text-[11px] text-neutral-500">
                            {adjustRow.reference} → {adjustRow.estimated} kg
                          </p>
                        )}
                      </div>
                      <div className="bg-white/10" aria-hidden="true" />
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-500">Ritmo</p>
                        <p className={`num text-sm font-bold ${pace.className}`}>{pace.text}</p>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {variants.length > 0 && (
          <div>
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Variantes</p>
            <ul className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03]">
              {variants.map((l) => (
                <li key={l.key} className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-sm text-neutral-200">{l.label}</span>
                  <span className="num text-sm font-bold text-white">
                    {fmtKg(currentMark(profile, l.key))} <span className="text-[11px] font-normal text-neutral-500">kg</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!bodyweightKg && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-neutral-500">
            <Scale size={11} aria-hidden="true" /> Registra tu peso corporal para ver las marcas en veces tu peso.
          </p>
        )}

        <div className="flex flex-col items-start gap-2">
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white">
            <Pencil size={14} aria-hidden="true" /> Editar mis marcas
          </button>
          <p className="px-1 text-[11px] text-neutral-500">Si solo has mejorado una, díselo a Rex: «mi back squat es 140».</p>
        </div>
      </div>

      {editing && <MarksEditor profile={profile} onSave={onSaveProfile} onClose={() => setEditing(false)} />}
    </Modal>
  );
}
