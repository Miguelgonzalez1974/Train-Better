import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';
import type { DailySession, RxOrScaled, SessionHistoryEntry, WodScoreType } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toHistoryEntry } from '../../engine/generateSession';
import { EMPTY_WOD_FORM, buildWodResult, getWodParts, getWodScoreType, type WodResultForm } from '../../engine/wodScoring';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { CompleteSessionPanel } from './CompleteSessionPanel';
import { DurationStepper, RpePicker } from './SessionFeelFields';
import { customDaySession, isHistorySorted, liftKey, plannedLiftState, plannedLifts, sortHistoryByDate, workSetsFrom, type LiftState, type PlannedLift } from './pastDayLog';

const longDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));

/** Guarda la entrada con la fecha de ese día y deja el historial por orden de fecha (el motor da por hecho que el último es el más reciente). */
function saveEntry(entry: SessionHistoryEntry) {
  athleteRepository.appendHistoryEntry(entry);
  const history = athleteRepository.getHistory();
  if (!isHistorySorted(history)) athleteRepository.replaceHistory(sortHistoryByDate(history));
}

/**
 * Registrar un día pasado que se quedó sin apuntar: o bien "hice lo previsto" (la sesión que el coach tenía para ese día, con su
 * resultado de WOD, RPE, duración y Rx o escalado) o bien "hice otra cosa" (solo RPE y duración). Se guarda con la fecha de ese día,
 * así que cuenta para la carga, la racha, el esfuerzo, la tendencia y lo que aprende el coach.
 */
export function LogPastDay({ dateIso, planned, onSaved }: { dateIso: string; planned: DailySession | null; onSaved: () => void }) {
  const usable = planned && !planned.isRestDay && planned.source !== 'custom' && planned.blocks.length > 0 ? planned : null;
  const [mode, setMode] = useState<'choose' | 'planned' | 'other'>(usable ? 'choose' : 'other');

  if (mode === 'choose' && usable) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-white">Registrar {longDay(dateIso)}</p>
        <button onClick={() => setMode('planned')} className="flex flex-col gap-0.5 rounded-xl border border-brand-border bg-white/[0.03] px-4 py-3 text-left transition-colors duration-200 hover:border-brand-gold">
          <span className="text-sm font-semibold text-white">Hice lo previsto</span>
          <span className="text-xs text-neutral-500">La sesión que el coach tenía para ese día: apuntas el resultado del WOD, cómo lo sentiste y cuánto duró.</span>
        </button>
        <button onClick={() => setMode('other')} className="flex flex-col gap-0.5 rounded-xl border border-brand-border bg-white/[0.03] px-4 py-3 text-left transition-colors duration-200 hover:border-brand-gold">
          <span className="text-sm font-semibold text-white">Hice otra cosa</span>
          <span className="text-xs text-neutral-500">Un entreno distinto (equipo, otro deporte…): solo RPE y duración.</span>
        </button>
      </div>
    );
  }
  if (mode === 'planned' && usable) return <PlannedForm dateIso={dateIso} session={usable} onBack={() => setMode('choose')} onSaved={onSaved} />;
  return <OtherForm dateIso={dateIso} mesocycleWeek={planned?.mesocycleWeek ?? 1} onBack={usable ? () => setMode('choose') : undefined} onSaved={onSaved} />;
}

/**
 * Las series de fuerza y halterofilia de ese día, ya rellenadas con lo previsto (peso y repeticiones de cada serie): se desmarca la que
 * no se hizo y se corrige el peso de la que fue distinta. "Todo como estaba" las deja todas hechas. Se guardan con la fecha de ese día,
 * con el mismo registro que el modo enfocado, así que el progreso, el 1RM estimado y las cargas aprendidas las ven igual.
 */
