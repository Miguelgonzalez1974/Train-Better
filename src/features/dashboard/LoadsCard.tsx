import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Dumbbell, Equal } from 'lucide-react';
import type { BodyweightEntry, PersonalRecords, PrLogEntry, SessionHistoryEntry, SetFeedbackEntry, WorkSetEntry } from '../../data/athlete/types';
import { buildLoadRows, type LoadDirection, type LoadRow } from '../../engine/loadLearning';
import { computeResponseProfile, SETLOAD_MIN_OBS } from '../../engine/responseProfile';

const DIRECTION_META: Record<LoadDirection, { className: string; Icon: typeof ArrowUp }> = {
  sube: { className: 'bg-emerald-400/10 text-emerald-400', Icon: ArrowUp },
  baja: { className: 'bg-amber-400/10 text-amber-400', Icon: ArrowDown },
  igual: { className: 'bg-white/[0.06] text-neutral-300', Icon: Equal },
};

function pill(row: LoadRow): string {
  if (row.direction === 'igual') return 'sin cambios';
  return `${row.adjustPct > 0 ? '+' : '−'}${Math.abs(row.adjustPct)} %`;
}

/** Cuánto se aparta tu 1RM estimado de la referencia, para colocar la marca en la barra (acotado a ±12 %). */
function markerPct(row: LoadRow): number {
  if (row.estimated === null || row.reference <= 0) return 50;
  const delta = (row.estimated - row.reference) / row.reference;
  return 50 + Math.max(-0.12, Math.min(0.12, delta)) * (50 / 0.12);
}

function LiftRow({ row }: { row: LoadRow }) {
  const meta = DIRECTION_META[row.direction];
  return (
    <li className="border-l-2 border-brand-neon/40 py-1 pl-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-white">{row.label}</p>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
          <meta.Icon size={11} strokeWidth={3} aria-hidden="true" />
          {pill(row)}
        </span>
      </div>
      {row.estimated !== null ? (
        <>
          <div className="relative mt-2 h-[5px] rounded-full bg-white/[0.08]" role="img" aria-label={`Referencia ${row.reference} kg, estimado hoy ${row.estimated} kg`}>
            <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-500" />
            <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-neon" style={{ left: `${markerPct(row)}%` }} />
          </div>
          <div className="num mt-1 flex justify-between text-[11px] text-neutral-500">
            <span>
              referencia <span className="font-semibold text-neutral-300">{row.reference} kg</span>
            </span>
            <span>
              estimado hoy <span className="font-semibold text-white">{row.estimated} kg</span>
            </span>
          </div>
        </>
      ) : (
        <p className="num mt-0.5 text-[11px] text-neutral-500">
          referencia <span className="font-semibold text-neutral-300">{row.reference} kg</span>
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
        {row.text} <span className="text-neutral-600">({row.samples} {row.source === 'series' ? 'series' : 'valoraciones'})</span>
      </p>
    </li>
  );
}

/**
 * "Tus cargas": lo que el coach ha aprendido de cómo te van los pesos y cuánto los mueve. Solo muestra — el ajuste ya se
 * aplica al prescribir (ver `engine/loadLearning.ts`). Los levantamientos sin datos suficientes van juntos en una línea.
 */
export function LoadsCard({
  history,
  prLog,
  setFeedbackLog,
  bodyweightLog,
  workLog,
  prs,
}: {
  history: SessionHistoryEntry[];
  prLog: PrLogEntry[];
  setFeedbackLog: SetFeedbackEntry[];
  bodyweightLog: BodyweightEntry[];
  workLog: WorkSetEntry[];
  prs: PersonalRecords;
}) {
  const rows = useMemo(() => {
    const profile = computeResponseProfile(history, prLog, new Date(), setFeedbackLog, bodyweightLog, workLog, prs);
    return buildLoadRows(prs, profile, setFeedbackLog);
  }, [history, prLog, setFeedbackLog, bodyweightLog, workLog, prs]);

  const learned = rows.filter((r) => r.source !== null);
  const pending = rows.filter((r) => r.source === null);
  if (rows.length === 0) return null;

  return (
    <section className="card flex flex-col gap-3 p-3.5" aria-label="Tus cargas">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <Dumbbell size={16} strokeWidth={2.25} className="text-brand-neon" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Tus cargas</p>
          <p className="text-[11px] leading-snug text-neutral-500">Lo que el coach ha aprendido de cómo te van los pesos. Ya se aplica al prescribir.</p>
        </div>
      </div>

      {learned.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {learned.map((r) => (
            <LiftRow key={r.key} row={r} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5 text-xs leading-relaxed text-neutral-300">
          Todavía no hay ajustes. Cuando registres el peso real y el RPE de tus series de fuerza (al menos {SETLOAD_MIN_OBS} por levantamiento), aquí verás tu 1RM estimado y cuánto mueve el coach las cargas.
        </p>
      )}

      {pending.length > 0 && learned.length > 0 && (
        <p className="text-[11px] leading-relaxed text-neutral-500">
          Sin datos aún: {pending.map((r) => r.label).join(', ')}. Faltan series con el peso real y el RPE.
        </p>
      )}
    </section>
  );
}
