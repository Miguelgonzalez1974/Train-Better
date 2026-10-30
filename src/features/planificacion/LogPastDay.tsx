import { useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import type { DailySession, RxOrScaled, SessionHistoryEntry, WodScoreType } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toHistoryEntry } from '../../engine/generateSession';
import { EMPTY_WOD_FORM, buildWodResult, getWodParts, getWodScoreType, type WodResultForm } from '../../engine/wodScoring';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { CompleteSessionPanel } from './CompleteSessionPanel';
import { DurationStepper, RpePicker } from './SessionFeelFields';
import { customDaySession, isHistorySorted, sortHistoryByDate } from './pastDayLog';

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

function PlannedForm({ dateIso, session, onBack, onSaved }: { dateIso: string; session: DailySession; onBack: () => void; onSaved: () => void }) {
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
    // Se marca como "esto pasó de verdad", igual que al cerrar la sesión de hoy: otro dispositivo no la pisa al sincronizar.
    athleteRepository.saveCachedSession({ ...session, editedByAthlete: true });
    onSaved();
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={onBack} className="flex items-center gap-1 self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-200">
        <ArrowLeft size={13} /> {longDay(dateIso)}
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
        onCancel={onBack}
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
