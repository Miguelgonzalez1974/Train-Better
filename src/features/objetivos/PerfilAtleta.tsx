import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { AthleteProfile, DiagnosisAreaKey, DiagnosisCheck, DiagnosisReason, EmphasisDecision, EmphasisPlan, EmphasisReview, SessionHistoryEntry } from '../../data/athlete/types';
import {
  checkState,
  computeAthleteDiagnosis,
  REFERENCE_SCORE,
  REVIEW_STEP,
  type AreaTrend,
  type AthleteDiagnosis,
  type Confidence,
  type DiagnosisArea,
  type DiagnosisRow,
  type Tone,
} from '../../engine/athleteDiagnosis';
import { toLocalIsoDate } from '../../engine/periodization';
import { describeLever, ensureEmphasisPlan, formatRatio, leverFor, nextReviewOn } from '../../engine/programmingEmphasis';
import { Modal } from '../shell/Modal';
import { SectionLabel } from '../shell/SectionLabel';

const TONE_COLOR: Record<Tone, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  low: 'rgb(var(--c-state-low))',
  none: 'rgb(var(--c-white) / 0.55)',
};

const TREND_LABEL: Record<AreaTrend, { text: string; color: string } | null> = {
  sube: { text: '▲ sube', color: 'rgb(var(--c-state-good))' },
  estable: { text: '▬ estable', color: 'rgb(var(--c-white) / 0.55)' },
  baja: { text: '▼ baja', color: 'rgb(var(--c-state-mid))' },
  'sin-datos': null,
};

const CONFIDENCE_LABEL: Record<Confidence, string> = { fiable: 'Fiable', provisional: 'Provisional', 'sin-datos': 'Sin datos' };

const REASONS: { id: DiagnosisReason; label: string }[] = [
  { id: 'cansado', label: 'Esos días estaba cansado' },
  { id: 'marcas', label: 'Mis marcas no están al día' },
  { id: 'mejor', label: 'Me veo mejor que eso' },
  { id: 'otro', label: 'Otro motivo' },
];
const REASON_TEXT: Record<DiagnosisReason, string> = {
  cansado: 'esos días estabas cansado',
  marcas: 'tus marcas no están al día',
  mejor: 'te ves mejor que eso',
  otro: 'por otro motivo',
};

// ---------- El radar ----------

const R = 88;
const CX = 130;
const CY = 124;
const SHORT: Record<DiagnosisAreaKey, string> = { fuerza: 'Fuerza', halterofilia: 'Halterofilia', motor: 'Motor', gimnasticos: 'Gimnásticos', constancia: 'Constancia' };

