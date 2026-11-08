import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Dumbbell } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { generateCompanionSession, type CompanionSessionPlan } from '../../engine/generateSession';
import {
  acceptCompanion,
  companionStatus,
  completeCompanion,
  declineCompanion,
  isCompanionProgram,
  pauseCompanion,
  resumeCompanion,
  skipCompanion,
  undoAcceptCompanion,
  undoDeclineCompanion,
  type CompanionProgram,
} from '../../engine/strengthCompanion';
import { STRENGTH_METHOD_LABEL } from '../../engine/strengthPrograms';
import { getMovementById } from '../../data/movements';
import { formatIsoDateShort } from '../../lib/dateFormat';
import { rexBus } from '../../lib/rexBus';
import { CompanionWeeks } from './CompanionWeeks';

/** El programa de fuerza que convive con el macro y le toca ofrecerse hoy, ya está en curso o empieza pronto (para poder verlo antes de que arranque), si hay alguno. */
export function pickCompanionProgram(profile: AthleteProfile, todayIso: string): CompanionProgram | null {
  return (profile.strengthPrograms ?? []).filter(isCompanionProgram).find((p) => {
    const kind = companionStatus(p, todayIso).kind;
    return kind !== 'terminado';
  }) ?? null;
}

/** Minutos aproximados de la sesión del programa (calentamiento, series y descansos). */
export function companionMinutes(plan: CompanionSessionPlan): number {
  if (plan.isTest) return 25;
  return Math.round((10 + plan.sets * 3.5) / 5) * 5;
}

const KG = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/**
 * El programa de fuerza que convive con el macro, bajo la sesión del día: «¿quieres hacerla hoy?». Si dices que sí, sale como parte del día
 * y se marca como hecha con su RPE y sus minutos; si dices que no, la sesión espera y se vuelve a ofrecer mañana. Toda la lógica de
 * cuándo toca y qué pasa con cada respuesta vive en `engine/strengthCompanion.ts`; aquí solo se pinta y se guarda.
 */
