import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, MousePointerClick, Send, X, type LucideIcon } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import { RexBar } from './RexBar';
import { ASK_EXAMPLES, type AskAnswer } from './rexAsk';
import { labReturn } from '../../lib/labReturn';
import { appNav } from '../../lib/appNav';
import { handoff } from '../../lib/handoff';
import type { TabId } from '../shell/navItems';
import type { RexSuggestion, RexTarget } from './rexDashboard';

/** Cuánto se queda el globo de la esquina antes de recogerse solo (la pista de los aros no se recoge: se queda hasta que se toca un aro). */
const BUBBLE_MS = 9000;

const LEAD_COLOR: Record<NonNullable<RexSuggestion['tone']>, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  bad: 'rgb(var(--c-state-low))',
  info: 'rgb(var(--c-state-cool))',
  gold: 'rgb(var(--c-brand-gold))',
};

const FOLDED_KEY = 'tb-rex-dock-folded';

/** ¿Tiene el atleta plegado el globo fijo de Rex? Se recuerda en este dispositivo, para todas las pantallas. */
function readFolded(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(FOLDED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFolded(folded: boolean): void {
  try {
    window.localStorage.setItem(FOLDED_KEY, folded ? '1' : '0');
  } catch {
    /* sin almacenamiento: se vuelve a desplegar al abrir */
  }
}

/** Una opción de RexLab de la pantalla: abre algo (onClick) o hace una pregunta ahí mismo (sk). */
export interface LabItem {
  label: string;
  hint?: string;
  icon: LucideIcon;
  onClick?: () => void;
  ask?: string;
}

/** Un grupo de opciones de RexLab con su título. */
export interface LabSection {
  title: string;
  items: LabItem[];
}

const NAV_TARGET: Partial<Record<RexTarget, TabId>> = { 'ir-dashboard': 'dashboard', 'ir-planificacion': 'planificacion', 'ir-nutricion': 'nutricion', 'ir-objetivos': 'objetivos' };

/** Lo que Rex ya ha dicho en un globo durante esta visita a la app: cambiar de pestaña no lo repite. */
const spoken = new Set<string>();

/** ¿Hay algo que merezca un punto en el botón? Lo urgente (check-in, revisión, cierre…) o un módulo con aviso. */
export function cornerNeedsAttention(suggestion: RexSuggestion, dots: RexTarget[]): boolean {
  return dots.length > 0 || (suggestion.id !== 'quiet' && suggestion.priority >= 80);
}

/** ¿Hay una ventana encima (la tarjeta de la mañana, un modal)? El globo espera a que se cierre para no gastarse sin que lo veas. */
function useBlockingOverlay(): boolean {
  const [blocked, setBlocked] = useState(() => typeof document !== 'undefined' && Boolean(document.querySelector('[data-blocking],[aria-modal="true"]')));
  useEffect(() => {
    const check = () => setBlocked(Boolean(document.querySelector('[data-blocking],[aria-modal="true"]')));
    check();
    const timer = window.setInterval(check, 400);
    return () => window.clearInterval(timer);
  }, []);
  return blocked;
}

/** ¿Se está escribiendo en un campo? Con el teclado abierto el botón estorba, así que se esconde. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') || t.isContentEditable);
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

/**
 * Rex en la esquina, siempre a mano: un botón flotante abajo a la derecha que, al abrir la pantalla, dice en un globo lo más
 * importante (el consejo del día, el check-in pendiente…) con su botón de acción, y se recoge solo. Al tocarlo se abre un panel desde
 * abajo con su frase y atajos, las otras cosas que tiene que contar y, donde hay, los módulos de «Más».
 * Qué decir y qué recordar viene de `rexDashboard.ts`; esto solo lo dibuja.
 */
export function RexCorner({
  speak,
  hint,
  modules = true,
  showDate = true,
  raised = false,
  ask,
  lab,
  examples,
  hints,
  dock = null,
  ...bar
}: Omit<ComponentProps<typeof RexBar>, 'defaultMore' | 'showDate' | 'modules'> & {
  /** El globo de la esquina puede hablar solo (hoy sí; mirando un día pasado, no). */
  speak: boolean;
  /** Una pista que va antes que cualquier otra cosa (p. ej. «Toca un aro…») y se queda hasta que ya no hace falta; null si no hay. */
  hint?: { lead: string; text: string } | null;
  /** Enseñar los módulos de «Más» en el panel (solo el Dashboard los abre). */
  modules?: boolean;
  showDate?: boolean;
  /** Más arriba de lo normal, para no tapar el reloj de entreno flotante (Planificación). */
  raised?: boolean;
  /** La caja «Pregúntale a Rex…»: recibe lo escrito y devuelve la respuesta, o 'close' si ya hizo lo pedido (abrir un módulo, ir a Nutrición). */
  ask?: (text: string) => AskAnswer | 'close';
  /** Las opciones propias de esta pantalla, bajo la frase de Rex (Planificación, Nutrición, Objetivos…). */
  lab?: LabSection[];
  /** Los atajos de la caja de esta pantalla (por defecto, los del Dashboard). */
  examples?: readonly string[];
  /** Frases que Rex entiende y que no tienen botón, para enseñarlas rotando en el hueco de la caja («Prueba: «tengo 30 minutos»»). */
  hints?: readonly string[];
  /**
   * El globo fijo de la pantalla: Rex dice siempre aquí su frase del momento (estado del día y qué hacer), con una línea de cifras (`stats`),
   * una pista opcional (`tip`), el botón de su primera acción y el botón «RexLab». Se pliega con la flechita a una sola línea, pero no se
   * quita. null = sin globo fijo (solo el globo que sale un rato).
   */
  dock?: { stats?: string | null; tip?: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // La pista del hueco de la caja cambia cada 4 s mientras el panel está abierto y no has escrito nada (se salta con «reducir movimiento»).
  const [hintIdx, setHintIdx] = useState(0);
  useEffect(() => {
    if (!open || !hints || hints.length < 2 || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setHintIdx((i) => (i + 1) % hints.length), 4000);
    return () => window.clearInterval(t);
  }, [open, hints]);
  const [bubble, setBubble] = useState(false);
  const [folded, setFolded] = useState(() => readFolded());
  const toggleFold = () => {
    setFolded((v) => {
      writeFolded(!v);
      return !v;
    });
  };
  const blocked = useBlockingOverlay();
  const typingInField = useTyping();
  // Volver al lab: lo que se abre desde el panel (una ventana) devuelve al panel al cerrarse; si te vas a otra pestaña, la app ofrece «Volver al lab».
  // Solo en el Dashboard (`modules`): en Planificación el panel no vuelve solo.
  const returns = modules;
  const [waiting, setWaiting] = useState(false);
  const fromLab = useRef(false);
  const sawOverlay = useRef(false);
  useEffect(() => {
    if (!waiting) return;
    if (blocked) sawOverlay.current = true;
    else if (sawOverlay.current) {
      fromLab.current = false;
      setWaiting(false);
      setOpen(true);
    }
  }, [waiting, blocked]);
  useEffect(() => {
    if (!waiting) return;
    // Si en un momento no se ha abierto ninguna ventana, no había nada a lo que volver (una pestaña interna, un cambio de día…).
    const timer = window.setTimeout(() => {
      if (!sawOverlay.current) {
        fromLab.current = false;
        setWaiting(false);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  // Al montar: si se pidió volver al lab desde otra pestaña, se abre. Al desmontar con algo abierto desde el lab, se avisa para ofrecer la vuelta.
  useEffect(() => {
    if (!returns) return;
    const reopen = labReturn.takeReopen();
    labReturn.clear(); // estoy en el Dashboard: ya no hay nada a lo que volver desde otra pestaña
    if (reopen) setOpen(true);
    return () => {
      if (fromLab.current) labReturn.markPending();
    };
  }, [returns]);
  /** Lanza algo desde el panel: el panel se cierra y, si abre una ventana, vuelve al cerrarla. */
  const leave = () => {
    setOpen(false);
    if (returns) {
      fromLab.current = true;
      sawOverlay.current = false;
      setWaiting(true);
    }
  };
  const launch = (run: () => void) => {
    leave();
    run();
  };
  const { suggestion, dots } = bar;
  const quiet = suggestion.id === 'quiet';
  // Si el globo ya dijo la pista, la sugerencia que había entonces no vuelve a salir en esta visita (sería ruido tras tocar un aro).
  const hintedOver = useRef<string | null>(null);
  const hinting = Boolean(hint);
  if (hinting) hintedOver.current = suggestion.id;
  const suppressed = !hinting && hintedOver.current === suggestion.id;
  const key = `${suggestion.id}|${suggestion.text}`;

  // El globo sale cuando Rex tiene algo que decir y se recoge solo; no sale con el panel abierto, con una ventana encima, con la frase
  // tranquila ni si ya lo dijo en esta visita. La pista de los aros no se recoge sola.
  useEffect(() => {
    const talks = Boolean(dock) || hinting || (speak && !quiet && !suppressed && !spoken.has(key));
    if (!talks || open || blocked) {
      setBubble(false);
      return;
    }
    setBubble(true);
    if (hinting || dock) return;
    const timer = window.setTimeout(() => {
      spoken.add(key);
      setBubble(false);
    }, BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [hinting, dock !== null, speak, quiet, suppressed, open, blocked, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const said = hint ?? { lead: suggestion.lead && suggestion.text.startsWith(suggestion.lead) ? suggestion.lead : '', text: '' };
  const leadLen = said.lead.length;
  const bubbleText = hint ? hint.text : suggestion.text.slice(leadLen);
  const bubbleAction = hint ? null : (suggestion.actions[0] ?? null);

  /** El atleta cierra RexLab (X, fuera o Escape). Irse a abrir un módulo es `leave`, que vuelve al cerrarlo. */
  const dismiss = () => setOpen(false);

  // Escape cierra el panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const attention = cornerNeedsAttention(suggestion, dots);
  const openPanel = () => {
    if (!hinting) spoken.add(key);
    setAnswer(null);
    setQuestion('');
    setOpen(true);
  };
  const send = (text: string) => {
    const value = text.trim();
    if (!value || !ask) return;
    const result = ask(value);
    if (result === 'close') {
      // Ya hizo lo pedido (abrió un módulo o llevó a otra pestaña): el panel se va y vuelve al cerrarse lo abierto.
      leave();
      return;
    }
    setAnswer(result);
    setQuestion('');
  };

  return (
    <>
      {!open && !typingInField && (
        <div
          className={`pointer-events-none fixed z-30 flex items-end gap-2 md:right-6 ${
            dock ? 'left-3 right-3 flex-row justify-end md:left-auto md:w-[26rem]' : 'right-3 flex-col'
          } ${raised ? 'bottom-[calc(12.5rem+env(safe-area-inset-bottom))] md:bottom-[8.5rem]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6'}`}
        >
          {bubble && dock && (
            <div
              role="region"
              aria-label="Rex dice"
              className="pointer-events-auto relative min-w-0 flex-1 animate-section-in rounded-2xl rounded-br-md border border-white/20 bg-brand-surface py-2.5 pl-3.5 pr-10 text-left shadow-xl shadow-black/40 motion-reduce:animate-none"
            >
              <button
                onClick={toggleFold}
                aria-label={folded ? 'Desplegar a Rex' : 'Plegar a Rex'}
                aria-expanded={!folded}
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </button>
              {folded ? (
                <button onClick={toggleFold} aria-label="Desplegar a Rex" className="block w-full text-left">
                  <p className="truncate text-[13px] leading-snug text-neutral-100">
                    {suggestion.lead && suggestion.text.startsWith(suggestion.lead) && (
                      <strong className="font-bold" style={{ color: LEAD_COLOR[suggestion.tone ?? 'info'] }}>
                        {suggestion.lead}
                      </strong>
                    )}
                    {suggestion.lead && suggestion.text.startsWith(suggestion.lead) ? suggestion.text.slice(suggestion.lead.length) : suggestion.text}
                  </p>
                </button>
              ) : (
                <>
                  <p className="text-[13px] leading-snug text-neutral-100">
                    {suggestion.lead && suggestion.text.startsWith(suggestion.lead) && (
                      <strong className="font-bold" style={{ color: LEAD_COLOR[suggestion.tone ?? 'info'] }}>
                        {suggestion.lead}
                      </strong>
                    )}
                    {suggestion.lead && suggestion.text.startsWith(suggestion.lead) ? suggestion.text.slice(suggestion.lead.length) : suggestion.text}
                  </p>
                  {dock.stats && <p className="num mt-1 text-xs font-medium text-neutral-400">{dock.stats}</p>}
                  {dock.tip && (
                    <p className="mt-1.5 flex items-start gap-1.5 border-t border-white/10 pt-1.5 text-[11.5px] leading-snug text-neutral-400">
                      <MousePointerClick size={13} aria-hidden="true" className="mt-px shrink-0 text-good" />
                      <span>{dock.tip}</span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {bubbleAction && (
                      <button
                        onClick={() => bar.onAction(bubbleAction.target)}
                        className="rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark"
                      >
                        {bubbleAction.label}
                      </button>
                    )}
                    <button
                      onClick={openPanel}
                      className="flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-100 transition-colors hover:border-white/30 hover:bg-white/5"
                    >
                      <FlaskConical size={14} aria-hidden="true" />
                      RexLab
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {bubble && !dock && (
            <div
              className="pointer-events-auto relative max-w-[min(18rem,calc(100vw-7rem))] animate-section-in rounded-2xl rounded-br-md border border-white/20 bg-brand-surface py-2.5 pl-3.5 pr-3.5 text-left shadow-xl shadow-black/40 motion-reduce:animate-none"
            >
              <button onClick={openPanel} aria-label="Rex tiene algo que decirte: abrir" className="block w-full text-left">
                <p className="line-clamp-4 text-[13px] leading-snug text-neutral-100">
                  {leadLen > 0 && (
                    <strong className="font-bold" style={{ color: hint ? LEAD_COLOR.good : LEAD_COLOR[suggestion.tone ?? 'info'] }}>
                      {said.lead}
                    </strong>
                  )}
                  {bubbleText}
                </p>
              </button>
              {bubbleAction && (
                <button
                  onClick={() => {
                    spoken.add(key);
                    setBubble(false);
                    bar.onAction(bubbleAction.target);
                  }}
                  className="mt-2 rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark"
                >
                  {bubbleAction.label}
                </button>
              )}
            </div>
          )}
          <button
            onClick={openPanel}
            aria-label="Hablar con Rex (RexLab)"
            aria-haspopup="dialog"
            className="pointer-events-auto relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-white/20 bg-brand-surface shadow-xl shadow-black/40 transition-transform duration-200 active:scale-95"
          >
            <RexMascot size={56} mood={bubble ? suggestion.mood : 'idle'} />
            {attention && <span className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-brand-orange ring-2 ring-brand-bg" aria-label="Hay algo sin ver" />}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[55]">
          <button aria-label="Cerrar a Rex" onClick={dismiss} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
          <section
            role="dialog"
            aria-label="Rex"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-xl animate-section-in overflow-y-auto rounded-t-3xl border border-b-0 border-white/15 bg-brand-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl motion-reduce:animate-none md:bottom-6 md:right-6 md:left-auto md:mx-0 md:rounded-3xl md:border-b"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-neutral-400">
                <FlaskConical size={14} aria-hidden="true" />
                RexLab
              </span>
              <button onClick={dismiss} aria-label="Cerrar a Rex" className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {/* Pregúntale a Rex: escribes como lo dirías y Rex lo lee con reglas (peso, comida, qué toca, cómo estás, módulos). */}
            {ask && (
              <div className="mb-3">
                <form
                  className="mb-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(question);
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={hints && hints.length > 0 ? `Prueba: «${hints[hintIdx % hints.length]}»` : 'Pregúntale a Rex…'}
                    aria-label="Pregúntale a Rex"
                    autoComplete="off"
                    enterKeyHint="send"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-surface px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={question.trim() === ''}
                    aria-label="Enviar a Rex"
                    className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={17} strokeWidth={2.25} />
                  </button>
                </form>
                <div className={`mb-2 flex flex-wrap gap-1.5 ${(examples ?? ASK_EXAMPLES).length === 0 ? 'hidden' : ''}`}>
                  {(examples ?? ASK_EXAMPLES).map((example) => (
                    <button
                      key={example}
                      onClick={() => {
                        if (example.endsWith('…')) {
                          setQuestion(example.slice(0, -1) + ' ');
                          inputRef.current?.focus();
                        } else send(example);
                      }}
                      className="rounded-full border border-brand-border px-3 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:border-white/30 hover:text-white"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                {answer && (
                  <div className="mb-2 flex items-start gap-3 rounded-2xl border border-white/15 bg-brand-surface px-3.5 py-3" aria-live="polite">
                    <RexMascot size={32} mood="think" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-neutral-100">
                        <strong className="font-bold" style={{ color: LEAD_COLOR[answer.tone] }}>
                          {answer.lead}
                        </strong>{' '}
                        {answer.text}
                      </p>
                      {answer.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {answer.actions.map((a, i) => (
                            <button
                              key={a.label}
                              onClick={() => {
                                const tab = NAV_TARGET[a.target];
                                if (a.ask) send(a.ask);
                                else if (a.target === 'ir-marcas') {
                                  // «Mis marcas» vive en el Dashboard: se va allí y se abre sola.
                                  handoff.put('analisis-tab', 'marcas');
                                  setOpen(false);
                                  appNav.goTo('dashboard');
                                } else if (tab) {
                                  setOpen(false);
                                  appNav.goTo(tab);
                                } else launch(() => bar.onAction(a.target));
                              }}
                              className={
                                i === 0
                                  ? 'rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark'
                                  : 'rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-white/30 hover:bg-white/5'
                              }
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <RexBar
              {...bar}
              showDate={showDate}
              modules={modules}
              defaultMore={modules}
              // El globo ya la había dicho (o el panel se abre a pedido): sale entera, sin volver a escribirse.
              typedAlready
              onAction={(target) => launch(() => bar.onAction(target))}
            />

            {lab?.map((section) => (
              <div key={section.title} className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{section.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        onClick={() => {
                          if (item.ask) send(item.ask);
                          else if (item.onClick) launch(item.onClick);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-left text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
                      >
                        <Icon size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                        <span className="min-w-0">
                          <span className="block leading-snug">{item.label}</span>
                          {item.hint && <span className="block text-[11px] font-normal text-neutral-500">{item.hint}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
