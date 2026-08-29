import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Fingerprint, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import type { BodyweightEntry, PrLogEntry, SessionHistoryEntry, SetFeedbackEntry } from '../../data/athlete/types';
import {
  computeResponseProfile,
  RESPONSE_MIN_WEEKS,
  type LiftTier,
  type ResponseProfile,
  type SetFeelCalibration,
} from '../../engine/responseProfile';

const TIER_META: Record<LiftTier, { label: string; className: string; Icon: typeof TrendingUp }> = {
  rapido: { label: 'progresa rápido', className: 'text-emerald-400', Icon: TrendingUp },
  normal: { label: 'progresa', className: 'text-neutral-300', Icon: TrendingUp },
  lento: { label: 'estancado', className: 'text-amber-400', Icon: Minus },
  regresion: { label: 'en caída', className: 'text-red-400', Icon: TrendingDown },
};

function fmtRate(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%/mes`;
}

function rpeLine(rpe: ResponseProfile['rpe']): string {
  const reliable = rpe.reliability >= 0.85;
  const base = reliable
    ? 'Tus RPE son fiables — el coach confía en ellos.'
    : 'Tus RPE no distinguen bien las semanas duras de las suaves — el coach se apoya más en tu carga real (ACWR).';
  if (rpe.bias <= -0.7) return `${base} Además tiendes a reportarlos bajos (~${Math.abs(Math.round(rpe.bias * 10) / 10)} pts): algo más de cautela.`;
  if (rpe.bias >= 0.7) return `${base} Además tiendes a inflarlos (~${Math.round(rpe.bias * 10) / 10} pts): algo más de margen.`;
  return base;
}

function recoveryLine(rec: ResponseProfile['recovery']): string | null {
  if (!rec.tier || rec.avgDays === null) return null;
  const word = rec.tier === 'rapido' ? 'rápido' : rec.tier === 'lento' ? 'despacio' : 'a ritmo normal';
  const cyc = `${rec.cycles} ciclo${rec.cycles > 1 ? 's' : ''}`;
  const extra = rec.tier === 'lento' ? ' Por eso el coach frena antes: descarga ya en riesgo moderado, sin esperar al alto.' : '';
  return `Recuperas ${word} tras un pico de carga (~${Math.round(rec.avgDays)} días, ${cyc}).${extra}`;
}

/** Descripción corta de la calibración por feedback de la 1ª serie de un levantamiento. */
function setFeelDescriptor(c: SetFeelCalibration): { text: string; className: string } {
  const pct = Math.round(Math.abs(c.loadFactor - 1) * 100);
  if (c.feelBias >= 0.6) {
    return { text: pct > 0 ? `suele costarte · −${pct}% de carga` : 'suele costarte', className: 'text-amber-400' };
  }
  if (c.feelBias <= -0.4) {
    return { text: pct > 0 ? `te sobra margen · +${pct}% de carga` : 'te sobra margen', className: 'text-emerald-400' };
  }
  return { text: 'va al punto', className: 'text-neutral-300' };
}

function rxLine(rx: ResponseProfile['rx']): string | null {
  if (!rx.trend) return null;
  if (rx.trend === 'subiendo') return 'Escalas menos que hace un mes — aguantas mejor las cargas prescritas.';
  if (rx.trend === 'bajando') return 'Escalas más que hace un mes — el coach modera un poco lo que te pide.';
  return 'Tu tasa de Rx se mantiene estable.';
}

function bodyweightLine(bw: ResponseProfile['bodyweight']): { text: string; className: string } | null {
  if (!bw.trend || bw.pctPerWeek === null) return null;
  const pct = Math.abs(Math.round(bw.pctPerWeek * 10) / 10);
  if (bw.trend === 'bajando') {
    return {
      text: `Estás perdiendo peso (~${pct}%/semana) durante un bloque de fuerza — el coach baja un poco la carga hasta que se estabilice.`,
      className: 'text-amber-400',
    };
  }
  if (bw.trend === 'subiendo') {
    return { text: `Estás ganando peso (~${pct}%/semana) — buena base para ganar fuerza.`, className: 'text-emerald-400' };
  }
  return { text: 'Tu peso corporal se mantiene estable.', className: 'text-neutral-400' };
}

/** El titular de una linea, para la vista colapsada: lo mas accionable primero. */
function headline(profile: ResponseProfile): string {
  const stalled = profile.perLift.find((l) => l.tier === 'regresion') ?? profile.perLift.find((l) => l.tier === 'lento');
  if (stalled) return `${stalled.label} ${TIER_META[stalled.tier].label} — el coach le da más frecuencia.`;
  const feelAdj = profile.setFeel.find((c) => Math.abs(c.loadFactor - 1) >= 0.02);
  if (feelAdj) {
    const dir = feelAdj.loadFactor < 1 ? 'baja' : 'sube';
    return `Por tus valoraciones de la 1ª serie, el coach ${dir} la carga de ${feelAdj.label}.`;
  }
  if (profile.bodyweight.trend === 'bajando') return 'Estás perdiendo peso durante un bloque de fuerza — el coach baja un poco la carga.';
  if (profile.rpe.reliability < 0.85) return 'Tus RPE dan poca señal — el coach se apoya más en el ACWR.';
  const fast = profile.perLift.find((l) => l.tier === 'rapido');
  if (fast) return `${fast.label} ${fmtRate(fast.ratePerMonthPct)} — vas bien.`;
  return 'El coach ya conoce tu forma de responder y ajusta en consecuencia.';
}

export function ResponseProfileCard({
  history,
  prLog,
  setFeedbackLog,
  bodyweightLog,
}: {
  history: SessionHistoryEntry[];
  prLog: PrLogEntry[];
  setFeedbackLog: SetFeedbackEntry[];
  bodyweightLog: BodyweightEntry[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const profile = useMemo(
    () => computeResponseProfile(history, prLog, new Date(), setFeedbackLog, bodyweightLog),
    [history, prLog, setFeedbackLog, bodyweightLog],
  );

  const weeks = Math.floor(profile.dataWeeks);
  const rec = recoveryLine(profile.recovery);
  const rx = rxLine(profile.rx);
  const bw = bodyweightLine(profile.bodyweight);

  return (
    <section className="card overflow-hidden p-0">
      <button onClick={() => setCollapsed((prev) => !prev)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <Fingerprint size={16} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.6)]" />
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-white">Perfil de respuesta</span>
          {profile.confident ? (
            <span className="rounded-full bg-brand-neon/15 px-2 py-0.5 text-[10px] font-bold text-brand-neon">activo</span>
          ) : (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-neutral-400">
              aprendiendo · {weeks}/{RESPONSE_MIN_WEEKS} sem
            </span>
          )}
        </span>
        {collapsed ? <ChevronDown size={16} className="shrink-0 text-neutral-500" /> : <ChevronUp size={16} className="shrink-0 text-neutral-500" />}
      </button>

      {collapsed && (
        <div className="border-t border-white/5 px-3.5 pb-3.5 pt-3">
          <div className="flex items-center gap-3 rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5">
            <Activity size={14} strokeWidth={2.5} className="shrink-0 text-brand-neon" />
            <p className="text-xs leading-relaxed text-neutral-300">
              {profile.confident
                ? headline(profile)
                : profile.setFeel.length > 0
                  ? `El coach lleva ${weeks} de ${RESPONSE_MIN_WEEKS} semanas conociéndote — de momento solo ajusta la carga por tus valoraciones de la 1ª serie.`
                  : `El coach lleva ${weeks} de ${RESPONSE_MIN_WEEKS} semanas conociéndote. Observa cómo respondes — todavía no ajusta nada.`}
            </p>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="flex flex-col gap-3 border-t border-white/5 px-3.5 pb-3.5 pt-3">
          {!profile.confident && (
            <div>
              <p className="mb-1.5 text-[11px] text-neutral-500">
                El coach necesita ~{RESPONSE_MIN_WEEKS} semanas de historial para individualizar el resto de tu programación
                {profile.setFeel.length > 0 ? ' — la carga por feedback de la 1ª serie ya se ajusta.' : '. Hasta entonces solo observa.'}
              </p>
              <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-brand-neon"
                  style={{ width: `${Math.min(100, (profile.dataWeeks / RESPONSE_MIN_WEEKS) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
            <p className="text-[13px] font-semibold text-white">RPE</p>
            <p className="text-[11px] leading-relaxed text-neutral-400">{rpeLine(profile.rpe)}</p>
          </div>

          <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
            <p className="text-[13px] font-semibold text-white">Progreso por levantamiento</p>
            {profile.perLift.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-neutral-500">
                Aún no hay suficientes tests registrados para medir tu ritmo de progreso por levantamiento.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {profile.perLift.map((lift) => {
                  const meta = TIER_META[lift.tier];
                  return (
                    <li key={lift.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-neutral-300">{lift.label}</span>
                      <span className={`flex items-center gap-1 font-semibold ${meta.className}`}>
                        <meta.Icon size={11} strokeWidth={2.75} />
                        {lift.tier === 'lento' || lift.tier === 'regresion' ? meta.label : fmtRate(lift.ratePerMonthPct)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {profile.setFeel.length > 0 && (
            <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
              <p className="text-[13px] font-semibold text-white">Primeras series</p>
              <p className="mb-1 text-[11px] leading-relaxed text-neutral-500">
                Cómo te vienen las cargas prescritas, según lo que marcas tras la 1ª serie.
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {profile.setFeel.map((c) => {
                  const d = setFeelDescriptor(c);
                  return (
                    <li key={c.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-neutral-300">{c.label}</span>
                      <span className={`font-semibold ${d.className}`}>{d.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {rec && (
            <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
              <p className="text-[13px] font-semibold text-white">Recuperación</p>
              <p className="text-[11px] leading-relaxed text-neutral-400">{rec}</p>
            </div>
          )}

          {rx && (
            <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
              <p className="text-[13px] font-semibold text-white">Escalado</p>
              <p className="text-[11px] leading-relaxed text-neutral-400">{rx}</p>
            </div>
          )}

          {bw && (
            <div className="border-l-2 border-brand-neon/40 py-1 pl-3">
              <p className="text-[13px] font-semibold text-white">Peso corporal</p>
              <p className={`text-[11px] leading-relaxed ${bw.className}`}>{bw.text}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
