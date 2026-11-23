import { useMemo, useRef, useState } from 'react';
import type { DailySession, RxOrScaled, SessionHistoryEntry, WodFeel, WodScalingEntry, WodScoreType } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toHistoryEntry, wodMovementsOfSession } from '../../engine/generateSession';
import type { Skips } from '../../engine/sessionParts';
import { buildWodDetail } from '../../engine/wodMovements';
import { buildWodResult, EMPTY_WOD_FORM, getWodParts, getWodScoreType, type WodResultForm } from '../../engine/wodScoring';
import { wodCapFor } from '../../engine/wodCap';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { buildComplexPool } from '../../engine/olyComplexes';
import { getActivePainFlags } from '../../engine/painFlags';
import { OtherThingModal, type OtherFormState } from './OtherActivitySheets';
import { otherDaySession, otherKindInfo } from './otherActivity';
import { isHistorySorted, sortHistoryByDate } from './pastDayLog';
import { ReviewDeck } from './ReviewDeck';
import { buildClosedEntry, liftRpeEntry, patchBlock, recordProgressionFor } from './sessionClose';
import type { WodScaleState } from './WodScaleBox';

const longDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));

/** Guarda la entrada con la fecha de ese día y deja el historial por orden de fecha (el motor da por hecho que el último es el más reciente). */
function saveEntry(entry: SessionHistoryEntry) {
  athleteRepository.appendHistoryEntry(entry);
  const history = athleteRepository.getHistory();
  if (!isHistorySorted(history)) athleteRepository.replaceHistory(sortHistoryByDate(history));
}

const NEW_OTHER: OtherFormState = { kind: 'clase', name: '', result: '', rpe: 7, minutes: otherKindInfo('clase').minutes, moveTomorrow: false };

/**
 * Anotar un día pasado que se quedó sin apuntar, con las MISMAS tarjetas que «He acabado la sesión» de hoy: una por parte, con los puntos de cada serie y su
 * peso, el esfuerzo de cada ejercicio, el resultado del WOD y el cierre (cómo lo sentiste y cuánto duró). Se guarda con la fecha de ese día y alimenta
 * lo mismo que hoy: carga, racha, esfuerzo, progresión, Tu nivel y lo que aprende el coach. «Hice otra cosa» guarda un día sin detalle de bloques.
 * Si ese día no había una sesión prevista que anotar, va directo a «otra cosa».
 */
export function PastDayDeck({ dateIso, planned, onSaved, onClose }: { dateIso: string; planned: DailySession | null; onSaved: () => void; onClose: () => void }) {
  const session = planned && !planned.isRestDay && planned.source !== 'custom' && planned.blocks.length > 0 ? planned : null;
  const [other, setOther] = useState<OtherFormState | null>(session ? null : NEW_OTHER);

  const saveOther = () => {
    if (!other) return;
    const next = otherDaySession(dateIso, planned?.mesocycleWeek ?? 1, { kind: other.kind, name: other.name, result: other.result });
    saveEntry(toHistoryEntry(next, 'rx', other.rpe, other.minutes));
    athleteRepository.saveCachedSession(next);
    onSaved();
  };

  const otherModal = (
    <OtherThingModal open={other !== null} onClose={() => (session ? setOther(null) : onClose())} form={other ?? NEW_OTHER} onChange={(patch) => setOther((prev) => ({ ...(prev ?? NEW_OTHER), ...patch }))} onSave={saveOther} movePreview={null} />
  );
  if (!session) return otherModal;
  return (
    <>
      <PlannedDeck dateIso={dateIso} session={session} onSaved={onSaved} onClose={onClose} onOtherThing={() => setOther(NEW_OTHER)} />
      {otherModal}
    </>
  );
}

