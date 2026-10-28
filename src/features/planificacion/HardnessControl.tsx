import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ThumbsUp, TriangleAlert } from 'lucide-react';
import type { AthleteProfile, DailySession, HardnessLogEntry, SessionHistoryEntry, StrainTarget } from '../../data/athlete/types';
import { generateSessionForDate } from '../../engine/generateSession';
import { hardnessAdvice, hardnessChanges, hardnessMode, hardnessSituation, type HardnessAdvice, type HardnessContext, type HardnessLevel } from '../../engine/hardness';
import { learnHardness, personalHardnessNote } from '../../engine/hardnessLearning';
import { estimatePlannedStrain, strainFit, type PlanFit } from '../../engine/plannedStrain';
import { Modal } from '../shell/Modal';

const FIT_COLOR: Record<PlanFit, string> = {
  dentro: 'rgb(var(--c-state-good))',
  'se-pasa': 'rgb(var(--c-state-mid))',
  'se-queda-corta': 'rgb(var(--c-state-cool))',
};
const FIT_WORD: Record<PlanFit, string> = { dentro: 'dentro de tu objetivo', 'se-pasa': 'por encima de tu objetivo', 'se-queda-corta': 'por debajo de tu objetivo' };
const TONE: Record<HardnessAdvice['tone'], { box: string; Icon: typeof ThumbsUp; icon: string }> = {
  good: { box: 'bg-brand-neon/10', Icon: ThumbsUp, icon: 'text-brand-neon' },
  warn: { box: 'bg-warn/10', Icon: TriangleAlert, icon: 'text-warn' },
  strong: { box: 'bg-bad/10', Icon: ShieldAlert, icon: 'text-bad' },
};
const GAUGE_MAX = 80;

export function hardnessContextOf(session: DailySession): HardnessContext {
  return {
    light: session.dayLight?.color === 'ambar' ? 'ambar' : session.dayLight?.color === 'verde' ? 'verde' : null,
    phase: session.competition?.phase ?? null,
    daysToEvent: session.competition?.daysToEvent ?? null,
    deload: session.mesocycleWeek === 4,
  };
}

/** Lo que se sabía al aplicar un nivel: se guarda para que el coach aprenda cómo lo aguantas (ver `engine/hardnessLearning.ts`). */
export type HardnessApplyInfo = Pick<HardnessLogEntry, 'mode' | 'situation' | 'predicted' | 'targetLow' | 'targetHigh' | 'readiness'>;

interface SheetProps {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  session: DailySession;
  target: StrainTarget | null;
  strainBias: number;
  todayIso: string;
  onApply: (level: HardnessLevel, info: HardnessApplyInfo) => void;
  onClose: () => void;
}

/**
 * «Subir la dureza de hoy»: el coach programó la sesión y tú, si te ves bien, la subes (+1 o +2) incluso con la competición cerca.
 * Enseña lo que cambia y el esfuerzo previsto con cada nivel frente a tu objetivo, y el coach avisa (nunca bloquea): en pico y taper
 * pide un paso más de confirmación. Ver `engine/hardness.ts`.
 */