export function CompanionCard({
  profile,
  history,
  todayIso,
  commit,
  light = null,
}: {
  /** El semáforo del día: con ámbar o rojo la tarjeta avisa, pero no bloquea nada (lo decide el usuario). */
  light?: { color: 'verde' | 'ambar' | 'rojo'; name: string; reason?: string } | null;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  todayIso: string;
  /** Aplica un cambio al perfil guardado (lo relee, lo cambia, lo guarda y refresca la pantalla). */
  commit: (change: (p: AthleteProfile) => AthleteProfile) => void;
}) {
  const program = pickCompanionProgram(profile, todayIso);
  const status = program ? companionStatus(program, todayIso) : null;
  const wantsPlan = status?.kind === 'oferta' || status?.kind === 'aceptada' || status?.kind === 'aplazada';
  const plan = useMemo(
    () => (program && wantsPlan ? generateCompanionSession(profile, history, program, todayIso) : null),
    // La sesión depende del puntero y de los PR; no de cualquier cambio del perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program?.id, program?.companion.cursor, program?.companion.fiveRm, profile.prs, wantsPlan, todayIso, history.length, profile.readinessLog],
  );
  const [more, setMore] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mark, setMark] = useState<string>('');
  /** Texas, viernes: el peso con el que salieron las 5 repeticiones de cada marca (vacío = no salió). */
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [weeksOpen, setWeeksOpen] = useState(false);
  // RexLab abre la vista semana a semana.
  useEffect(() => rexBus.on('companion-weeks', () => setWeeksOpen(true)), []);

  if (!program || !status) return null;
  const id = program.id;

  if (status.kind === 'no-empieza') {
    return (
      <section id="companion-card" className="flex flex-col gap-2 rounded-xl border border-white/10 px-3.5 py-3 text-xs text-neutral-400" aria-label="Programa de fuerza: aún no ha empezado">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <Dumbbell size={13} aria-hidden="true" /> Programa de fuerza
        </p>
        <p className="text-sm text-neutral-200">
          {program.method === 'texas' ? 'Texas Method' : STRENGTH_METHOD_LABEL[program.method]}
          {program.companion.weeks ? ` · ${program.companion.weeks} semanas` : ''} · empieza el <span className="num">{formatIsoDateShort(status.startDate)}</span>.
        </p>
        <p>Cuando llegue, te lo ofreceré cada día que toque debajo de la sesión del macro, y tú decides si lo haces.</p>
        <button onClick={() => setWeeksOpen(true)} className="self-start rounded-full border border-brand-border px-3 py-1 font-semibold text-neutral-200 hover:bg-white/5">
          Ver semana a semana
        </button>
        <CompanionWeeks open={weeksOpen} onClose={() => setWeeksOpen(false)} profile={profile} history={history} program={program} todayIso={todayIso} />
      </section>
    );
  }
  if (status.kind === 'pausado') {
    return (
      <section id="companion-card" className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs text-neutral-400" aria-label="Programa de fuerza en pausa">
        <span>
          Programa de fuerza en pausa hasta el <span className="num text-neutral-200">{formatIsoDateShort(status.until)}</span>.
        </span>
        <button onClick={() => commit((p) => resumeCompanion(p, id))} className="shrink-0 rounded-full border border-brand-border px-3 py-1 font-semibold text-neutral-200 hover:bg-white/5">
          Reanudar
        </button>
      </section>
    );
  }
  if (status.kind === 'espera') {
    return (
      <p id="companion-card" className="px-1 text-xs text-neutral-500">
        Programa de fuerza · próxima sesión el <span className="num text-neutral-300">{formatIsoDateShort(status.dueDate)}</span>.
      </p>
    );
  }
  if (status.kind === 'hecha-hoy') {
    return (
      <p id="companion-card" className="flex items-center gap-1.5 px-1 text-xs text-neutral-400">
        <Check size={13} className="text-good" aria-hidden="true" /> Sesión del programa de fuerza hecha hoy.
      </p>
    );
  }
  if (status.kind === 'aplazada') {
    return (
      <section id="companion-card" className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs text-neutral-400" aria-label="Sesión del programa aplazada">
        <span>
          Sesión {status.index + 1} del programa aplazada: <span className="text-neutral-200">mañana se vuelve a ofrecer</span>.
        </span>
        <button onClick={() => commit((p) => undoDeclineCompanion(p, id, todayIso))} className="shrink-0 rounded-full border border-brand-border px-3 py-1 font-semibold text-neutral-200 hover:bg-white/5">
          Deshacer
        </button>
      </section>
    );
  }
  if (!plan) return null;

  const accepted = status.kind === 'aceptada';
  const late = status.kind === 'oferta' && status.late;
  const mins = companionMinutes(plan);
  const total = plan.total ? ` de ${plan.total}` : '';
  const tag = plan.isTest ? 'Test' : accepted ? 'En tu día' : late ? 'Pendiente' : 'Complemento';
  const isOneRm = plan.isTest && plan.format === 'Test 1RM';

  function finish() {
    if (!plan) return;
    const kg = Number(mark.replace(',', '.'));
    const tested = isOneRm && Number.isFinite(kg) && kg > 0 ? kg : undefined;
    commit((p) => {
      const achieved: Partial<Record<'backSquat' | 'benchPress' | 'strictPress', number>> = {};
      if (plan.intensity) {
        for (const l of plan.lifts.filter((x) => x.attempt)) {
          const kgDone = Number((marks[l.prKey] ?? String(l.loadKg)).replace(',', '.'));
          if (Number.isFinite(kgDone) && kgDone > 0) achieved[l.prKey as 'backSquat' | 'benchPress' | 'strictPress'] = kgDone;
        }
      }
      let next = completeCompanion(p, id, todayIso, {
        label: plan.title,
        movementId: plan.movementId,
        loadKg: tested ?? plan.loadKg,
        rpe,
        durationMin: minutes ?? mins,
        achieved: plan.intensity ? achieved : undefined,
      });
      // Un test de 1RM mejor que tu PR lo actualiza: de él salen las cargas de todo lo que viene.
      if (tested !== undefined && tested > next.prs[plan.prKey]) next = { ...next, prs: { ...next.prs, [plan.prKey]: tested } };
      return next;
    });
    setMark('');
    setMarks({});
    setMinutes(null);
  }

  return (
    <section id="companion-card" aria-label="Programa de fuerza" className="card flex flex-col gap-2.5 border border-white/15 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <Dumbbell size={13} aria-hidden="true" /> Programa de fuerza
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${plan.isTest ? 'bg-info/15 text-info' : late ? 'bg-warn/15 text-warn' : 'bg-white/10 text-neutral-300'}`}>{tag}</span>
      </div>

      <div>
        <p className="text-[15px] font-semibold leading-snug text-white">{plan.title}</p>
        <p className="text-xs text-neutral-500">
          {plan.role} · semana {plan.week}{plan.weeks ? ` de ${plan.weeks}` : ''} · sesión <span className="num">{plan.index + 1}</span>
          {total}
        </p>
      </div>

      <dl className="divide-y divide-white/[0.06] rounded-lg bg-white/[0.03] px-3 text-sm">
        {plan.lifts.length > 1 &&
          plan.lifts.map((l) => (
            <div key={l.prKey} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="min-w-0 text-neutral-200">
                {getMovementById(l.movementId)?.name ?? l.movementId}
                <span className="text-neutral-500">
                  {' '}
                  · {l.sets}×{l.reps}
                  {l.attempt ? ' · marca a batir' : ''}
                </span>
              </dt>
              <dd className="num shrink-0 font-semibold text-white">{KG(l.loadKg)}</dd>
            </div>
          ))}
        {plan.lifts.length <= 1 && plan.blocks.map((b, i) => {
          const m = getMovementById(b.movementId);
          return (
            <div key={`${b.movementId}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="min-w-0 text-neutral-200">
                {m?.name ?? b.movementId}
                {plan.blocks.length === 1 && plan.sets > 0 && plan.reps && !plan.isTest && (
                  <span className="text-neutral-500">
                    {' '}
                    · {plan.sets}×{plan.reps}
                  </span>
                )}
              </dt>
              <dd className="num shrink-0 font-semibold text-white">{b.loadKg ? KG(b.loadKg) : '—'}</dd>
            </div>
          );
        })}
        <div className="flex items-baseline justify-between gap-3 py-2 text-xs">
          <dt className="text-neutral-500">Duración aproximada</dt>
          <dd className="num text-neutral-300">~{mins} min</dd>
        </div>
      </dl>

      <div className="flex items-center gap-4">
        <button onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
          Cómo hacerla <ChevronDown size={13} aria-hidden="true" className={showNotes ? 'rotate-180' : ''} />
        </button>
        <button onClick={() => setWeeksOpen(true)} className="text-xs font-medium text-neutral-500 hover:text-neutral-300">
          Ver semana a semana
        </button>
      </div>
      <CompanionWeeks open={weeksOpen} onClose={() => setWeeksOpen(false)} profile={profile} history={history} program={program} todayIso={todayIso} />
      {showNotes && <p className="text-xs leading-relaxed text-neutral-400">{plan.notes}</p>}

      {!accepted && light && light.color !== 'verde' && (
        <p className={`rounded-lg px-3 py-2 text-xs leading-snug ${light.color === 'rojo' ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn'}`}>
          Hoy es {light.name.toLowerCase()}
          {light.reason ? ` (${light.reason.charAt(0).toLowerCase()}${light.reason.slice(1)})` : ''}. Puedes hacerla igual: lo decides tú.
        </p>
      )}

      {!accepted ? (
        <>
          <p className="text-sm text-neutral-200">
            {plan.isTest ? 'Semana de test: la única sesión que no se salta.' : late ? 'Se quedó pendiente. ¿La hacemos hoy?' : '¿Quieres hacerla hoy?'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => commit((p) => acceptCompanion(p, id, todayIso))} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark">
              Hacerla hoy
            </button>
            <button onClick={() => commit((p) => declineCompanion(p, id, todayIso))} className="rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
              Hoy no
            </button>
            <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="ml-auto rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              Más…
            </button>
          </div>
          {status.kind === 'oferta' && status.deferrals >= 2 && (
            <p className="text-xs text-warn">Llevas {status.deferrals} aplazamientos seguidos. Si no te encaja ahora, puedes pausar el programa unos días.</p>
          )}
          {more && (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-2.5">
              {!plan.isTest && (
                <button
                  onClick={() => {
                    if (window.confirm('¿Saltar esta sesión? El programa avanza a la siguiente sin hacerla.')) commit((p) => skipCompanion(p, id, todayIso, plan.title));
                  }}
                  className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5"
                >
                  Saltar esta sesión
                </button>
              )}
              <button onClick={() => commit((p) => pauseCompanion(p, id, todayIso, 7))} className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5">
                Pausar 7 días
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3">
          <p className="text-sm text-neutral-200">Hazla cuando te venga bien hoy. Al terminar, apunta cómo fue.</p>
          {plan.intensity &&
            plan.lifts
              .filter((l) => l.attempt)
              .map((l) => (
                <label key={l.prKey} className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                  <span>
                    {getMovementById(l.movementId)?.name ?? l.movementId}: peso de las 5 reps
                    <span className="block text-xs text-neutral-500">Vacío si no salieron</span>
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={marks[l.prKey] ?? String(l.loadKg)}
                    onChange={(e) => setMarks((prev) => ({ ...prev, [l.prKey]: e.target.value }))}
                    aria-label={`Peso con el que salieron las 5 repeticiones de ${getMovementById(l.movementId)?.name ?? l.movementId}`}
                    className="num h-9 w-24 rounded-lg border border-brand-border bg-brand-bg px-2 text-right text-white focus:border-brand-gold focus:outline-none"
                  />
                </label>
              ))}
          {isOneRm && (
            <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
              Marca de hoy (kg)
              <input
                type="text"
                inputMode="decimal"
                value={mark}
                onChange={(e) => setMark(e.target.value)}
                placeholder={String(plan.loadKg)}
                aria-label="Marca de hoy en kilos"
                className="num h-9 w-24 rounded-lg border border-brand-border bg-brand-bg px-2 text-right text-white focus:border-brand-gold focus:outline-none"
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm text-neutral-300">
            <label className="flex flex-col gap-1">
              RPE (1–10)
              <input type="number" min={1} max={10} step={0.5} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="num h-9 rounded-lg border border-brand-border bg-brand-bg px-2 text-white focus:border-brand-gold focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              Minutos
              <input
                type="number"
                min={5}
                max={180}
                value={minutes ?? mins}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="num h-9 rounded-lg border border-brand-border bg-brand-bg px-2 text-white focus:border-brand-gold focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={finish} className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark">
              Marcar como hecha
            </button>
            <button onClick={() => commit((p) => undoAcceptCompanion(p, id))} className="rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-white/5">
              Deshacer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
