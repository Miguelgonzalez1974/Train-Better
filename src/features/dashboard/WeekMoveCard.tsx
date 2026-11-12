import { useState } from 'react';
import { BatteryLow, ShieldCheck, TrendingUp } from 'lucide-react';
import { dayLabel } from '../../lib/sessionMove';
import type { WeekMoveDay, WeekMoveProposal } from '../../lib/weekCoach';
import { energyWord, weekMoveApplyLabel, weekMoveLead, weekMoveSentence, weekMoveTitle } from './rexWeekMove';

const LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const letterOf = (iso: string) => LETTER[new Date(`${iso}T12:00:00`).getDay()];

const W = 320;
const H = 112;
const PAD = 22;
const TOP = 10;
const BOTTOM = 26;

/** La energía de cada día de la semana, antes (punteada) y con el cambio (continua), con los dos días que cambian marcados. */
function EnergyChart({ days, from, to }: { days: WeekMoveDay[]; from: string; to: string }) {
  const n = days.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  // La escala se ajusta a las cifras de la semana (con margen y un mínimo de 40 puntos) para que las diferencias se vean.
  const values = days.flatMap((d) => [d.energyBefore, d.energyAfter]);
  const span = Math.max(40, Math.max(...values) - Math.min(...values) + 16);
  const mid = (Math.max(...values) + Math.min(...values)) / 2;
  const lo = Math.max(0, Math.min(100 - span, mid - span / 2));
  const y = (energy: number) => TOP + (1 - (Math.max(lo, Math.min(lo + span, energy)) - lo) / span) * (H - TOP - BOTTOM);
  const line = (pick: (d: WeekMoveDay) => number) => days.map((d, i) => `${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tu energía de cada día de la semana, antes y con el cambio">
      <polyline points={line((d) => d.energyBefore)} fill="none" className="stroke-neutral-500" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />
      <polyline points={line((d) => d.energyAfter)} fill="none" className="stroke-info" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {days.map((d, i) => (
        <g key={d.iso}>
          {d.iso === from && <circle cx={x(i)} cy={y(d.energyBefore)} r="5" className="fill-black stroke-bad" strokeWidth="2" />}
          {d.iso === to && <circle cx={x(i)} cy={y(d.energyAfter)} r="5" className="fill-black stroke-good" strokeWidth="2" />}
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-neutral-500" fontSize="10">
            {letterOf(d.iso)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * La ficha donde el coach propone mover un día de la semana según tu curva de forma: la frase de Rex, tu energía de cada día antes y con el
 * cambio, la semana tal como quedaría y el porqué. Se aplica con un botón (con deshacer, igual que cuando mueves un día con Rex) o se deja
 * para luego («Ahora no»: esa semana no vuelve a insistir). Todo el contenido sale de `proposeWeekMove` (`lib/weekCoach.ts`).
 */
export function WeekMoveCard({
  proposal,
  todayIso,
  onApply,
  onLater,
  onUndo,
  onClose,
}: {
  proposal: WeekMoveProposal;
  todayIso: string;
  onApply: () => void;
  onLater: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  const [undone, setUndone] = useState(false);
  const changed = proposal.days.filter((d) => d.changed);
  const word = energyWord(proposal.energyTo);

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-sm text-neutral-300">
        <p>
          <span className="font-semibold text-good">{undone ? 'Deshecho.' : 'Hecho.'}</span>{' '}
          {undone
            ? 'La semana vuelve a como estaba.'
            : `${proposal.sessionLabel} queda para ${dayLabel(proposal.to, todayIso)}${proposal.swap ? ' y la otra sesión ocupa su sitio' : ''}. Lo ves en Planificación; si cambias de idea, puedes deshacerlo.`}
        </p>
        <div className="flex gap-2">
          {!undone && (
            <button
              onClick={() => {
                onUndo();
                setUndone(true);
              }}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
            >
              Deshacer
            </button>
          )}
          <button onClick={onClose} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black hover:bg-brand-orange-dark">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-neutral-300">
        <span className="font-semibold text-info">{weekMoveLead(proposal, todayIso)}</span> {weekMoveSentence(proposal, todayIso)}
      </p>

      <section className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5" aria-label="Tu energía esta semana">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Tu energía esta semana</p>
          <p className="whitespace-nowrap text-xs text-neutral-400">
            <span className="text-bad">{proposal.energyFrom}</span> → <span className="font-semibold text-good">{proposal.energyTo}</span>
            <span className="text-neutral-500"> · {word}</span>
          </p>
        </div>
        <EnergyChart days={proposal.days} from={proposal.from} to={proposal.to} />
        <p className="flex items-center gap-3 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t border-dashed border-neutral-500" /> Ahora
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-info" /> Con el cambio
          </span>
        </p>
      </section>

      <section className="flex flex-col divide-y divide-white/[0.06] rounded-xl border border-white/10 bg-white/[0.03] px-3.5" aria-label={weekMoveTitle(proposal)}>
        {changed.map((d) => (
          <div key={d.iso} className="flex flex-col gap-0.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{dayLabel(d.iso, todayIso).replace(/^el /, '')}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-neutral-500 line-through decoration-neutral-600">{d.labelBefore}</span>
              <span className="text-neutral-600">→</span>
              <span className="font-semibold text-white">{d.labelAfter}</span>
            </span>
          </div>
        ))}
      </section>

      <ul className="flex flex-col gap-2 text-xs leading-relaxed text-neutral-400">
        {proposal.reasons.map((r, i) => {
          const Icon = i === 0 ? BatteryLow : i === proposal.reasons.length - 1 ? ShieldCheck : TrendingUp;
          return (
            <li key={r} className="flex items-start gap-2">
              <Icon size={14} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden="true" />
              <span>{r}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            onApply();
            setDone(true);
          }}
          className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
        >
          {weekMoveApplyLabel(proposal, todayIso)}
        </button>
        <button
          onClick={() => {
            onLater();
            onClose();
          }}
          className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
        >
          Ahora no
        </button>
      </div>
      <p className="text-[11px] text-neutral-500">Es una estimación con tus últimas semanas: el check-in de cada mañana manda sobre ella. Se puede deshacer durante 24 horas.</p>
    </div>
  );
}
