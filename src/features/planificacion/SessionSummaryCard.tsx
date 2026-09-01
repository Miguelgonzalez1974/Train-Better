import { Flame, CalendarCheck2, TrendingUp, PartyPopper } from 'lucide-react';
import type { DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import type { E1rmSuggestion } from './Planificacion';

interface SessionSummaryCardProps {
  session: DailySession;
  entry: SessionHistoryEntry;
  workLog: WorkSetEntry[];
  streak: number;
  weekCount: { done: number; planned: number };
  prUpdateMessage: string | null;
  e1rmSuggestions: E1rmSuggestion[];
  onConfirmE1rm: (s: E1rmSuggestion) => void;
  onDismissE1rm: (s: E1rmSuggestion) => void;
}

/** "4/5 series · 90 kg" (o rango "85–95 kg") a partir del registro serie a serie, o null si no hay. */
function workSummary(workLog: WorkSetEntry[], movementId: string, prescribedSets: number): string | null {
  const sets = workLog.filter((e) => e.movementId === movementId).sort((a, b) => a.setNumber - b.setNumber);
  if (sets.length === 0) return null;
  const kgs = sets.map((s) => s.kg).filter((k) => k > 0);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const kgLabel = kgs.length === 0 ? '' : min === max ? ` · ${max} kg` : ` · ${min}–${max} kg`;
  const total = prescribedSets > 0 ? `${sets.length}/${prescribedSets}` : String(sets.length);
  return `${total} series${kgLabel}`;
}

function resolveWodDisplayName(movementId: string): string | null {
  if (!movementId.startsWith('benchmark:')) return getMovementById(movementId)?.name ?? null;
  const id = movementId.replace('benchmark:', '');
  return benchmarkWorkouts.find((w) => w.id === id)?.name ?? id;
}

/**
 * Recapitula lo entrenado hoy a partir del `DailySession` ya resuelto: el principal de fuerza (1er
 * entrada del bloque, la superserie A2 no se muestra aquí), el principal de oly (última entrada sin
 * `subgroup` — la anterior al calentamiento de barra, ver `buildOlyBlock`) y el WOD (nombre del
 * benchmark, o los movimientos reales del historial si es generado).
 */
function buildRecapLines(
  session: DailySession,
  entry: SessionHistoryEntry,
  workLog: WorkSetEntry[],
): { label: string; detail: string }[] {
  if (session.source === 'custom') {
    return session.customTitle ? [{ label: 'Sesión propia', detail: session.customTitle }] : [];
  }
  const lines: { label: string; detail: string }[] = [];

  const strengthMain = session.blocks.find((b) => b.block === 'strength');
  if (strengthMain) {
    const name = getMovementById(strengthMain.movementId)?.name;
    if (name) {
      // Si hay registro serie a serie, manda ese (lo que de verdad hiciste); si no, lo prescrito.
      const logged = workSummary(workLog, strengthMain.movementId, strengthMain.sets ?? 0);
      const scheme =
        logged ??
        [strengthMain.sets && `${strengthMain.sets}×${strengthMain.reps}`, strengthMain.loadKg && `${strengthMain.loadKg} kg`]
          .filter(Boolean)
          .join(' · ');
      lines.push({ label: 'Fuerza', detail: scheme ? `${name} — ${scheme}` : name });
    }
  }

  const olyEntries = session.blocks.filter((b) => b.block === 'oly' && !b.subgroup);
  const olyMain = olyEntries[olyEntries.length - 1];
  if (olyMain) {
    const name = getMovementById(olyMain.movementId)?.name;
    if (name) {
      const logged = workSummary(workLog, olyMain.movementId, olyMain.sets ?? 0);
      const scheme =
        logged ?? [olyMain.sets && `${olyMain.sets}×${olyMain.reps}`, olyMain.loadKg && `${olyMain.loadKg} kg`].filter(Boolean).join(' · ');
      lines.push({ label: 'Oly', detail: scheme ? `${name} — ${scheme}` : name });
    }
  }

  const wodBlocks = session.blocks.filter((b) => b.block === 'wod');
  if (wodBlocks.length > 0) {
    const isBenchmark = wodBlocks[0].movementId.startsWith('benchmark:');
    let name: string | null;
    if (isBenchmark) {
      name = resolveWodDisplayName(wodBlocks[0].movementId);
    } else {
      const ids = entry.wodMovementIds?.length ? entry.wodMovementIds : wodBlocks.map((b) => b.movementId);
      const names = ids.map((id) => getMovementById(id)?.name).filter((n): n is string => Boolean(n));
      name = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ') || null;
    }
    if (name) {
      const meaningful = entry.wodResult && !/^0([:+]0+)?$/.test(entry.wodResult.value.trim());
      lines.push({ label: 'WOD', detail: meaningful ? `${name} — ${entry.wodResult!.value}` : name });
    }
  }

  return lines;
}

/** Titular del coach — varia con el esfuerzo real registrado, no un texto fijo. */
function buildHeadline(entry: SessionHistoryEntry, dayIntensity: DailySession['dayIntensity']): string {
  if (entry.rxOrScaled === 'scaled') return 'Sesión registrada como escalada — el estímulo cuenta igual.';
  if (entry.rpe >= 9) return 'Sesión a tope hoy — bien exprimida.';
  if (entry.rpe <= 6) return 'Sesión cómoda hoy — la barra iba sobrada.';
  if (dayIntensity === 'alta') return 'Era el día fuerte de la semana y lo aguantaste.';
  if (dayIntensity === 'baja') return 'Día suave de la semana, tal y como tocaba.';
  return 'Sesión completada dentro de lo previsto.';
}

const rxPillClass = 'rounded-md px-2 py-0.5 text-xs font-semibold';

/**
 * Recapitulación que aparece nada más completar hoy y se queda ahí (se reconstruye desde el
 * `SessionHistoryEntry` persistido, no desde estado de sesión — sobrevive a un refresco). Reúne lo
 * disperso: qué se entrenó, el resultado, la racha real de adherencia, y los avisos de PR/e1RM que
 * antes flotaban sueltos encima de la sesión.
 */
export function SessionSummaryCard({
  session,
  entry,
  workLog,
  streak,
  weekCount,
  prUpdateMessage,
  e1rmSuggestions,
  onConfirmE1rm,
  onDismissE1rm,
}: SessionSummaryCardProps) {
  const recap = buildRecapLines(session, entry, workLog);
  const hasAchievements = Boolean(prUpdateMessage) || e1rmSuggestions.length > 0;

  return (
    <div className="card flex flex-col gap-3.5 border-brand-neon/25 p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-neon/15 text-brand-neon">
          <PartyPopper size={14} strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{buildHeadline(entry, session.dayIntensity)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`${rxPillClass} ${entry.rxOrScaled === 'rx' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/10 text-neutral-300'}`}
            >
              {entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}
            </span>
            <span className={`${rxPillClass} bg-white/5 text-neutral-400`}>RPE {entry.rpe}</span>
            <span className={`${rxPillClass} bg-white/5 text-neutral-400`}>{entry.durationMin} min</span>
          </div>
        </div>
      </div>

      {recap.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
          {recap.map((line) => (
            <div key={line.label} className="flex items-baseline gap-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">{line.label}</span>
              <span className="text-neutral-200">{line.detail}</span>
            </div>
          ))}
        </div>
      )}

      {hasAchievements && (
        <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold">
            <TrendingUp size={12} strokeWidth={2.5} />
            Logros de hoy
          </p>
          {prUpdateMessage && <p className="text-sm text-neutral-200">{prUpdateMessage}</p>}
          {e1rmSuggestions.map((s) => (
            <div key={`${s.target.kind}-${s.target.key}`} className="rounded-lg bg-brand-gold/10 px-3 py-2.5 text-sm">
              <p className="text-neutral-200">
                Estimación de nuevo máximo en <span className="font-semibold text-brand-gold">{s.movementName}</span>: ~
                {s.estimatedKg} kg (tu PR actual es {s.currentKg} kg)
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                A partir de tu serie de hoy — es una estimación, no un test. Puedes confirmarla o esperar a probarla de verdad.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onConfirmE1rm(s)}
                  className="rounded-md bg-brand-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-gold-soft"
                >
                  Actualizar PR a {s.estimatedKg} kg
                </button>
                <button
                  onClick={() => onDismissE1rm(s)}
                  className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                >
                  Ahora no
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 border-t border-white/5 pt-3 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Flame size={13} strokeWidth={2.25} className="text-brand-orange" />
          Racha: {streak} {streak === 1 ? 'día' : 'días'}{streak > 1 ? ' sin fallar un día programado' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarCheck2 size={13} strokeWidth={2.25} className="text-brand-neon" />
          Esta semana: {weekCount.done} de {weekCount.planned}
        </span>
      </div>
    </div>
  );
}