/** Un pentágono con tu forma de atleta: cada eje es un área; el aro punteado es lo esperable, así que lo que sobresale del aro es fuerte y lo que queda dentro, margen. */
function Radar({ areas }: { areas: DiagnosisArea[] }) {
  const n = areas.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, frac: number) => ({ x: CX + R * frac * Math.cos(angle(i)), y: CY + R * frac * Math.sin(angle(i)) });
  const ring = (frac: number) =>
    areas
      .map((_, i) => at(i, frac))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  const scored = areas.map((a, i) => (a.score === null ? null : { a, i, p: at(i, a.score / 100) })).filter((x): x is NonNullable<typeof x> => x !== null);
  const label = (i: number) => {
    const p = at(i, 1.2);
    const c = Math.cos(angle(i));
    return { x: p.x, y: p.y + 4, anchor: Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end' } as const;
  };
  return (
    <svg viewBox="-30 0 320 250" className="mx-auto h-auto w-full max-w-[22rem]" role="img" aria-label={`Tu forma: ${areas.map((a) => `${a.title} ${a.score ?? 'sin datos'}`).join(', ')}`}>
      <polygon points={ring(1)} fill="none" stroke="rgb(var(--c-white) / 0.1)" />
      <polygon points={ring(0.5)} fill="none" stroke="rgb(var(--c-white) / 0.06)" />
      <polygon points={ring(REFERENCE_SCORE / 100)} fill="none" stroke="rgb(var(--c-white) / 0.55)" strokeWidth={1} strokeDasharray="3 3" />
      {areas.map((_, i) => {
        const p = at(i, 1);
        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgb(var(--c-white) / 0.07)" />;
      })}
      {scored.length >= 3 && (
        <polygon points={scored.map((s) => `${s.p.x.toFixed(1)},${s.p.y.toFixed(1)}`).join(' ')} fill="rgb(var(--c-state-cool) / 0.16)" stroke="rgb(var(--c-state-cool))" strokeWidth={1.6} strokeLinejoin="round" />
      )}
      {scored.map((s) => (
        <circle key={s.a.key} cx={s.p.x} cy={s.p.y} r={4} fill="rgb(var(--c-brand-bg))" stroke={TONE_COLOR[s.a.tone]} strokeWidth={2} />
      ))}
      {areas.map((a, i) => {
        const l = label(i);
        return (
          <text key={a.key} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={11} fontWeight={600} fill={a.score === null ? 'rgb(var(--c-white) / 0.35)' : 'rgb(var(--c-white) / 0.85)'}>
            {SHORT[a.key]}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- Una fila con su barra ----------

const BAR_MIN = 0.4;
const BAR_MAX = 1.25;
const barPos = (ratio: number) => `${Math.round(((Math.min(BAR_MAX, Math.max(BAR_MIN, ratio)) - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100)}%`;

function Row({ row }: { row: DiagnosisRow }) {
  return (
    <div className="grid grid-cols-[8.4rem_1fr_auto] items-center gap-2.5 text-xs text-neutral-400">
      <span className="truncate">{row.label}</span>
      {row.ratio !== null ? (
        <div className="relative h-1.5 rounded-full bg-white/[0.08]">
          <div className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: barPos(row.ratio), backgroundColor: TONE_COLOR[row.tone] }} />
          <div className="absolute -bottom-1 -top-1 w-0 border-l-2" style={{ left: barPos(1), borderColor: 'rgb(var(--c-white) / 0.8)' }} />
        </div>
      ) : (
        <span />
      )}
      <span className="num min-w-[3.2rem] text-right font-semibold text-neutral-100">{row.value}</span>
    </div>
  );
}

// ---------- La revisión de las 4 semanas ----------

const DECISION: Record<EmphasisDecision, { label: string; color: string }> = {
  graduar: { label: 'Graduar', color: 'rgb(var(--c-state-good))' },
  seguir: { label: 'Seguir', color: 'rgb(var(--c-state-cool))' },
  rotar: { label: 'Rotar', color: 'rgb(var(--c-state-mid))' },
  esperar: { label: 'Esperar', color: 'rgb(var(--c-white) / 0.55)' },
};

/** Una cosa revisada: el antes y el después con su barra, la decisión y por qué. */
function ReviewEntry({ entry }: { entry: EmphasisReview['entries'][number] }) {
  const d = DECISION[entry.decision];
  const area = entry.area;
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-white">{entry.label}</p>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: d.color, backgroundColor: 'rgb(var(--c-white) / 0.07)' }}>
          {d.label}
        </span>
      </div>
      {entry.before !== null && entry.now !== null && (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
            <div className="rounded-xl bg-white/[0.04] px-2 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Antes</p>
              <p className="num mt-1 text-xl font-semibold leading-none text-neutral-200">{formatRatio(area, entry.before)}</p>
            </div>
            <span className="text-neutral-500" aria-hidden="true">→</span>
            <div className="rounded-xl bg-white/[0.04] px-2 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Ahora</p>
              <p className="num mt-1 text-xl font-semibold leading-none" style={{ color: d.color }}>
                {formatRatio(area, entry.now)}
              </p>
            </div>
          </div>
          <div className="relative mx-0.5 mt-3 h-1.5 rounded-full bg-white/[0.08]" aria-hidden="true">
            <div className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: barPos(entry.now), backgroundColor: d.color }} />
            <div className="absolute -bottom-1 -top-1 w-0 border-l-2" style={{ left: barPos(1), borderColor: 'rgb(var(--c-white) / 0.8)' }} />
          </div>
        </>
      )}
      <p className="mt-2.5 text-xs leading-relaxed text-neutral-400">{entry.reason}</p>
    </div>
  );
}

/**
 * La revisión de las 4 semanas de lo que el coach priorizaba: el antes y el después de cada cosa y qué decide (seguir, graduar,
 * rotar o esperar). Sin ver, sale abierta con "De acuerdo"; una vez vista, queda plegada como "Última revisión".
 */
function ReviewCard({ review, onSeen }: { review: EmphasisReview; onSeen: (scroll: boolean) => void }) {
  const entries = review.entries;
  const body = (
    <div className="mt-3 flex flex-col gap-2.5">
      {entries.map((e) => (
        <ReviewEntry key={e.key} entry={e} />
      ))}
    </div>
  );
  if (review.seen) {
    return (
      <details className="rounded-2xl bg-white/[0.03] px-4 py-3">
        <summary className="cursor-pointer list-none text-[13px] font-semibold text-neutral-300">Última revisión · {shortDate(review.date)}</summary>
        {body}
      </details>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Revisión del {shortDate(review.date)}</p>
      <p className="mt-0.5 text-lg font-semibold text-white">4 semanas con énfasis</p>
      {body}
      <div className="mt-3.5 flex items-center gap-2">
        <button onClick={() => onSeen(false)} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark">
          De acuerdo
        </button>
        <button onClick={() => onSeen(true)} className="rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:text-white">
          Cambiar
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-neutral-500">«Cambiar» te lleva a lo que aplica ahora, donde puedes quitar o poner cosas.</p>
    </div>
  );
}

// ---------- La programación según el perfil ----------

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

/**
 * Lo que el diagnóstico cambia en tus sesiones: un interruptor general y, por separado, cada cosa que aplica ahora (con lo que
 * hace) para poder quitarla. Lo que el coach vigila pero aún no aplica (pocos datos) y lo que mantiene salen aparte.
 */
function EmphasisCard({ profile, diagnosis, history, onChange }: { profile: AthleteProfile; diagnosis: AthleteDiagnosis; history: SessionHistoryEntry[]; onChange: (patch: Partial<AthleteProfile>) => void }) {
  const plan = profile.emphasisPlan;
  const enabled = plan?.enabled ?? false;
  const items = plan?.items ?? [];
  const removed = new Set(plan?.removed ?? []);
  const blocked = (i: { area: DiagnosisAreaKey }) => profile.diagnosisChecks?.[i.area]?.verdict === 'no-cuadra';
  const applying = items.filter((i) => !removed.has(i.key) && !blocked(i));
  const put = (next: EmphasisPlan) => onChange({ emphasisPlan: next });

  function toggle() {
    // Al encender se calcula lo que aplica si no estaba hecho; al apagar se conserva todo, solo cambia el interruptor.
    const turned: EmphasisPlan = { ...(plan ?? { items: [], removed: [] }), enabled: !enabled };
    onChange({ emphasisPlan: turned.enabled ? (ensureEmphasisPlan({ ...profile, emphasisPlan: turned }, history, new Date()).emphasisPlan ?? turned) : turned });
  }

  const watching = diagnosis.areas.filter((a) => a.confidence === 'provisional' && (a.tone === 'low' || a.tone === 'mid') && a.weakest && leverFor(a.key, a.weakest.id));
  const keeping = diagnosis.focus.filter((f) => f.kind === 'mantener');

  return (
    <div id="emphasis-card" className="rounded-2xl bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Programar según mi perfil</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            El coach inclina tus semanas hacia lo que más margen tiene. Un empujón dentro de lo que ya toca: no cambia tus días, tu objetivo de esfuerzo ni lo que haces si te saltas uno.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Programar según mi perfil"
          onClick={toggle}
          className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-good' : 'bg-white/15'}`}
        >
          <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-brand-bg transition-all ${enabled ? 'right-[3px]' : 'left-[3px]'}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Ahora mismo aplica</p>
          {applying.length === 0 && removed.size === 0 && (
            <p className="py-2 text-xs leading-relaxed text-neutral-500">
              Aún nada: hace falta que alguna área tenga datos fiables y un punto claramente por detrás. Se vuelve a mirar cada semana mientras tanto.
            </p>
          )}
          <ul className="divide-y divide-white/[0.06]">
            {items.map((i, n) => {
              const off = removed.has(i.key);
              const noCuadra = blocked(i);
              return (
                <li key={i.key} className="flex items-start gap-3 py-3">
                  <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ color: 'rgb(var(--c-brand-orange))', backgroundColor: 'rgb(var(--c-brand-orange) / 0.16)', opacity: off || noCuadra ? 0.4 : 1 }} aria-hidden="true">
                    {n + 1}
                  </span>
                  <p className={`min-w-0 flex-1 text-[13px] leading-snug ${off || noCuadra ? 'text-neutral-500' : 'text-neutral-200'}`}>
                    <strong className={`font-semibold ${off || noCuadra ? 'text-neutral-400' : 'text-white'}`}>{i.action}.</strong>
                    <span className="mt-0.5 block text-xs text-neutral-500">{noCuadra ? 'Dijiste que no cuadra: no se aplica hasta que haya datos nuevos.' : off ? 'Lo quitaste.' : describeLever(i)}</span>
                  </p>
                  {!noCuadra && (
                    <button
                      onClick={() => put({ ...plan!, removed: off ? plan!.removed.filter((k) => k !== i.key) : [...plan!.removed, i.key] })}
                      className="shrink-0 self-center rounded-full border border-brand-border px-3 py-1 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-white"
                    >
                      {off ? 'Volver a poner' : 'Quitar'}
                    </button>
                  )}
                </li>
              );
            })}
            {(plan?.maintained ?? []).map((m) => (
              <li key={`g-${m.key}`} className="flex items-start gap-3 py-3">
                <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ color: TONE_COLOR.good, backgroundColor: 'rgb(var(--c-state-good) / 0.14)' }} aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                <p className="text-[13px] leading-snug text-neutral-200">
                  <strong className="font-semibold text-white">{m.action.replace(/^Más /, 'Mantener: ')}.</strong>
                  <span className="mt-0.5 block text-xs text-neutral-500">Ya llegó a lo esperable: vuelve la programación habitual, sin el refuerzo.</span>
                </p>
              </li>
            ))}
            {keeping.map((f) => (
              <li key={`k-${f.key}`} className="flex items-start gap-3 py-3">
                <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ color: TONE_COLOR.good, backgroundColor: 'rgb(var(--c-state-good) / 0.14)' }} aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                <p className="text-[13px] leading-snug text-neutral-200">
                  <strong className="font-semibold text-white">{f.action}.</strong>
                  <span className="mt-0.5 block text-xs text-neutral-500">Sin cambios: no se añade volumen.</span>
                </p>
              </li>
            ))}
            {watching.map((a) => (
              <li key={`w-${a.key}`} className="flex items-start gap-3 py-3">
                <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-neutral-400" aria-hidden="true">
                  …
                </span>
                <p className="text-[13px] leading-snug text-neutral-200">
                  <strong className="font-semibold text-white">{a.title}, en observación.</strong>
                  <span className="mt-0.5 block text-xs text-neutral-500">Aún pocos datos ({a.samples}). No se aplica hasta que sean fiables.</span>
                </p>
              </li>
            ))}
          </ul>
          {plan && nextReviewOn(plan) && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
              Se revisa el {shortDate(nextReviewOn(plan)!)}. Lo que marques como «No cuadra» no se aplica hasta tener datos nuevos. Con el interruptor apagado vuelve la programación de antes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- La pantalla ----------

/**
 * El perfil se reparte en dos sitios: `analisis` (Dashboard → Análisis → Perfil) enseña lo que el coach ve en ti: la rueda, las áreas y lo que
 * priorizaría; `programacion` (Objetivos) deja decidir cómo programa con eso: la revisión de las 4 semanas y el interruptor.
 */
export function PerfilAtleta({
  profile,
  history,
  onChange,
  mode = 'analisis',
  onOpenOther,
  extra,
}: {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  onChange: (patch: Partial<AthleteProfile>) => void;
  mode?: 'analisis' | 'programacion';
  /** Lleva al otro sitio: de la programación a la rueda (Dashboard) y de la rueda a la programación (Objetivos). */
  onOpenOther?: () => void;
  /** Detalle plegable que va tras «Qué priorizaría» (en el Dashboard: la energía y las parejas de levantamientos). */
  extra?: React.ReactNode;
}) {
  const diagnosis = useMemo(() => computeAthleteDiagnosis({ profile, history }), [profile, history]);
  const [asking, setAsking] = useState<DiagnosisArea | null>(null);
  const [reason, setReason] = useState<DiagnosisReason>('cansado');
  const checks = profile.diagnosisChecks ?? {};
  const radarAreas = diagnosis.areas;
  const withScore = radarAreas.filter((a) => a.score !== null).length;

  function saveCheck(key: DiagnosisAreaKey, check: DiagnosisCheck | null) {
    const next = { ...checks };
    if (check) next[key] = check;
    else delete next[key];
    onChange({ diagnosisChecks: next });
  }

  function openNo(area: DiagnosisArea) {
    setReason('cansado');
    setAsking(area);
  }

  if (mode === 'programacion') {
    return (
      <section className="flex animate-section-in flex-col gap-4 motion-reduce:animate-none">
        <div>
          <p className="text-sm text-neutral-400">Programación</p>
          <p className="text-lg font-semibold text-white">Cómo programa el coach</p>
          <p className="mt-0.5 text-xs text-neutral-500">{diagnosis.headline}</p>
        </div>
        {profile.emphasisPlan?.review && (
          <ReviewCard
            review={profile.emphasisPlan.review}
            onSeen={(scroll) => {
              onChange({ emphasisPlan: { ...profile.emphasisPlan!, review: { ...profile.emphasisPlan!.review!, seen: true, noticed: true } } });
              if (scroll) setTimeout(() => document.getElementById('emphasis-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }}
          />
        )}
        <EmphasisCard profile={profile} diagnosis={diagnosis} history={history} onChange={onChange} />
        {onOpenOther && (
          <button onClick={onOpenOther} className="self-start rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
            Ver mi perfil (la rueda)
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="flex animate-section-in flex-col gap-4 motion-reduce:animate-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Lo que el coach ve en ti</p>
          <p className="text-lg font-semibold text-white">Tu perfil de atleta</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Con tus últimas {diagnosis.sessions} sesiones y {diagnosis.wods} {diagnosis.wods === 1 ? 'WOD puntuado' : 'WODs puntuados'} en Rx.
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: TONE_COLOR[diagnosis.confidence === 'fiable' ? 'good' : diagnosis.confidence === 'provisional' ? 'mid' : 'none'], backgroundColor: 'rgb(var(--c-white) / 0.07)' }}
        >
          {CONFIDENCE_LABEL[diagnosis.confidence]}
        </span>
      </div>

      {withScore >= 3 && (
        <div className="rounded-2xl bg-white/[0.03] px-3 py-4">
          <Radar areas={radarAreas} />
          <p className="mt-1 text-center text-[11px] text-neutral-500">El aro punteado es lo esperable: lo que sale por fuera es tu fuerte; lo que queda dentro, tu margen.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {diagnosis.areas.map((area) => {
          const check = checks[area.key];
          const state = checkState(area, check);
          const trend = TREND_LABEL[area.trend];
          return (
            <article key={area.key} className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-white">{area.title}</h3>
                {trend && (
                  <span className="text-xs font-semibold" style={{ color: trend.color }}>
                    {trend.text}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-300">{area.verdict}</p>

              {area.rows.length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5">
                  {area.rows.map((row) => (
                    <Row key={row.id} row={row} />
                  ))}
                </div>
              )}
              {area.need && <p className="mt-2 text-xs leading-relaxed text-neutral-500">{area.need}</p>}

              <p className="mt-3 text-[11px] text-neutral-500">
                {area.confidence === 'sin-datos' ? 'Sin datos suficientes' : `${CONFIDENCE_LABEL[area.confidence]} · ${area.samples} ${area.samples === 1 ? 'dato' : 'datos'}`}
                {area.rows.some((r) => r.ratio !== null) && ' · la marca blanca es lo esperable'}
              </p>

              {area.confidence !== 'sin-datos' && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  {state === 'no-cuadra' && check && (
                    <p className="mb-2 text-xs leading-relaxed text-neutral-400">
                      Dijiste que no cuadra{check.reason ? `: ${REASON_TEXT[check.reason]}` : ''}. No lo priorizo hasta tener {REVIEW_STEP} datos más.
                    </p>
                  )}
                  {state === 'revisar' && <p className="mb-2 text-xs leading-relaxed text-neutral-400">Hay datos nuevos desde que dijiste que no cuadra. ¿Sigue sin cuadrar?</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveCheck(area.key, { verdict: 'cuadra', samples: area.samples, date: toLocalIsoDate(new Date()) })}
                      aria-pressed={state === 'cuadra'}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        state === 'cuadra' ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                      }`}
                    >
                      {state === 'cuadra' && <Check size={12} strokeWidth={3} aria-hidden="true" />} Cuadra
                    </button>
                    <button
                      onClick={() => openNo(area)}
                      aria-pressed={state === 'no-cuadra'}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        state === 'no-cuadra' ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                      }`}
                    >
                      No cuadra
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div>
        <SectionLabel className="mb-2">Qué priorizaría estas semanas</SectionLabel>
        {diagnosis.focus.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-neutral-500">
            Aún no hay nada claro que priorizar: con más marcas reales y WODs puntuados en Rx, aquí saldrá lo que más margen tiene.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4">
            {diagnosis.focus.map((f, i) => (
              <li key={`${f.key}-${i}`} className="flex items-start gap-3 py-3">
                <span
                  className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                  style={f.kind === 'prioridad' ? { color: 'rgb(var(--c-brand-orange))', backgroundColor: 'rgb(var(--c-brand-orange) / 0.16)' } : { color: TONE_COLOR.good, backgroundColor: 'rgb(var(--c-state-good) / 0.14)' }}
                  aria-hidden="true"
                >
                  {f.kind === 'prioridad' ? i + 1 : <Check size={12} strokeWidth={3} />}
                </span>
                <p className="text-[13px] leading-snug text-neutral-200">
                  <strong className="font-semibold text-white">{f.action}.</strong>
                  <span className="mt-0.5 block text-xs text-neutral-500">{f.why}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {extra}

      {onOpenOther && (
        <button onClick={onOpenOther} className="self-start rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
          Cómo programa el coach con esto
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-neutral-500">
        Se recalcula con cada sesión nueva, pero se apoya en medianas y en un mínimo de datos: un día malo no lo cambia. Las marcas de fábrica que nunca has tocado no cuentan.
      </p>

      {asking && (
        <Modal open onClose={() => setAsking(null)} title={`${asking.title} · ¿qué no cuadra?`}>
          <p className="mb-3 text-sm leading-relaxed text-neutral-300">{asking.verdict}</p>
          <p className="mb-2 text-xs text-neutral-500">Dime por qué crees que no, y lo tendré en cuenta: no priorizaré esta área hasta tener {REVIEW_STEP} datos más.</p>
          <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo">
            {REASONS.map((r) => (
              <button
                key={r.id}
                role="radio"
                aria-checked={reason === r.id}
                onClick={() => setReason(r.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  reason === r.id ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              saveCheck(asking.key, { verdict: 'no-cuadra', reason, samples: asking.samples, date: toLocalIsoDate(new Date()) });
              setAsking(null);
            }}
            className="w-full rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark"
          >
            Guardar
          </button>
        </Modal>
      )}
    </section>
  );
}
