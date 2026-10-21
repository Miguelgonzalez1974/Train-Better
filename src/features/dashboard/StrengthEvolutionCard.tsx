import { useMemo, useState } from 'react';
import type { PersonalRecords, PrLogEntry, SetFeedbackEntry, WorkSetEntry } from '../../data/athlete/types';
import { buildStrengthEvolution, daysBetweenIso, niceAxis, RANGE_LABEL, type EvolutionRange, type StrengthEvolution } from '../../engine/strengthEvolution';
import { SectionLabel } from '../shell/SectionLabel';
import { PR_ROWS } from './PersonalRecordsCard';

const W = 320;
const H = 200;
const PAD = { l: 32, r: 38, t: 14, b: 22 };
const RANGES: EvolutionRange[] = ['8s', '6m', 'todo'];

function fmtDay(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', ...(withYear ? { year: '2-digit' } : {}) }).format(new Date(`${iso}T12:00:00`));
}

function fmtKg(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function Chart({ evo }: { evo: StrengthEvolution }) {
  const axis = niceAxis(evo.minKg, evo.maxKg);
  const total = Math.max(1, daysBetweenIso(evo.from, evo.to));
  const x = (iso: string) => PAD.l + (Math.max(0, daysBetweenIso(evo.from, iso)) / total) * (W - PAD.l - PAD.r);
  const y = (kg: number) => PAD.t + (1 - (kg - axis.lo) / (axis.hi - axis.lo)) * (H - PAD.t - PAD.b);

  // Línea de PR en escalones: el valor vigente se mantiene hasta que cambia.
  const step = evo.pr.reduce((d, p, i) => (i === 0 ? `M${x(p.date)},${y(p.kg)}` : `${d} H${x(p.date)} V${y(p.kg)}`), '');
  const lastPr = evo.pr[evo.pr.length - 1];
  const prLabelY = y(lastPr.kg);
  const ticks = [0, 1, 2, 3].map((i) => {
    const d = new Date(`${evo.from}T12:00:00`);
    d.setDate(d.getDate() + Math.round((total * i) / 3));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, left: i === 0, right: i === 3 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolución de tu PR y de tu 1RM estimado">
      {axis.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-white/10" strokeWidth={1} strokeDasharray={t === axis.lo ? undefined : '2 3'} />
          <text x={PAD.l - 5} y={y(t) + 3} textAnchor="end" className="fill-neutral-500" fontSize={9}>
            {fmtKg(t)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t.iso} x={x(t.iso)} y={H - 6} textAnchor={t.left ? 'start' : t.right ? 'end' : 'middle'} className="fill-neutral-500" fontSize={9}>
          {fmtDay(t.iso)}
        </text>
      ))}

      {evo.e1rm.length > 1 && (
        <polyline points={evo.e1rm.map((p) => `${x(p.date)},${y(p.kg)}`).join(' ')} fill="none" className="stroke-brand-neon/40" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      <path d={step} fill="none" className="stroke-brand-gold" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      {evo.prChanges.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={3.5} className="fill-brand-gold stroke-brand-bg" strokeWidth={1.5} />
      ))}
      {evo.e1rm.map((p) => (
        <circle
          key={`${p.date}-${p.source}`}
          cx={x(p.date)}
          cy={y(p.kg)}
          r={p.source === 'rpe' ? 3.2 : 2.6}
          className={p.source === 'rpe' ? 'fill-brand-neon' : 'fill-brand-bg stroke-brand-neon'}
          strokeWidth={p.source === 'rpe' ? 0 : 1.5}
        />
      ))}

      <text x={W - PAD.r + 5} y={prLabelY + 3} className="fill-brand-gold" fontSize={10} fontWeight={700}>
        {fmtKg(lastPr.kg)}
      </text>
    </svg>
  );
}

/**
 * Evolución de fuerza: por levantamiento, la línea de tus PRs (lo que probaste) y los puntos de tu 1RM estimado con las
 * series de trabajo (cómo vas entre test y test). Se elige el levantamiento y el periodo. Solo lee `prLog`,
 * `setFeedbackLog` y `workLog`; no cambia nada de lo que programa el coach.
 */
export function StrengthEvolutionCard({
  prs,
  prLog,
  setFeedbackLog,
  workLog,
  bodyweightKg,
  todayIso,
}: {
  prs: PersonalRecords;
  prLog: PrLogEntry[];
  setFeedbackLog: SetFeedbackEntry[];
  workLog: WorkSetEntry[];
  bodyweightKg?: number;
  todayIso: string;
}) {
  const [key, setKey] = useState<keyof PersonalRecords>('backSquat');
  const [range, setRange] = useState<EvolutionRange>('6m');
  const evo = useMemo(
    () => buildStrengthEvolution(key, prs, prLog, setFeedbackLog, workLog, todayIso, range),
    [key, prs, prLog, setFeedbackLog, workLog, todayIso, range],
  );
  const label = PR_ROWS.find((r) => r.key === key)?.label ?? key;
  const ratio = bodyweightKg ? (evo.currentPr / bodyweightKg).toFixed(1).replace('.', ',') : null;

  return (
    <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Evolución de fuerza">
      <SectionLabel className="mb-3">Evolución de fuerza</SectionLabel>

      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Levantamiento">
        {PR_ROWS.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={key === r.key}
            onClick={(e) => {
              setKey(r.key);
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              key === r.key ? 'bg-brand-gold text-black' : 'bg-white/[0.06] text-neutral-300 hover:bg-white/10'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-400">{label} · tu PR</p>
          <p className="num text-3xl font-bold leading-tight text-white">
            {fmtKg(evo.currentPr)} <span className="text-sm font-medium text-neutral-400">kg</span>
          </p>
          {ratio && <p className="text-[11px] text-neutral-500">×{ratio} tu peso</p>}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              evo.prDeltaKg > 0 ? 'bg-brand-neon/15 text-brand-neon' : evo.prDeltaKg < 0 ? 'bg-brand-orange/15 text-brand-orange' : 'bg-white/[0.06] text-neutral-300'
            }`}
          >
            {evo.prDeltaKg > 0 ? '+' : evo.prDeltaKg < 0 ? '−' : ''}
            {fmtKg(Math.abs(evo.prDeltaKg))} kg {range === 'todo' ? 'desde el inicio' : `en ${RANGE_LABEL[range].toLowerCase()}`}
          </span>
          {evo.latestE1rm !== null && (
            <span className="text-xs text-neutral-400">
              1RM estimado hoy <span className="num font-bold text-brand-neon">{fmtKg(evo.latestE1rm)} kg</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        {evo.hasData ? (
          <Chart evo={evo} />
        ) : (
          <p className="rounded-xl bg-brand-surfaceMuted/80 px-3 py-4 text-center text-xs leading-relaxed text-neutral-400">
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
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
        El PR sube cuando lo pruebas; el 1RM estimado se calcula con tus series de trabajo (peso, repeticiones y RPE) y enseña cómo vas entre test y test.
      </p>
    </section>
  );
}
