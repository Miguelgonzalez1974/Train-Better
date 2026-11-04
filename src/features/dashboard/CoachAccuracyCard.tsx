import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AthleteProfile, ProgressionSettings } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import {
  acceptProposal,
  buildProgressionLedger,
  dismissProposal,
  progressionProposal,
  VERDICT_MIN_CASES,
  type RuleLedgerRow,
  type RuleVerdict,
} from '../../engine/progression';

const VERDICT_LABEL: Record<RuleVerdict, string> = { funciona: 'Funciona', dudosa: 'Dudosa', 'sin-datos': 'Sin datos' };
const VERDICT_CLASS: Record<RuleVerdict, string> = {
  funciona: 'bg-good/15 text-good',
  dudosa: 'bg-warn/15 text-warn',
  'sin-datos': 'bg-white/5 text-neutral-400',
};
const BAR_CLASS: Record<RuleVerdict, string> = { funciona: 'bg-good', dudosa: 'bg-warn', 'sin-datos': 'bg-neutral-600' };

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function RuleRow({ row }: { row: RuleLedgerRow }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{row.label}</p>
          <p className="mt-0.5 text-xs text-neutral-400">{row.detail}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${VERDICT_CLASS[row.verdict]}`}>{VERDICT_LABEL[row.verdict]}</span>
      </div>
      {row.rate !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${Math.round(row.rate * 100)} % de aciertos`}>
          <div className={`h-full rounded-full ${BAR_CLASS[row.verdict]}`} style={{ width: `${Math.round(row.rate * 100)}%` }} />
        </div>
      )}
      {row.verdict === 'sin-datos' && row.resolved > 0 && (
        <p className="mt-1.5 text-[11px] text-neutral-500">Hacen falta {VERDICT_MIN_CASES} casos con resultado para dar un veredicto; hay {row.resolved}.</p>
      )}
    </div>
  );
}

/**
 * ¿Acierta el coach? El libro de las decisiones de carga: cada vez que el coach sube o baja un peso por tus resultados, la
 * sesión siguiente dice si acertó. Con casos suficientes cada regla tiene veredicto, y si una sale dudosa el coach propone un
 * ajuste que solo se aplica si lo aceptas (y solo hacia delante).
 */
export function CoachAccuracyCard({ profile, todayIso }: { profile: AthleteProfile; todayIso: string }) {
  const [settings, setSettings] = useState<ProgressionSettings | undefined>(profile.progressionSettings);
  const records = profile.progressionLog ?? [];

  const ledger = useMemo(
    () => buildProgressionLedger(records, profile.prLog, settings, profile.emphasisPlan),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.progressionLog, profile.prLog, settings, profile.emphasisPlan],
  );
  const proposal = useMemo(() => progressionProposal(ledger, settings, todayIso), [ledger, settings, todayIso]);

  function apply(next: ProgressionSettings) {
    athleteRepository.saveProgressionSettings(next);
    setSettings(next);
  }

  const rate = ledger.resolved > 0 ? `${Math.round((ledger.hits / ledger.resolved) * 100)} %` : '—';

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={15} className="text-brand-neon" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">¿Acierta el coach?</p>
      </div>

      {ledger.rows.length === 0 ? (
        <p className="text-xs leading-relaxed text-neutral-400">
          {records.length === 0
            ? 'Todavía no hay decisiones de carga. Salen al cerrar sesiones de fuerza con todas las series apuntadas en el modo entreno.'
            : `Hay ${records.length} ${records.length === 1 ? 'resultado' : 'resultados'} de fuerza anotados, pero aún ninguna decisión: el coach sube con ${settings?.cleanNeeded ?? 2} sesiones limpias seguidas y baja con dos con fallos.`}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Metric label="Decisiones de carga" value={String(ledger.total)} />
            <Metric label="Con resultado" value={String(ledger.resolved)} />
            <Metric label="Acertadas" value={rate} />
          </div>
          <div className="flex flex-col gap-2">
            {ledger.rows.map((row) => (
              <RuleRow key={row.rule} row={row} />
            ))}
          </div>
        </>
      )}

      {proposal && (
        <div className="rounded-lg bg-warn/10 p-3">
          <p className="text-sm text-warn">
            Propuesta: pedir 3 sesiones limpias seguidas en lugar de 2 para subir. Solo se aplica desde hoy; las sesiones ya hechas no cambian.
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Hoy {proposal.hits} de {proposal.resolved} subidas salieron limpias la vez siguiente.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => apply(acceptProposal(settings, todayIso))}
              className="rounded-md bg-brand-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-gold-soft"
            >
              De acuerdo
            </button>
            <button
              onClick={() => apply(dismissProposal(settings, todayIso))}
              className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
            >
              Dejarlo como está
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-snug text-neutral-500">
        Acertar = la sesión siguiente sale en tu RPE objetivo y sin series falladas (al bajar, sin fallos). Una regla necesita {VERDICT_MIN_CASES} casos con
        resultado para tener veredicto.
      </p>
    </div>
  );
}