export function HardnessSheet({ profile, history, session, target, strainBias, todayIso, onApply, onClose }: SheetProps) {
  const [level, setLevel] = useState<HardnessLevel>(session.hardness ?? 1);
  const [step, setStep] = useState<1 | 2>(1);
  useEffect(() => setStep(1), [level]);

  // Lo que el coach ha aprendido de cómo aguantas la dureza (ver `engine/hardnessLearning.ts`).
  const learning = useMemo(() => learnHardness(profile, history, todayIso), [profile, history, todayIso]);
  // La sesión de hoy con cada nivel (se generan al abrir) y su esfuerzo previsto; con la corrección aprendida si hay datos.
  const previews = useMemo(
    () =>
      ([0, 1, 2] as const).map((l) => {
        const s = generateSessionForDate({ ...profile, hardness: { ...(profile.hardness ?? {}), [todayIso]: l } }, history, new Date(), profile.goals);
        const planned = estimatePlannedStrain(s, history, strainBias);
        const raw = planned ? Math.round(planned.strain) : null;
        const shown = raw === null ? null : Math.max(0, Math.min(100, raw + (l > 0 ? learning.bias : 0)));
        const fit = shown !== null && target ? strainFit(shown, target).fit : 'dentro';
        return { level: l, raw, strain: shown, fit: fit as PlanFit };
      }),
    [profile, history, todayIso, strainBias, target, learning.bias],
  );
  const current = previews[level];
  const ctx = hardnessContextOf(session);
  const mode = hardnessMode({ competition: Boolean(session.competition), week: session.mesocycleWeek });
  const situation = hardnessSituation(ctx);
  const personal = level > 0 ? personalHardnessNote(learning, situation, level as 1 | 2) : null;
  const advice = hardnessAdvice(level, ctx, current.fit, personal);
  const tone = TONE[advice.tone];
  const needsConfirm = advice.confirm && level > 0;
  const pos = (v: number) => `${Math.min(97, Math.max(3, (v / GAUGE_MAX) * 100))}%`;

  const primary = () => {
    if (level === 0 || !needsConfirm || step === 2) {
      return onApply(level, { mode, situation, predicted: current.raw, targetLow: target?.low ?? null, targetHigh: target?.high ?? null, readiness: target?.readiness ?? null });
    }
    setStep(2);
  };

  return (
    <Modal open onClose={onClose} title="Subir la dureza de hoy">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Dureza">
          {([0, 1, 2] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={level === l}
              onClick={() => setLevel(l)}
              className={`flex flex-col items-center rounded-xl border-[1.5px] px-1 py-2.5 transition-colors ${level === l ? 'border-brand-orange bg-brand-orange/10' : 'border-transparent bg-white/[0.06] hover:bg-white/10'}`}
            >
              <span className="text-base font-bold text-white">{l === 0 ? 'Normal' : `+${l}`}</span>
              <span className="text-[10px] font-semibold text-neutral-500">{l === 0 ? 'como programado' : mode === 'volume' ? (l === 1 ? 'un poco más' : 'bastante más') : l === 1 ? '+2,5 % carga' : '+5 % carga'}</span>
            </button>
          ))}
        </div>

        {current.strain !== null && target && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500">Esfuerzo previsto</p>
            <div className="relative my-2 h-3 rounded-full bg-white/[0.07]">
              <div
                className="absolute inset-y-0 rounded-full border border-brand-neon/50 bg-brand-neon/25"
                style={{ left: pos(target.low), width: `${((target.high - target.low) / GAUGE_MAX) * 100}%` }}
                aria-hidden="true"
              />
              <div
                className="absolute -top-[3px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-brand-surface transition-[left] duration-200"
                style={{ left: pos(current.strain), background: FIT_COLOR[current.fit] }}
                aria-hidden="true"
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>0</span>
              <span>
                objetivo {target.low}–{target.high}
              </span>
              <span>{GAUGE_MAX}</span>
            </div>
            <p className="mt-2 text-sm">
              <b className="num text-base" style={{ color: FIT_COLOR[current.fit] }}>
                ~{current.strain}
              </b>{' '}
              <span style={{ color: FIT_COLOR[current.fit] }}>{FIT_WORD[current.fit]}</span>
            </p>
          </div>
        )}

        {level > 0 && (
          <ul className="border-t border-white/10">
            {hardnessChanges(level as 1 | 2, mode).map((c) => (
              <li key={c.label} className="flex gap-3 border-b border-white/10 py-2 text-[13px]">
                <span className="w-[74px] shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">{c.label}</span>
                <span className="text-neutral-300">{c.text}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`flex gap-2.5 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${tone.box}`} role="note">
          <tone.Icon size={17} strokeWidth={2.25} className={`mt-0.5 shrink-0 ${tone.icon}`} aria-hidden="true" />
          <div>
            <p className="font-bold text-white">{advice.title}</p>
            <p className="text-neutral-300">{advice.text}</p>
            {advice.personal && <p className="mt-1.5 border-t border-white/10 pt-1.5 font-medium text-white">{advice.personal}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white">
            Cancelar
          </button>
          <button
            onClick={primary}
            className={`rounded-full px-4 py-2.5 text-xs font-extrabold text-black transition-colors ${needsConfirm && step === 2 ? 'bg-warn' : 'bg-brand-orange'} hover:brightness-110`}
          >
            {level === 0 ? 'Dejarla normal' : needsConfirm ? (step === 2 ? 'Entendido, hacerla más dura' : 'Continuar') : 'Hacerla más dura'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
