import type { ReactNode } from 'react';
import { Activity, Apple, CalendarPlus, Check, ChevronRight, Moon, Trophy } from 'lucide-react';
import { benchmarkWorkouts, getMovementById } from '../../data/movements';
import type { DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { DayShapeChips } from '../shell/blockMeta';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import { ACCENT as EFFORT, OVER, type StrainView } from './StrainRing';

/** "Back Squat · WOD 12 min AMRAP" — el titular de la sesión de hoy en una línea, no el detalle entero (para eso está Planificación). */
function buildPreviewLine(session: DailySession): string {
  if (session.source === 'custom') return session.customTitle || 'Sesión propia';
  // Día de doble WOD: sin fuerza ni oly, el titular son las dos piezas.
  if (session.doubleWod) {
    const titles = session.blocks
      .filter((b) => b.block === 'wod' && b.wodPart !== undefined)
      .reduce<string[]>((acc, b) => (b.title && !acc.includes(b.title) ? [...acc, b.title] : acc), []);
    return `Doble WOD${titles.length > 0 ? ` · ${titles.map((t) => `"${t}"`).join(' + ')}` : ''}`;
  }
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

/** Lo comido en el día frente a lo que toca: proteína e hidratos, en gramos. */
export interface NutritionSummary {
  protein: { done: number; target: number };
  carbs: { done: number; target: number };
}

type BadgeTone = 'effort' | 'planned' | 'plannedOver' | 'over' | 'gold' | 'neutral';

/** La insignia de la izquierda, como en Whoop: un cuadrado de color con el número (o un icono) y el nombre al lado. */
function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const style =
    tone === 'effort'
      ? { backgroundColor: EFFORT, color: 'rgb(var(--c-brand-bg))' }
      : tone === 'over'
        ? { backgroundColor: OVER, color: 'rgb(var(--c-brand-bg))' }
        : tone === 'planned'
          ? { border: `1.5px dashed ${EFFORT}`, color: EFFORT, backgroundColor: 'rgb(var(--c-state-cool) / 0.1)' }
          : tone === 'plannedOver'
            ? { border: `1.5px dashed ${OVER}`, color: OVER, backgroundColor: 'rgb(var(--c-over) / 0.1)' }
            : tone === 'gold'
            ? { backgroundColor: 'rgb(var(--c-brand-gold) / 0.18)', color: 'rgb(var(--c-brand-gold))' }
            : { backgroundColor: 'rgb(var(--c-white) / 0.08)', color: 'rgb(var(--c-white) / 0.8)' };
  return (
    <span className="num flex h-12 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-semibold" style={style}>
      {children}
    </span>
  );
}

function Row({ badge, title, sub, right, onClick, muted = false }: { badge: ReactNode; title: string; sub: ReactNode; right?: ReactNode; onClick?: () => void; muted?: boolean }) {
  const body = (
    <>
      {badge}
      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm font-semibold ${muted ? 'text-neutral-400' : 'text-white'}`}>{title}</span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">{sub}</span>
      </span>
      {right}
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 transition-colors duration-200';
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:bg-white/[0.07]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const chevron = <ChevronRight size={16} className="mr-1 shrink-0 text-neutral-600" aria-hidden="true" />;

/**
 * "Tu día" bajo el anillo, al estilo de las actividades de Whoop: una fila por cosa que cuenta, con una insignia de color a
 * la izquierda. La sesión lleva su esfuerzo (previsto con borde discontinuo; real, relleno y en coral si rebasa el
 * objetivo) y la nutrición el porcentaje de lo que toca. Sustituye a la tarjeta grande de "Hoy".
 */
export function DayRows({
  isToday,
  session,
  entry,
  strain,
  nutrition,
  analysis,
  onNavigateToPlanificacion,
  onNavigateToNutricion,
  onOpenAnalysis,
}: {
  isToday: boolean;
  /** La sesión de hoy (null si ya entrenaste, no hay estructura activa o es otro día). */
  session: DailySession | null;
  /** Lo registrado el día elegido, si entrenaste. */
  entry: SessionHistoryEntry | undefined;
  strain: StrainView;
  nutrition: NutritionSummary | null;
  /** Los tres datos del análisis, ya formateados: dominios energéticos, desequilibrios y fuerza (en ese orden). */
  analysis: [string, string, string] | string[];
  onNavigateToPlanificacion: () => void;
  onNavigateToNutricion: () => void;
  /** Abre la ventana con el análisis completo. */
  onOpenAnalysis: () => void;
}) {
  const real = strain.real;
  const over = real !== null && real > strain.target.high;

  let sessionRow: ReactNode;
  if (entry) {
    sessionRow = (
      <Row
        badge={<Badge tone={over ? 'over' : 'effort'}>{real ?? '—'}</Badge>}
        title="Sesión completada"
        sub={`RPE ${entry.rpe} · ${entry.durationMin} min`}
        right={isToday ? <Check size={17} strokeWidth={2.5} className="mr-1 shrink-0" style={{ color: 'rgb(var(--c-state-good))' }} aria-hidden="true" /> : undefined}
        onClick={isToday ? onNavigateToPlanificacion : undefined}
      />
    );
  } else if (!isToday) {
    sessionRow = <Row badge={<Badge tone="neutral">—</Badge>} title="Sin sesión registrada" sub="Ese día no entrenaste" muted />;
  } else if (session?.competition?.eventDay) {
    sessionRow = (
      <Row badge={<Badge tone="gold"><Trophy size={20} strokeWidth={2.25} aria-hidden="true" /></Badge>} title="Hoy compites" sub="Calienta como un WOD y dosifica desde la primera prueba" right={chevron} onClick={onNavigateToPlanificacion} />
    );
  } else if (session?.isRestDay) {
    sessionRow = <Row badge={<Badge tone="neutral"><Moon size={19} strokeWidth={2.25} aria-hidden="true" /></Badge>} title="Día de descanso" sub="Toca recuperar — nada programado hoy" right={chevron} onClick={onNavigateToPlanificacion} />;
  } else if (session) {
    const minutes = estimateSessionMinutes(session);
    sessionRow = (
      <Row
        badge={<Badge tone={strain.planned && strain.planned.strain > strain.target.high ? 'plannedOver' : 'planned'}>{strain.planned ? `~${strain.planned.strain}` : '—'}</Badge>}
        title={buildPreviewLine(session)}
        sub={
          <>
            <DayShapeChips session={session} variant="text" className="inline !text-xs !text-neutral-500" />
            {minutes > 0 && ` · ~${minutes} min`}
          </>
        }
        right={chevron}
        onClick={onNavigateToPlanificacion}
      />
    );
  } else {
    sessionRow = <Row badge={<Badge tone="neutral"><CalendarPlus size={20} strokeWidth={2.25} aria-hidden="true" /></Badge>} title="Elige qué entrenar hoy" sub="Sin macrociclo ni programa activo" right={chevron} onClick={onNavigateToPlanificacion} />;
  }

  const pct = nutrition
    ? Math.round(((Math.min(1, nutrition.protein.done / Math.max(1, nutrition.protein.target)) + Math.min(1, nutrition.carbs.done / Math.max(1, nutrition.carbs.target))) / 2) * 100)
    : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel className="px-1">Tu día</SectionLabel>
      {isToday && session?.competition && !session.competition.eventDay && (
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-brand-gold">
          <Trophy size={13} strokeWidth={2.5} aria-hidden="true" />
          {competitionHeadline(session.competition)}
        </p>
      )}
      {sessionRow}
      {nutrition && pct !== null && (
        <Row
          badge={
            <Badge tone="neutral">
              {pct}
              <span className="text-[0.55em] font-medium">%</span>
            </Badge>
          }
          title="Nutrición"
          sub={
            <>
              <Apple size={11} className="mr-1 inline -translate-y-px" aria-hidden="true" />
              P <span className="num">{nutrition.protein.done}</span>/{nutrition.protein.target} g · H <span className="num">{nutrition.carbs.done}</span>/{nutrition.carbs.target} g
            </>
          }
          right={chevron}
          onClick={onNavigateToNutricion}
        />
      )}
      {/* Análisis: lo que no hace falta mirar cada día, con sus tres datos a la vista; la ventana trae el detalle. */}
      <Row
        badge={
          <Badge tone="neutral">
            <Activity size={20} strokeWidth={2.25} aria-hidden="true" />
          </Badge>
        }
        title="Análisis"
        sub={
          <>
            Energía <span className="num">{analysis[0]}</span> · Equilibrio <span className="num">{analysis[1]}</span> · Fuerza <span className="num">{analysis[2]}</span>
          </>
        }
        right={chevron}
        onClick={onOpenAnalysis}
      />
    </section>
  );
}
