import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Keyboard, Mic, MicOff, MousePointerClick, Send, X, type LucideIcon } from 'lucide-react';
import { createRecognizer, getSpeechCtor, numberWordsToDigits, speechProblem, type Recognizer, type SpeechProblem } from '../../lib/speech';
import { RexMascot } from '../objetivos/RexMascot';
import { RexBar } from './RexBar';
import { ASK_EXAMPLES, type AskAnswer } from './rexAsk';
import { labReturn } from '../../lib/labReturn';
import { appNav } from '../../lib/appNav';
import { useClockActive } from '../../lib/clockState';
import { handoff } from '../../lib/handoff';
import type { TabId } from '../shell/navItems';
import type { RexSuggestion, RexTarget } from './rexDashboard';
import type { RexScreen } from './rexAskRouter';
import { RexTileGrid, type PanelTile } from './RexTileGrid';
import { ExplainRows } from './ExplainRows';
import { TILE_ICONS } from './rexTileIcons';
import { GLOBAL_TILES, groupOfSection, loadTilePrefs, saveTilePrefs, type TileContext, type TilePrefs } from './rexTiles';

/** El nombre de una opción sin id: la etiqueta en minúsculas, sin acentos y con guiones. */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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
  /** Cómo se llama en la biblioteca de teselas (para fijarla, esconderla y puntuarla según el momento). Sin él, sale de la etiqueta. */
  id?: string;
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
  screen = 'dashboard',
  tileContext,
  openWith = null,
  ...bar
}: Omit<ComponentProps<typeof RexBar>, 'defaultMore' | 'showDate' | 'modules'> & {
  /** Abrir el panel con una pregunta ya hecha y su respuesta (tocar un aro del Dashboard): cada `id` nuevo vuelve a abrirlo. */
  openWith?: { id: number; question: string; answer: AskAnswer } | null;
  /** En qué pantalla está Rex: decide qué atajos suben. */
  screen?: RexScreen;
  /** Cómo está el momento (la sesión de hoy, si llegas cansado, si hay una molestia) para colocar los atajos. */
  tileContext?: Partial<Omit<TileContext, 'screen' | 'hour'>>;
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
  // Los atajos que el atleta fija o esconde: se recuerdan en este dispositivo, para todas las pantallas.
  const [tilePrefs, setTilePrefs] = useState<TilePrefs>(() => loadTilePrefs(typeof window !== 'undefined' ? window.localStorage : null));
  const updateTilePrefs = (next: TilePrefs) => {
    setTilePrefs(next);
    saveTilePrefs(typeof window !== 'undefined' ? window.localStorage : null, next);
  };
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  /** La pregunta que se hizo al tocar un aro: sale a la derecha, como un mensaje tuyo, sobre la respuesta. */
  const [topic, setTopic] = useState<string | null>(null);
  // Tocar un aro o un número del Dashboard abre a Rex con esa pregunta ya hecha y su respuesta.
  useEffect(() => {
    if (!openWith) return;
    setOpen(true);
    setAnswer(openWith.answer);
    setTopic(openWith.question);
    setQuestion('');
    setHeard('');
    setVoiceProblem(null);
  }, [openWith?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const clockActive = useClockActive();
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
    // Con el reloj del entreno abierto o en marcha Rex se queda en su botón: no compite con él.
    if (!talks || open || blocked || clockActive) {
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
  }, [hinting, dock !== null, speak, quiet, suppressed, open, blocked, clockActive, key]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // La biblioteca de teselas: las opciones de esta pantalla (con su id, si lo tienen) más las globales, que son frases que la caja de Rex entiende.
  // Si una opción de la pantalla comparte id con una global, manda la de la pantalla (sabe hacerlo ahí mismo).
  const labTiles: PanelTile[] = (lab ?? []).flatMap((section) =>
    section.items.map((item) => ({
      id: item.id ?? slug(item.label),
      label: item.label,
      hint: item.hint,
      Icon: item.icon,
      group: groupOfSection(section.title),
      run: () => {
        if (item.ask) send(item.ask);
        else if (item.onClick) launch(item.onClick);
      },
    })),
  );
  const globalTiles: PanelTile[] = ask
    ? GLOBAL_TILES.filter((g) => !labTiles.some((l) => l.id === g.id)).map((g) => ({
        id: g.id,
        label: g.label,
        hint: g.hint,
        Icon: TILE_ICONS[g.iconKey] ?? FlaskConical,
        group: g.group,
        run: () => {
          if (g.prefill) {
            setQuestion(g.prefill);
            inputRef.current?.focus();
          } else if (g.ask) send(g.ask);
        },
      }))
    : [];
  const panelTiles = [...labTiles, ...globalTiles];

  const attention = cornerNeedsAttention(suggestion, dots);
  const openPanel = () => {
    if (!hinting) spoken.add(key);
    setAnswer(null);
    setTopic(null);
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
    setTopic(null);
    setQuestion('');
  };

  // --- La voz: dictar en lugar de escribir. La frase dicha pasa por la misma caja de Rex que la escrita (con los números en cifras). ---
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  /** Lo que Rex entendió de lo último que dijiste: se enseña sobre su respuesta, para ver si te oyó bien. */
  const [heard, setHeard] = useState('');
  const [voiceProblem, setVoiceProblem] = useState<SpeechProblem | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const voiceState = useRef({ final: false, error: false, cancelled: false });
  const speechCtor = getSpeechCtor();
  const cancelVoice = () => {
    voiceState.current.cancelled = true;
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
    setInterim('');
  };
  const startVoice = () => {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      setVoiceProblem(speechProblem('unsupported'));
      return;
    }
    recRef.current?.abort();
    voiceState.current = { final: false, error: false, cancelled: false };
    setAnswer(null);
    setHeard('');
    setInterim('');
    setQuestion('');
    setVoiceProblem(null);
    const rec = createRecognizer(Ctor, {
      onStart: () => setListening(true),
      onInterim: (text) => setInterim(numberWordsToDigits(text)),
      onFinal: (text) => {
        if (voiceState.current.cancelled) return;
        voiceState.current.final = true;
        const said = numberWordsToDigits(text);
        setHeard(said);
        setInterim('');
        send(said);
      },
      onError: (code) => {
        if (code === 'aborted' || voiceState.current.cancelled) return;
        voiceState.current.error = true;
        setVoiceProblem(speechProblem(code));
      },
      onEnd: () => {
        setListening(false);
        setInterim('');
        const s = voiceState.current;
        if (!s.final && !s.error && !s.cancelled) setVoiceProblem(speechProblem('no-speech'));
      },
    });
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setVoiceProblem(speechProblem('audio-capture'));
    }
  };
  // Al cerrar el panel o irse de la pantalla, se deja de escuchar.
  useEffect(() => {
    if (!open) cancelVoice();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => recRef.current?.abort(), []);

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
                        onClick={() => (bubbleAction.ask && ask ? (setOpen(true), send(bubbleAction.ask)) : bar.onAction(bubbleAction.target))}
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
                    if (bubbleAction.ask && ask) {
                      setOpen(true);
                      send(bubbleAction.ask);
                    } else bar.onAction(bubbleAction.target);
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
                {/* La voz: un botón grande para hablar; mientras escucha, enseña lo que va entendiendo; si falla, lo dice y deja reintentar o escribir. */}
                {speechCtor && !listening && (
                  <div className="mb-3 flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={startVoice}
                      data-testid="rex-mic"
                      aria-label="Hablar con Rex"
                      className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-orange text-black shadow-lg shadow-brand-orange/20 ring-4 ring-brand-orange/15 transition-transform duration-200 hover:bg-brand-orange-dark active:scale-95"
                    >
                      <Mic size={40} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                    <span className="text-base font-semibold text-white">Toca y habla</span>
                  </div>
                )}
                {listening && (
                  <div className="mb-2 rounded-2xl border border-brand-orange/40 bg-brand-surface px-4 py-4 text-center" data-testid="rex-listening" aria-live="polite">
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
                      <span className="absolute inset-0 animate-ping rounded-full bg-brand-orange/30 motion-reduce:animate-none" aria-hidden="true" />
                      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-orange text-black">
                        <Mic size={30} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-3 min-h-[2rem] text-xl font-semibold leading-snug text-white">{interim ? `«${interim}»` : <span className="text-neutral-400">Te escucho…</span>}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => recRef.current?.stop()} className="h-12 flex-1 rounded-xl bg-brand-orange text-base font-semibold text-black transition-colors hover:bg-brand-orange-dark">
                        Ya está
                      </button>
                      <button type="button" onClick={cancelVoice} className="h-12 flex-1 rounded-xl border border-brand-border text-base font-semibold text-neutral-200 transition-colors hover:bg-white/5">
                        Cancelar
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-500">Se para solo cuando dejas de hablar</p>
                  </div>
                )}
                {voiceProblem && !listening && (
                  <div className="mb-2 rounded-2xl border border-white/15 bg-brand-surface px-4 py-3 text-center" data-testid="rex-voice-problem" role="alert">
                    <MicOff size={26} strokeWidth={2} aria-hidden="true" className="mx-auto text-brand-gold" />
                    <p className="mt-1 text-base font-semibold text-white">{voiceProblem.title}</p>
                    <p className="mt-0.5 text-[13px] text-neutral-400">{voiceProblem.detail}</p>
                    <div className="mt-3 flex gap-2">
                      {voiceProblem.canRetry && speechCtor && (
                        <button type="button" onClick={startVoice} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-orange text-base font-semibold text-black transition-colors hover:bg-brand-orange-dark">
                          <Mic size={18} aria-hidden="true" />
                          Otra vez
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceProblem(null);
                          inputRef.current?.focus();
                        }}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-brand-border text-base font-semibold text-neutral-200 transition-colors hover:bg-white/5"
                      >
                        <Keyboard size={18} aria-hidden="true" />
                        Escribir
                      </button>
                    </div>
                  </div>
                )}
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
                {answer && topic && (
                  <div className="mb-1.5 flex justify-end" data-testid="rex-topic">
                    <p className="max-w-[88%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2 text-[13px] text-neutral-100">{topic}</p>
                  </div>
                )}
                {answer && heard && (
                  <p className="mb-1 px-1 text-xs text-neutral-500" data-testid="rex-heard">
                    Has dicho: «{heard}»
                  </p>
                )}
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
                      {answer.rows && answer.rows.length > 0 && <ExplainRows rows={answer.rows} />}
                      {answer.foot && <p className="mt-2 text-[11px] leading-snug text-neutral-500">{answer.foot}</p>}
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
              // Los módulos de «Más» van recogidos: los atajos de debajo son lo primero a mano; «Más» sigue a un toque.
              defaultMore={false}
              // El globo ya la había dicho (o el panel se abre a pedido): sale entera, sin volver a escribirse.
              typedAlready
              onAction={(target, askText) => {
                // Un botón que es una frase (el seguimiento de una molestia, acortar a tus minutos): se le dice a Rex ahí mismo.
                if (askText && ask) send(askText);
                else launch(() => bar.onAction(target));
              }}
            />

            {/* Los atajos como teselas: las opciones de esta pantalla y las frases que Rex entiende desde cualquiera, colocadas según el momento. */}
            <RexTileGrid tiles={panelTiles} ctx={{ screen, hour: new Date().getHours(), ...tileContext }} prefs={tilePrefs} onPrefs={updateTilePrefs} />
          </section>
        </div>
      )}
    </>
  );
}
