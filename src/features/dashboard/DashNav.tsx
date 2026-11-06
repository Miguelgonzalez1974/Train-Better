import { useRef, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DashTab } from './DayRing';
import { headerDate, type MacroChip } from './dayHeader';

/** Encima del selector: la fecha del día que se mira y, a la derecha, el programa activo (nombre, semana y días para competir). Tocarlo lleva a Objetivos. */
export function DayHeader({ dayIso, macro, onOpenMacro }: { dayIso: string; macro: MacroChip | null; onOpenMacro: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 md:mt-0">
      <h1 className="shrink-0 text-[15px] font-semibold tracking-tight text-white">{headerDate(dayIso)}</h1>
      {macro && (
        <button
          onClick={onOpenMacro}
          aria-label={`Programa activo: ${macro.label}, ${macro.week}${macro.countdown ? `, faltan ${macro.countdown} para competir` : ''}. Abrir Objetivos`}
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:border-white/25 hover:text-white"
        >
          <span className="min-w-0 truncate">{macro.label}</span>
          <span className="num shrink-0 text-neutral-500">· {macro.week}</span>
          {macro.countdown && <span className="num shrink-0 font-semibold text-brand-gold">· {macro.countdown}</span>}
        </button>
      )}
    </div>
  );
}

const TABS: { id: DashTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'esfuerzo', label: 'Esfuerzo' },
  { id: 'preparacion', label: 'Preparación' },
  { id: 'sueno', label: 'Sueño' },
];

/** Pestañas de arriba, al estilo Whoop: texto pequeño en mayúsculas y una raya bajo la activa. */
export function DashTabs({ tab, onChange }: { tab: DashTab; onChange: (t: DashTab) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.07]" role="tablist" aria-label="Secciones del Dashboard">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`relative -mb-px px-1 pb-2.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors duration-200 ${
            tab === t.id ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {t.label}
          {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

const SHORT_DAY = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Hoy", "Ayer" o "mié 14 oct". */
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Hoy';
  if (iso === addDays(todayIso, -1)) return 'Ayer';
  return SHORT_DAY.format(new Date(`${iso}T12:00:00`)).replace('.', '');
}

/** La versión corta para el centro del anillo: "Hoy", "Ayer" o "mié 14". */
export function ringDayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso || iso === addDays(todayIso, -1)) return dayLabel(iso, todayIso);
  const d = new Date(`${iso}T12:00:00`);
  return `${new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d).replace('.', '')} ${d.getDate()}`;
}

/** Cuántos días hacia atrás se puede mirar (lo que guardan el historial y los objetivos de cada día). */
export const MAX_DAYS_BACK = 28;

/** El día `delta` días antes o después de `iso`, sin pasar de hoy ni de `MAX_DAYS_BACK` días atrás (si no cabe, se queda donde está). */
export function shiftDay(iso: string, delta: number, todayIso: string): string {
  const next = addDays(iso, delta);
  return next > todayIso || next < addDays(todayIso, -MAX_DAYS_BACK) ? iso : next;
}

/**
 * Deslizar el dedo en horizontal para cambiar de día: hacia la derecha, el día anterior; hacia la izquierda, el
 * siguiente. Solo cuenta un gesto claro (largo y más horizontal que vertical), así no estorba al desplazamiento normal.
 */
export function useDaySwipe(onShift: (delta: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onShift(dx > 0 ? -1 : 1);
    },
  };
}

/** Selector de día en una cápsula: ‹ Hoy › — hacia atrás hasta `MAX_DAYS_BACK` días, nunca hacia el futuro. */
export function DaySelector({ dayIso, todayIso, onChange }: { dayIso: string; todayIso: string; onChange: (iso: string) => void }) {
  const atToday = dayIso >= todayIso;
  const atStart = dayIso <= addDays(todayIso, -MAX_DAYS_BACK);
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={() => onChange(addDays(dayIso, -1))} disabled={atStart} aria-label="Día anterior" className={btn}>
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => onChange(todayIso)}
        disabled={atToday}
        aria-label="Volver a hoy"
        className="min-w-[9rem] rounded-full bg-white/[0.07] px-5 py-2 text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-colors enabled:hover:bg-white/10"
      >
        {dayLabel(dayIso, todayIso)}
      </button>
      <button onClick={() => onChange(addDays(dayIso, 1))} disabled={atToday} aria-label="Día siguiente" className={btn}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
