import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays } from 'lucide-react';
import { getActiveMacrocycle, getDayPlan, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import type { Macrocycle, SessionHistoryEntry } from '../../data/athlete/types';

const WEEKS = 12;
/** RPE por debajo de este umbral se trata como recuperacion activa, no como entreno "duro". */
const RECOVERY_RPE_THRESHOLD = 3;
/** Tamano maximo de celda (px) — evita que la cuadricula crezca de mas en una tarjeta ancha (ver MAX_GRID_WIDTH). */
const MAX_CELL_PX = 18;
const GRID_GAP_PX = 3;
const MAX_GRID_WIDTH = WEEKS * (MAX_CELL_PX + GRID_GAP_PX) - GRID_GAP_PX;

type CellKind = 'future' | 'rest' | 'trained' | 'recovery' | 'missed' | 'offSeason';

interface DayCell {
  iso: string;
  rpe: number | null;
  kind: CellKind;
}

function trainedBucketClass(rpe: number): string {
  if (rpe <= 6) return 'bg-brand-orange/40';
  if (rpe <= 8) return 'bg-brand-orange/70';
  return 'bg-brand-orange';
}

const CELL_CLASS: Record<Exclude<CellKind, 'trained' | 'future'>, string> = {
  rest: 'bg-sky-500/15',
  recovery: 'bg-emerald-500/50',
  missed: 'border border-red-500/40 bg-transparent',
  offSeason: 'bg-white/[0.04]',
};

const KIND_TITLE: Record<CellKind, string> = {
  future: '',
  rest: 'Descanso programado',
  recovery: 'Recuperación activa',
  trained: 'Entrenamiento',
  missed: 'Día de entreno no registrado',
  offSeason: 'Fase de mantenimiento (fuera del macrociclo) — entreno ligero opcional',
};

interface TrainingHeatmapProps {
  history: SessionHistoryEntry[];
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  macrocycles: Macrocycle[];
}

export function TrainingHeatmap({ history, trainingDaysPerWeek, macrocycles }: TrainingHeatmapProps) {
  const [pinnedIso, setPinnedIso] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // En movil no hay hover: un toque fija el tooltip. Tocar fuera del mapa lo cierra.
  useEffect(() => {
    if (!pinnedIso) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPinnedIso(null);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [pinnedIso]);

  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() - getWeekdayIndex(today));

  const startMonday = new Date(currentMonday);
  startMonday.setDate(startMonday.getDate() - (WEEKS - 1) * 7);

  const historyByDate = new Map(history.map((h) => [h.date, h]));

  const columns: DayCell[][] = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(startMonday);
      date.setDate(date.getDate() + w * 7 + d);
      const iso = toLocalIsoDate(date);

      if (iso > todayIso) return { iso, rpe: null, kind: 'future' as CellKind };

      const entry = historyByDate.get(iso);
      if (entry) {
        const kind: CellKind = entry.rpe <= RECOVERY_RPE_THRESHOLD ? 'recovery' : 'trained';
        return { iso, rpe: entry.rpe, kind };
      }

      if (!getActiveMacrocycle(macrocycles, iso)) return { iso, rpe: null, kind: 'offSeason' as CellKind };

      const isTrainingDay = getDayPlan(d, trainingDaysPerWeek).isTrainingDay;
      return { iso, rpe: null, kind: isTrainingDay ? ('missed' as CellKind) : ('rest' as CellKind) };
    }),
  );

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
          <CalendarDays size={18} strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white">Constancia</p>
          <p className="text-xs text-neutral-500">Últimas {WEEKS} semanas</p>
        </div>
      </div>

      {/*
        Grid fluido (columnas/filas en fr, no px fijos) en vez del flex+overflow-x-auto anterior —
        ese scroll lateral quedaba mal dentro de una tarjeta (ningun otro componente de la app
        desplaza su propio contenido) y en pantallas estrechas se veia roto. grid-auto-flow:column
        rellena cada columna (semana) de arriba a abajo antes de pasar a la siguiente, igual que el
        orden en que ya viene `columns` (semana por semana, 7 dias cada una) — sin reordenar nada.
        El envoltorio con max-width limita el tamano maximo de celda: sin tope, en una tarjeta ancha
        (la mitad del dashboard en 2 columnas, a partir de `sm:`) las celdas crecian mas de lo
        necesario y la card salia mucho mas alta que su pareja (Tus PRs). `minmax(0, min(1fr, Npx))`
        directamente en grid-template-columns NO es CSS valido (fr no se puede mezclar dentro de
        min()) — el navegador lo descarta en silencio y la regla entera se pierde. Limitar el ANCHO
        DEL CONTENEDOR en su lugar consigue el mismo resultado con CSS valido: el grid interior
        sigue siendo 100% fluido (1fr, sin tope propio). El tope solo se aplica a partir de `sm:`
        (mismo breakpoint que activa el grid de 2 columnas en Dashboard.tsx) — en movil, con la
        tarjeta a ancho completo y en su propia columna, no hace falta ningun tope: la cuadricula ya
        llega borde a borde de forma natural, y limitarla ahi tambien dejaria un hueco vacio a la
        derecha sin ganar nada a cambio.
      */}
      <div className="mt-4 sm:[max-width:var(--heatmap-max-w)]" style={{ '--heatmap-max-w': `${MAX_GRID_WIDTH}px` } as CSSProperties}>
        <div
          ref={containerRef}
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
            gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
            gridAutoFlow: 'column',
          }}
        >
        {columns.flat().map((cell) => {
          if (cell.kind === 'future') {
            return <div key={cell.iso} className="aspect-square rounded-sm bg-transparent" />;
          }
          const label = `${cell.iso} · ${KIND_TITLE[cell.kind]}${cell.rpe !== null ? ` (RPE ${cell.rpe})` : ''}`;
          const isPinned = pinnedIso === cell.iso;
          return (
            <div key={cell.iso} className="group relative">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedIso(isPinned ? null : cell.iso);
                }}
                className={`aspect-square w-full cursor-pointer rounded-sm transition-transform duration-150 hover:scale-125 ${
                  cell.kind === 'trained' ? trainedBucketClass(cell.rpe!) : CELL_CLASS[cell.kind]
                }`}
              />
              <div
                role="tooltip"
                className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-brand-border bg-brand-surface px-2 py-1 text-[11px] text-neutral-200 shadow-lg transition-opacity duration-100 ${
                  isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {label}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-sky-500/15" /> Descanso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500/50" /> Recuperación
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-red-500/40" /> No registrado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-white/[0.04]" /> Mantenimiento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-orange/40" />
          <span className="h-3 w-3 rounded-sm bg-brand-orange/70" />
          <span className="h-3 w-3 rounded-sm bg-brand-orange" /> Entreno (según esfuerzo)
        </span>
      </div>
    </section>
  );
}
