import { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { AthleteProfile, DailySession, MobilityPurpose } from '../../data/athlete/types';
import { MOBILITY_ZONES, MOBILITY_ZONE_LABEL, mobilityVideoUrl, type MobilityZone } from '../../data/mobility';
import { getReadinessCheckForDate } from '../../engine/readiness';
import {
  activePainAreas,
  buildRoutine,
  PURPOSE_LABEL,
  ratingDue,
  ratingTrend,
  routineSeconds,
  sessionPatterns,
  suggestMobilityZones,
  weeklyMobilityMinutes,
  withMobilityDone,
  withMobilityFocus,
  withMobilityRating,
  type RoutineItem,
} from '../../engine/mobility';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';
import { MobilityGuide } from './MobilityGuide';

type Step = 'rate' | 'purpose' | 'zones' | 'time' | 'routine' | 'guide' | 'done';

const MINUTES = [5, 10, 15];
const RATING_WORD: Record<number, string> = { 1: 'Muy limitada', 2: 'Limitada', 3: 'Normal', 4: 'Bien', 5: 'Fenomenal' };

const chip = 'rounded-full border border-brand-border px-3.5 py-2 text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/5';
const chipOn = 'rounded-full border border-good/60 bg-good/15 px-3.5 py-2 text-sm font-semibold text-good transition-colors duration-200';
const primary = 'rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-colors duration-200 hover:bg-brand-orange-dark';

/** El día del año, para que la rutina cambie de un día a otro sin ser aleatoria. */
function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/**
 * Movilidad y estiramientos con Rex: te pregunta qué quieres (estirar, una sesión de movilidad o calentar), qué zonas, y cuánto tiempo
 * tienes; te arma la rutina y te la guía con un temporizador. Las zonas que sugiere salen de la sesión de hoy, las agujetas del
 * check-in y las que tú has marcado como prioritarias; con un aviso de molestia, solo propone lo suave. Lo hecho se apunta como
 * hábito (no cuenta como entreno). Toda la lógica vive en `engine/mobility.ts`.
 */
export function Movilidad({
  profile,
  todayIso,
  session,
  trainedToday,
  onProfileChange,
  onClose,
}: {
  profile: AthleteProfile;
  todayIso: string;
  session: DailySession | null;
  trainedToday: boolean;
  onProfileChange: (profile: AthleteProfile) => void;
  onClose: () => void;
}) {
  const painAreas = useMemo(() => activePainAreas(profile, todayIso), [profile, todayIso]);
  const soreZones = getReadinessCheckForDate(profile.readinessLog ?? [], todayIso)?.soreZones;
  const suggestions = useMemo(
    () => suggestMobilityZones({ patterns: sessionPatterns(session), soreZones, focus: profile.mobilityFocus }),
    [session, soreZones, profile.mobilityFocus],
  );

  const due = ratingDue(profile, todayIso);
  const recommended: MobilityPurpose = trainedToday ? 'recuperar' : session && !session.isRestDay ? 'calentar' : 'movilidad';

  const [step, setStep] = useState<Step>(due ? 'rate' : 'purpose');
  const [purpose, setPurpose] = useState<MobilityPurpose>(recommended);
  const [zones, setZones] = useState<MobilityZone[]>(suggestions.map((s) => s.zone));
  const [saveFocus, setSaveFocus] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [result, setResult] = useState<{ minutes: number; weekly: number; exercises: number } | null>(null);

  const mood: RexMood = step === 'done' ? 'happy' : step === 'routine' || step === 'guide' ? 'lift' : 'idle';
  const why = (z: MobilityZone) => suggestions.find((s) => s.zone === z)?.why;

  function toggleZone(z: MobilityZone) {
    setZones((cur) => (cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z]));
  }

  function makeRoutine() {
    setRoutine(buildRoutine({ purpose, zones, minutes, painAreas, seed: dayOfYear(todayIso) }));
    setStep('routine');
  }

  function finish(done: number, total: number, elapsedSeconds: number) {
    // Una rutina a medias cuenta si se llegó a la mitad; menos, no se apunta.
    if (total > 0 && done / total < 0.5) {
      setStep('routine');
      return;
    }
    const mins = Math.max(1, Math.round(elapsedSeconds / 60));
    let next = withMobilityDone(profile, {
      id: `mov${Date.now()}`,
      date: todayIso,
      purpose,
      zones,
      minutes: mins,
      exercises: routine.length,
    });
    if (saveFocus) next = withMobilityFocus(next, zones);
    onProfileChange(next);
    setResult({ minutes: mins, weekly: weeklyMobilityMinutes(next, todayIso), exercises: routine.length });
    setStep('done');
  }

  let rexText = '';
  if (step === 'rate' && due) rexText = `La última vez trabajaste ${MOBILITY_ZONE_LABEL[due].toLowerCase()}. ¿Cómo la notas hoy?`;
  else if (step === 'purpose') {
    const ctx = trainedToday ? 'Ya has entrenado hoy' : session && !session.isRestDay ? 'Hoy tienes sesión' : 'Hoy no hay sesión';
    rexText = `${ctx}. ¿Qué quieres hacer? Te recomiendo «${PURPOSE_LABEL[recommended].toLowerCase()}».`;
  } else if (step === 'zones') {
    rexText = suggestions.length > 0 ? '¿Quieres trabajar alguna zona en especial? Te he marcado las que más lo piden.' : '¿Qué zonas quieres trabajar?';
  } else if (step === 'time') rexText = '¿Cuánto tiempo tienes?';
  else if (step === 'routine') {
    rexText =
      routine.length === 0
        ? 'Con tus avisos de molestia no tengo ejercicios suaves para eso. Prueba con otras zonas.'
        : `Esta es tu rutina: unos ${Math.max(1, Math.round(routineSeconds(routine) / 60))} min, ${routine.length} ejercicios${purpose === 'recuperar' ? ' estáticos, porque es para después de entrenar' : purpose === 'calentar' ? ' dinámicos, para no restarte fuerza' : ''}.`;
  } else if (step === 'done' && result) {
    const focus = (profile.mobilityFocus ?? zones).filter((z) => zones.includes(z))[0];
    rexText = `Hecho: ${result.minutes} min. Esta semana llevas ${result.weekly} min de recovery.${focus && (saveFocus || profile.mobilityFocus?.includes(focus)) ? ` Mañana te pregunto cómo notas ${MOBILITY_ZONE_LABEL[focus].toLowerCase()}.` : ''}`;
  }

  if (step === 'guide') {
    return (
      <MobilityGuide
        items={routine}
        onFinish={finish}
        onExit={() => setStep('routine')}
      />
    );
  }

  const trend = due ? ratingTrend(profile, due) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <RexMascot size={38} mood={mood} />
        <p className="min-w-0 flex-1 pt-1 text-[13px] leading-relaxed text-neutral-100" aria-live="polite">
          {rexText}
        </p>
      </div>

      {step === 'rate' && due && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-5 gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  onProfileChange(withMobilityRating(profile, { date: todayIso, zone: due, value: v }));
                  setStep('purpose');
                }}
                className="flex flex-col items-center gap-0.5 rounded-xl border border-brand-border px-1 py-2.5 text-white transition-colors hover:border-brand-gold"
              >
                <span className="num text-lg font-semibold">{v}</span>
                <span className="text-[11px] leading-tight text-neutral-400">{RATING_WORD[v]}</span>
              </button>
            ))}
          </div>
          {trend && <p className="text-xs text-neutral-500">Última vez la valoraste con un {trend.last}.</p>}
          <button onClick={() => setStep('purpose')} className="self-start text-xs font-medium text-neutral-500 hover:text-neutral-300">
            Ahora no
          </button>
        </div>
      )}

      {step === 'purpose' && (
        <div className="flex flex-col gap-2">
          {(Object.keys(PURPOSE_LABEL) as MobilityPurpose[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPurpose(p);
                setStep('zones');
              }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                p === recommended ? 'border-good/50 bg-good/10 text-white' : 'border-brand-border text-neutral-200 hover:border-white/30'
              }`}
            >
              {PURPOSE_LABEL[p]}
              {p === recommended && <span className="text-[11px] font-medium text-good">recomendado</span>}
            </button>
          ))}
        </div>
      )}

      {step === 'zones' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Zonas">
            {MOBILITY_ZONES.map((z) => (
              <button key={z} onClick={() => toggleZone(z)} aria-pressed={zones.includes(z)} className={zones.includes(z) ? chipOn : chip}>
                {MOBILITY_ZONE_LABEL[z]}
              </button>
            ))}
          </div>
          {zones.some(why) && (
            <ul className="flex flex-col gap-0.5 text-[11px] text-neutral-500">
              {zones.filter(why).map((z) => (
                <li key={z}>
                  {MOBILITY_ZONE_LABEL[z]}: {why(z)}
                </li>
              ))}
            </ul>
          )}
          {painAreas.length > 0 && <p className="text-[11px] text-warn">Tienes un aviso de molestia activo: en esas zonas solo te pondré lo suave.</p>}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={saveFocus} onChange={(e) => setSaveFocus(e.target.checked)} className="h-4 w-4 accent-orange-500" />
            Guardar estas zonas como prioritarias para próximas rutinas
          </label>
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('time')} disabled={zones.length === 0} className={`${primary} disabled:cursor-not-allowed disabled:opacity-40`}>
              Siguiente
            </button>
            <button onClick={() => setStep('purpose')} className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              <ArrowLeft size={12} aria-hidden="true" /> Volver
            </button>
          </div>
        </div>
      )}

      {step === 'time' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {MINUTES.map((m) => (
              <button key={m} onClick={() => setMinutes(m)} aria-pressed={minutes === m} className={minutes === m ? chipOn : chip}>
                {m} min
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={makeRoutine} className={primary}>
              Armar mi rutina
            </button>
            <button onClick={() => setStep('zones')} className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              <ArrowLeft size={12} aria-hidden="true" /> Volver
            </button>
          </div>
        </div>
      )}

      {step === 'routine' && (
        <div className="flex flex-col gap-3">
          {routine.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] px-4">
              {routine.map((it) => (
                <li key={it.exercise.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-100">{it.exercise.name}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{MOBILITY_ZONE_LABEL[it.exercise.zones[0]]}</p>
                    <a
                      href={mobilityVideoUrl(it.exercise)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-white"
                    >
                      Ver cómo se hace <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </div>
                  <span className="num shrink-0 pt-0.5 text-xs text-neutral-400">
                    {it.seconds} s{it.sides === 2 ? ' × 2 lados' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {routine.length > 0 && (
              <button onClick={() => setStep('guide')} className={primary}>
                Empezar
              </button>
            )}
            <button onClick={() => setStep('time')} className={chip}>
              Cambiar tiempo
            </button>
            <button onClick={() => setStep('zones')} className={chip}>
              Cambiar zonas
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-600">Orientativo, no es fisioterapia. Si algo duele, para: el estiramiento debe notarse, no hacer daño.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={onClose} className={primary}>
            Cerrar
          </button>
          <button
            onClick={() => {
              setResult(null);
              setStep('purpose');
            }}
            className={chip}
          >
            Otra rutina
          </button>
        </div>
      )}
    </div>
  );
}
