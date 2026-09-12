import { useMemo } from 'react';
import { Flame, ArrowRight, Moon, CalendarPlus, PartyPopper } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import {
  generateSessionForDate,
  hasActiveTrainingStructure,
  isCachedSessionOrphaned,
  isCachedSessionStale,
} from '../../engine/generateSession';
import { toLocalIsoDate } from '../../engine/periodization';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';

/** "Back Squat · WOD 12 min AMRAP" — el titular de dos golpes de vista de la sesion de hoy, no el detalle entero (para eso esta Planificacion). */
function buildPreviewLine(session: DailySession): string {
  if (session.source === 'custom') return session.customTitle || 'Sesión propia';
  const strength = session.blocks.find((b) => b.block === 'strength' && !b.subgroup);
  const oly = [...session.blocks].reverse().find((b) => b.block === 'oly' && !b.subgroup);
  const main = strength ?? oly;
  const parts: string[] = [];
  if (main) {
    const name = getMovementById(main.movementId)?.name;
    if (name) parts.push(name);
  }
  const wod = session.blocks.find((b) => b.block === 'wod');
  if (wod) {
    if (wod.movementId.startsWith('benchmark:')) {
      const name = benchmarkWorkouts.find((w) => w.id === wod.movementId.replace('benchmark:', ''))?.name;
      if (name) parts.push(name);
    } else if (wod.title) {
      parts.push(`"${wod.title}"`);
    } else if (wod.format) {
      parts.push(wod.format);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sesión lista para entrenar';
}

const TILE_CLASS = 'flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200';

/**
 * Titular de "qué toca hoy" en el propio Dashboard — antes había que entrar a Planificación solo
 * para enterarte. Reutiliza la misma resolución determinista que `WeekStrip`/Planificación (lee la
 * caché vigente, si no genera igual que ellas harían — nunca escribe, la escritura autoritativa
 * sigue siendo cosa de Planificación) para no arriesgarse a mostrar algo distinto de lo que luego
 * se ve al entrar de verdad.
 */
export function TodayPreviewCard({
  profile,
  history,
  onNavigateToPlanificacion,
}: {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  onNavigateToPlanificacion: () => void;
}) {
  const todayIso = toLocalIsoDate(new Date());
  const completedToday = history.some((h) => h.date === todayIso);

  const session = useMemo(() => {
    if (completedToday || !hasActiveTrainingStructure(profile, todayIso)) return null;
    const cached = athleteRepository.getCachedSession(todayIso);
    if (cached && !isCachedSessionOrphaned(cached, profile, todayIso) && !isCachedSessionStale(cached)) return cached;
    return generateSessionForDate(profile, history, new Date(), profile.goals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, history, todayIso, completedToday]);

  if (completedToday) {
    return (
      <button
        onClick={onNavigateToPlanificacion}
        className={`${TILE_CLASS} border-brand-neon/25 bg-brand-neon/[0.08] hover:border-brand-neon/50`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-neon/15 text-brand-neon">
          <PartyPopper size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-neon">Hoy ya completado</p>
          <p className="mt-0.5 truncate text-sm text-neutral-300">Ver el resumen de tu sesión</p>
        </div>
        <ArrowRight size={17} strokeWidth={2.25} className="shrink-0 text-brand-neon" />
      </button>
    );
  }

  if (!session) {
    return (
      <button onClick={onNavigateToPlanificacion} className={`${TILE_CLASS} border-brand-border bg-brand-surface/60 hover:border-brand-gold/40`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-neutral-400">
          <CalendarPlus size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Elige qué entrenar hoy</p>
          <p className="mt-0.5 text-xs text-neutral-500">Sin macrociclo ni programa activo todavía</p>
        </div>
        <ArrowRight size={17} strokeWidth={2.25} className="shrink-0 text-neutral-500" />
      </button>
    );
  }

  if (session.isRestDay) {
    return (
      <button onClick={onNavigateToPlanificacion} className={`${TILE_CLASS} border-brand-border bg-brand-surface/60 hover:border-brand-gold/40`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-neutral-400">
          <Moon size={17} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Día de descanso</p>
          <p className="mt-0.5 text-xs text-neutral-500">Toca recuperar — nada programado hoy</p>
        </div>
        <ArrowRight size={17} strokeWidth={2.25} className="shrink-0 text-neutral-500" />
      </button>
    );
  }

  return (
    <button
      onClick={onNavigateToPlanificacion}
      className={`${TILE_CLASS} border-brand-orange/30 bg-brand-orange/[0.08] hover:border-brand-orange/60 hover:bg-brand-orange/[0.12]`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
        <Flame size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Entrenamiento de hoy</p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-white">{buildPreviewLine(session)}</p>
      </div>
      <ArrowRight size={18} strokeWidth={2.5} className="shrink-0 text-brand-orange" />
    </button>
  );
}
