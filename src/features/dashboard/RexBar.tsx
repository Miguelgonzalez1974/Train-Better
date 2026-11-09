import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Apple, BarChart3, CalendarCheck, ChevronDown, ChevronRight, PersonStanding, Flame, Gauge, Radar, Scale, Target, Trophy, type LucideIcon } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import { REX_MODULES, type RexSuggestion, type RexTarget } from './rexDashboard';

const MODULE_ICON: Partial<Record<RexTarget, LucideIcon>> = {
  nutricion: Apple,
  movilidad: PersonStanding,
  semana: CalendarCheck,
  constancia: Flame,
  volumen: BarChart3,
  analisis: Activity,
  marcas: Trophy,
  forma: Gauge,
  perfil: Radar,
  objetivos: Target,
  peso: Scale,
};

const TYPE_MS = 18;

/** El color del verbo del consejo: los mismos colores de estado que los anillos. */
const LEAD_COLOR: Record<NonNullable<RexSuggestion['tone']>, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  bad: 'rgb(var(--c-state-low))',
  info: 'rgb(var(--c-state-cool))',
  gold: 'rgb(var(--c-brand-gold))',
};

/**
 * Rex arriba del Dashboard: una frase con atajos a lo que toca ahora (check-in, revisión, nutrición…) y un «Más» con los módulos
 * que antes eran botones sueltos. La frase solo se escribe con animación la primera vez que sale cada día. Todo lo que decide
 * (qué sugerir, qué recordar) viene de `rexDashboard.ts`; aquí solo se dibuja y se avisa de lo que pulsas.
 */
export function RexBar({
  suggestion,
  waiting,
  typedAlready,
  badges,
  dots,
  extra,
  showDate = true,
  modules = true,
  defaultMore = false,
  hide = [],
  onAction,
  onDismiss,
  onNext,
  onTyped,
}: {
  /** Pasa a la siguiente cosa que Rex tiene que contar, sin apartar la actual. */
  onNext: () => void;
  /** Una celda más al final de «Más» (el cambio de tema). */
  extra?: ReactNode;
  /** Enseñar la fecha de hoy bajo el muñeco (en el Dashboard sí; donde el título ya dice el día, no). */
  showDate?: boolean;
  /** Enseñar el botón «Más» con los módulos del Dashboard. */
  modules?: boolean;
  /** «Más» sale abierto (en el panel de la esquina). */
  defaultMore?: boolean;
  /** Módulos de «Más» que hoy no se pueden abrir (por ejemplo «Tu semana» sin ninguna semana que repasar). */
  hide?: RexTarget[];
  suggestion: RexSuggestion;
  /** Cuántas sugerencias más esperan detrás de la que se ve. */
  waiting: number;
  /** La frase ya se escribió con animación hoy: sale entera. */
  typedAlready: boolean;
  /** Texto pequeño junto a un módulo de «Más» (por ejemplo el % de constancia o cuántos objetivos hay). */
  badges: Partial<Record<RexTarget, string>>;
  /** Módulos con un aviso sin ver (un punto naranja). */
  dots: RexTarget[];
  onAction: (target: RexTarget) => void;
  onDismiss: () => void;
  onTyped: () => void;
}) {
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), []);
  const animate = !typedAlready && !reduced;
  const [shown, setShown] = useState(animate ? 0 : suggestion.text.length);
  const [more, setMore] = useState(defaultMore);
  // Sin memoizar: si la app queda abierta pasada la medianoche, la fecha se corrige sola en el siguiente repintado.
  const now = new Date();
  const today = {
    weekday: now.toLocaleDateString('es', { weekday: 'short' }).replace('.', ''),
    dayMonth: now.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', ''),
    long: now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  const typing = shown < suggestion.text.length;

  // Al cambiar de frase: se escribe letra a letra solo si no se había escrito hoy; si no, sale entera.
  useEffect(() => {
    if (!animate) {
      setShown(suggestion.text.length);
      return;
    }
    setShown(0);
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= suggestion.text.length) {
        window.clearInterval(timer);
        onTyped();
      }
    }, TYPE_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion.id, suggestion.text, animate]);

  const quiet = suggestion.id === 'quiet';
  const leadLen = suggestion.lead && suggestion.text.startsWith(suggestion.lead) ? suggestion.lead.length : 0;

  return (
    <section aria-label="Rex" className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3.5 py-3">
      <div className="flex items-start gap-3">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1">
          <RexMascot size={40} mood={typing ? 'think' : suggestion.mood} />
          {/* La fecha de hoy, siempre: no cambia al mirar otro día con el selector. */}
          {showDate && <p className="text-center text-[11px] font-bold leading-tight text-neutral-300" aria-label={`Hoy es ${today.long}`}>
            <span className="block capitalize">{today.weekday}</span>
            <span className="num block">{today.dayMonth}</span>
          </p>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="min-h-[2.5rem] text-[13px] leading-relaxed text-neutral-100" aria-live="polite">
            {leadLen > 0 && (
              <strong className="font-bold" style={{ color: LEAD_COLOR[suggestion.tone ?? 'info'] }}>
                {suggestion.text.slice(0, Math.min(shown, leadLen))}
              </strong>
            )}
            {suggestion.text.slice(leadLen, Math.max(shown, leadLen))}
            {typing && <span className="ml-0.5 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-neutral-400 motion-reduce:animate-none" aria-hidden="true" />}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {suggestion.actions.map((a, i) => (
              <button
                key={a.label}
                onClick={() => onAction(a.target)}
                className={
                  i === 0
                    ? 'rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-orange-dark'
                    : 'rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/5'
                }
              >
                {a.label}
              </button>
            ))}
            {!quiet && suggestion.dismissible !== false && (
              <button onClick={onDismiss} className="rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300">
                Ahora no
              </button>
            )}
            {modules && <button
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              className="relative ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
            >
              Más
              <ChevronDown size={13} aria-hidden="true" className={`transition-transform duration-200 ${more ? 'rotate-180' : ''}`} />
              {!more && dots.length > 0 && <span className="absolute right-0 top-0.5 h-2 w-2 rounded-full bg-brand-orange" aria-label="Hay algo sin ver" />}
            </button>}
          </div>
          {waiting > 0 && !more && (
            <button onClick={onNext} className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-300">
              {waiting === 1 ? 'Tengo otra cosa que contarte' : `Tengo ${waiting} cosas más que contarte`}
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {modules && more && (
        <div className="mt-3 grid animate-section-in grid-cols-2 gap-2 motion-reduce:animate-none sm:grid-cols-3">
          {REX_MODULES.filter((m) => !hide.includes(m.target)).map((m) => {
            const Icon = MODULE_ICON[m.target] ?? Target;
            return (
              <button
                key={m.target}
                onClick={() => {
                  setMore(false);
                  onAction(m.target);
                }}
                className="relative flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-left text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
              >
                <Icon size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                {badges[m.target] && <span className="num text-[11px] font-medium text-neutral-500">{badges[m.target]}</span>}
                {dots.includes(m.target) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-orange ring-2 ring-brand-bg" aria-label="Hay algo sin ver" />}
              </button>
            );
          })}
          {extra}
        </div>
      )}
    </section>
  );
}