function PlannedDeck({ dateIso, session: planned, onSaved, onClose, onOtherThing }: { dateIso: string; session: DailySession; onSaved: () => void; onClose: () => void; onOtherThing: () => void }) {
  // La sesión de ese día, con los cambios de ejercicio que se hagan en las tarjetas (se guarda al final, no antes).
  const [session, setSession] = useState(planned);
  const profile = useMemo(() => athleteRepository.getProfile(), []);
  const complexPool = useMemo(() => buildComplexPool(profile.customComplexes, profile.complexPrefs), [profile.customComplexes, profile.complexPrefs]);
  const complexWeek: 1 | 2 | 3 | 4 = session.mesocycleWeek >= 1 && session.mesocycleWeek <= 4 ? (session.mesocycleWeek as 1 | 2 | 3 | 4) : 2;
  const wodParts = useMemo(() => getWodParts(session), [session]);
  const scoreTypes = useMemo<Record<1 | 2, WodScoreType | null>>(() => ({ 1: getWodScoreType(session, 1), 2: getWodScoreType(session, 2) }), [session]);
  const caps = useMemo(() => ({ 1: wodCapFor(session, 1), 2: wodCapFor(session, 2) }), [session]);
  const wodMovements = useMemo(() => wodMovementsOfSession(session), [session]);
  const estimatedMin = useMemo(() => Math.min(120, Math.max(20, Math.round(estimateSessionMinutes(session) / 5) * 5)), [session]);

  const [forms, setForms] = useState<Record<1 | 2, WodResultForm>>({ 1: EMPTY_WOD_FORM, 2: EMPTY_WOD_FORM });
  const [skips, setSkips] = useState<Skips>({});
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>('rx');
  const [scaling, setScaling] = useState<WodScalingEntry[]>([]);
  const [feel, setFeel] = useState<WodFeel | undefined>(undefined);
  const [rpe, setRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(estimatedMin);
  const commitRef = useRef<(() => void) | null>(null);

  const wod: WodScaleState | undefined =
    wodMovements.length > 0
      ? {
          movements: wodMovements,
          rxOrScaled,
          onRxOrScaled: setRxOrScaled,
          scaling,
          onScaling: (next) => {
            setScaling(next);
            if (next.length > 0) setRxOrScaled('scaled');
          },
          feel,
          onFeel: setFeel,
        }
      : undefined;

  const resultOf = (part: 1 | 2) => (scoreTypes[part] && !skips[part === 1 ? 'wod1' : 'wod2'] ? buildWodResult(scoreTypes[part]!, forms[part]) : undefined);

  const save = () => {
    // Las series de las tarjetas, con la fecha de ese día (la progresión y el 1RM estimado las leen del registro).
    commitRef.current?.();
    const asked = wodMovements.filter((m) => !skips[m.part === 1 ? 'wod1' : 'wod2']);
    saveEntry(
      buildClosedEntry({
        session,
        prs: athleteRepository.getProfile().prs,
        skips,
        rxOrScaled,
        rpe,
        durationMin,
        wodResults: { 1: resultOf(1), 2: resultOf(2) },
        wodParts,
        wodDetail: asked.length > 0 ? buildWodDetail(asked, rxOrScaled, scaling, feel) : undefined,
      }),
    );
    recordProgressionFor(session, skips);
    // Se marca como «esto pasó de verdad», igual que al cerrar la sesión de hoy: otro dispositivo no la pisa al sincronizar.
    athleteRepository.saveCachedSession({ ...session, editedByAthlete: true });
    onSaved();
  };

  return (
    <ReviewDeck
      session={session}
      todayWorkLog={athleteRepository.getWorkLog().filter((w) => w.date === dateIso)}
      skips={skips}
      onSkip={(key, skipped) =>
        setSkips((prev) => {
          const next = { ...prev };
          if (skipped) next[key] = next[key] ?? {};
          else delete next[key];
          return next;
        })
      }
      commitRef={commitRef}
      swap={{ ctx: { prs: profile.prs, variantPrs: profile.variantPrs, painFlags: getActivePainFlags(profile.painFlags, dateIso), todayIso: dateIso }, complexPool, complexWeek, prs: profile.prs, variantPrs: profile.variantPrs, onSwap: (index, patch) => setSession((prev) => patchBlock(prev, index, patch)) }}
      rpeToday={{}}
      onRateLift={(entry, topSet, value) => {
        const profile = athleteRepository.getProfile();
        const existing = athleteRepository.getSetFeedbackLog().find((e) => e.date === dateIso && e.movementId === entry.movementId);
        const feedback = liftRpeEntry(dateIso, entry, topSet, value, existing, profile.prs, profile.variantPrs);
        if (feedback) athleteRepository.appendSetFeedbackEntry(feedback);
      }}
      scoreTypes={scoreTypes}
      forms={forms}
      onFormChange={(part, patch) => setForms((prev) => ({ ...prev, [part]: { ...prev[part], ...patch } }))}
      clockParts={[]}
      capSeconds={{ 1: caps[1]?.kind === 'cap' ? caps[1].seconds : undefined, 2: caps[2]?.kind === 'cap' ? caps[2].seconds : undefined }}
      targets={Object.fromEntries(wodParts.map((part) => [part, session.blocks.find((b) => b.block === 'wod' && (b.wodPart ?? 1) === part && b.wodTarget)?.wodTarget?.display]))}
      wod={wod}
      ghostSummaries={{}}
      wodReadings={{}}
      rpe={rpe}
      onRpe={setRpe}
      durationMin={durationMin}
      onDuration={setDurationMin}
      onSave={save}
      onExit={onClose}
      onOtherThing={onOtherThing}
      pastDay={{ label: longDay(dateIso) }}
    />
  );
}