function LiftsStep({ lifts, state, onChange, onNext, onSkip, onBack }: { lifts: PlannedLift[]; state: LiftState; onChange: (next: LiftState) => void; onNext: () => void; onSkip: () => void; onBack: () => void }) {
  const set = (key: string, patch: Partial<LiftState[string]>) => onChange({ ...state, [key]: { ...state[key], ...patch } });
  const allDone = lifts.every((l) => l.rows.every((r) => state[liftKey(l.logId, r.set)]?.done));
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-200">
        <ArrowLeft size={13} /> Volver
      </button>
      <div>
        <p className="text-lg font-semibold text-white">Series y pesos</p>
        <p className="mt-0.5 text-xs text-neutral-500">Ya están rellenadas con lo previsto. Desmarca la que no hiciste y corrige el peso de la que fue distinta.</p>
      </div>
      {lifts.map((l) => (
        <div key={l.logId} className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-neutral-200">{l.name}</p>
          {l.rows.map((r) => {
            const key = liftKey(l.logId, r.set);
            const s = state[key] ?? { done: false, kg: r.kg };
            return (
              <div key={key} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${s.done ? 'bg-good/10' : 'bg-white/[0.04]'}`}>
                <button
                  onClick={() => set(key, { done: !s.done })}
                  aria-label={`Serie ${r.set}${s.done ? ' hecha' : ''}`}
                  aria-pressed={s.done}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${s.done ? 'bg-good text-brand-bg' : 'border border-brand-border text-neutral-400'}`}
                >
                  {s.done ? <Check size={18} strokeWidth={3} /> : r.set}
                </button>
                {r.kg > 0 || s.kg > 0 ? (
                  <div className="flex flex-1 items-center justify-center gap-1">
                    <button onClick={() => set(key, { kg: Math.max(0, Math.round((s.kg - 2.5) * 4) / 4) })} aria-label="Menos peso" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-neutral-200 hover:bg-white/15">
                      <Minus size={16} strokeWidth={2.75} />
                    </button>
                    <span className="num min-w-[4.5rem] text-center text-base font-bold text-white">
                      {s.kg} <span className="text-xs font-medium text-neutral-400">kg</span>
                    </span>
                    <button onClick={() => set(key, { kg: Math.round((s.kg + 2.5) * 4) / 4 })} aria-label="Más peso" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-neutral-200 hover:bg-white/15">
                      <Plus size={16} strokeWidth={2.75} />
                    </button>
                  </div>
                ) : (
                  <span className="flex-1 text-center text-xs text-neutral-500">sin peso</span>
                )}
                {r.reps > 0 && <span className="num shrink-0 text-sm font-semibold text-neutral-300">× {r.reps}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onSkip} className="px-2 py-2 text-sm text-neutral-500 underline decoration-dotted transition-colors hover:text-neutral-200">
          No apuntar las series
        </button>
        <div className="flex items-center gap-2">
          {!allDone && (
            <button onClick={() => onChange(plannedLiftState(lifts))} className="px-2 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-white">
              Todo como estaba
            </button>
          )}
          <button onClick={onNext} className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
            Siguiente
            <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlannedForm({ dateIso, session, onBack, onSaved }: { dateIso: string; session: DailySession; onBack: () => void; onSaved: () => void }) {
  const lifts = useMemo(() => plannedLifts(session), [session]);
  const [stage, setStage] = useState<'lifts' | 'panel'>(lifts.length > 0 ? 'lifts' : 'panel');
  const [liftState, setLiftState] = useState<LiftState>(() => plannedLiftState(lifts));
  // "No apuntar las series" deja el día sin series ni pesos (solo el RPE, la duración y el WOD).
  const [logLifts, setLogLifts] = useState(true);
  const wodParts = useMemo(() => getWodParts(session), [session]);
  const scoreTypes = useMemo<Record<1 | 2, WodScoreType | null>>(() => ({ 1: getWodScoreType(session, 1), 2: getWodScoreType(session, 2) }), [session]);
  const estimatedMin = useMemo(() => Math.min(120, Math.max(20, Math.round(estimateSessionMinutes(session) / 5) * 5)), [session]);
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>('rx');
  const [rpe, setRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(estimatedMin);
  const [forms, setForms] = useState<Record<1 | 2, WodResultForm>>({ 1: EMPTY_WOD_FORM, 2: EMPTY_WOD_FORM });
  const resultOf = (part: 1 | 2) => (scoreTypes[part] ? buildWodResult(scoreTypes[part]!, forms[part]) : undefined);

  function confirm() {
    saveEntry(toHistoryEntry(session, rxOrScaled, rpe, durationMin, resultOf(1), undefined, wodParts.includes(2) ? resultOf(2) : undefined));
    // Las series y los pesos, con la fecha de ese día y el mismo registro que el modo enfocado.
    if (logLifts) for (const entry of workSetsFrom(dateIso, lifts, liftState)) athleteRepository.saveWorkSet(entry);
    // Se marca como "esto pasó de verdad", igual que al cerrar la sesión de hoy: otro dispositivo no la pisa al sincronizar.
    athleteRepository.saveCachedSession({ ...session, editedByAthlete: true });
    onSaved();
  }

  if (stage === 'lifts') {
    return (
      <LiftsStep
        lifts={lifts}
        state={liftState}
        onChange={setLiftState}
        onNext={() => {
          setLogLifts(true);
          setStage('panel');
        }}
        onSkip={() => {
          setLogLifts(false);
          setStage('panel');
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={lifts.length > 0 ? () => setStage('lifts') : onBack} className="flex items-center gap-1 self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-200">
        <ArrowLeft size={13} /> {lifts.length > 0 ? 'Series y pesos' : longDay(dateIso)}
      </button>
      <CompleteSessionPanel
        wodParts={wodParts}
        scoreTypes={scoreTypes}
        targets={Object.fromEntries(wodParts.map((part) => [part, session.blocks.find((b) => b.block === 'wod' && (b.wodPart ?? 1) === part && b.wodTarget)?.wodTarget?.display]))}
        forms={forms}
        onFormChange={(part, patch) => setForms((prev) => ({ ...prev, [part]: { ...prev[part], ...patch } }))}
        rxOrScaled={rxOrScaled}
        onRxOrScaled={setRxOrScaled}
        rpe={rpe}
        onRpe={setRpe}
        durationMin={durationMin}
        onDuration={setDurationMin}
        estimatedMin={estimatedMin}
        onConfirm={confirm}
        onCancel={lifts.length > 0 ? () => setStage('lifts') : onBack}
      />
    </div>
  );
}

function OtherForm({ dateIso, mesocycleWeek, onBack, onSaved }: { dateIso: string; mesocycleWeek: DailySession['mesocycleWeek']; onBack?: () => void; onSaved: () => void }) {
  const [rpe, setRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(60);

  function confirm() {
    const session = customDaySession(dateIso, mesocycleWeek);
    saveEntry(toHistoryEntry(session, 'rx', rpe, durationMin));
    athleteRepository.saveCachedSession(session);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1 self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-200">
          <ArrowLeft size={13} /> {longDay(dateIso)}
        </button>
      ) : (
        <p className="text-sm font-semibold text-white">Registrar {longDay(dateIso)}</p>
      )}
      <div>
        <p className="mb-3 text-lg font-semibold text-white">¿Cómo lo sentiste?</p>
        <RpePicker value={rpe} onChange={setRpe} />
      </div>
      <DurationStepper value={durationMin} onChange={setDurationMin} hint="Sin detalle de bloques: solo RPE y duración" />
      <button onClick={confirm} className="flex items-center justify-center gap-1.5 self-end rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
        <Check size={15} strokeWidth={3} />
        Guardar día
      </button>
    </div>
  );
}
