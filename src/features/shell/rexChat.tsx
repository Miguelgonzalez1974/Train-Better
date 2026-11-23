import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';

/**
 * El marco común de las conversaciones guiadas con Rex (imprevistos, revisión semanal, asistente de Objetivos): la cabecera con la mascota, las
 * burbujas de Rex y las tuyas, los puntos de «Rex está escribiendo», los botones de respuesta y el desplazamiento al último mensaje. Cada
 * conversación pone lo suyo (qué pregunta, qué hace cada respuesta); esto solo es cómo «habla» Rex, para que se vea y se comporte igual en las tres.
 */

/** Cuánto «escribe» Rex antes de soltar un mensaje. */
export const REX_TYPING_MS = 600;

export type ChatFrom = 'rex' | 'me';

/** Un mensaje aún sin número (se le da al añadirlo). Se reparte por cada forma posible de la lista, para listas con varios tipos de mensaje. */
export type NewItem<I> = I extends unknown ? Omit<I, 'id'> : never;

/**
 * Lo que comparten las conversaciones: los mensajes, si Rex está escribiendo, su ánimo (la mascota) y el reloj que cancela lo que estuviera en marcha
 * (un reinicio o cerrar la ventana). `makeText` dice cómo es un mensaje de texto en la lista de cada conversación (unas llevan `from`, otras `kind`).
 * `scrollWhen` son los estados propios de la conversación que, al cambiar, llevan el scroll al final (el nodo en curso, la fase…).
 */
export function useRexChat<Item extends { id: number }>({ typingMs = REX_TYPING_MS, makeText, scrollWhen = [] }: { typingMs?: number; makeText: (from: ChatFrom, text: string) => NewItem<Item>; scrollWhen?: unknown[] }) {
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), []);
  const [items, setItems] = useState<Item[]>([]);
  const [typing, setTyping] = useState(false);
  const [mood, setMood] = useState<RexMood>('idle');
  /** Sube con cada reinicio y al cerrar: un mensaje que estaba por llegar con el número anterior se descarta. */
  const tokenRef = useRef(0);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (item: NewItem<Item>) => setItems((prev) => [...prev, { ...item, id: ++idRef.current } as unknown as Item]);
  /** Un mensaje de texto, ya (sin «escribiendo»): lo que dices tú, o un mensaje de Rex que no necesita pausa. */
  const tell = (from: ChatFrom, text: string) => push(makeText(from, text));

  /** Rex «escribe» un mensaje y, al terminar, hace lo siguiente. `before` corre al empezar (quitar los botones de la pregunta anterior). Un reinicio cancela lo que estuviera en marcha. */
  function say(text: string, then: () => void, after: RexMood = 'idle', before?: () => void) {
    const my = tokenRef.current;
    before?.();
    setTyping(true);
    setMood('think');
    window.setTimeout(
      () => {
        if (my !== tokenRef.current) return;
        setTyping(false);
        tell('rex', text);
        setMood(after);
        then();
      },
      reduced ? 0 : typingMs,
    );
  }

  useEffect(
    () => () => {
      tokenRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, typing, reduced, ...scrollWhen]);

  return { items, setItems, push, tell, say, typing, setTyping, mood, setMood, tokenRef, endRef, reduced };
}

/** La cabecera de una conversación: la mascota, «Rex» y una línea que dice para qué es. */
export function RexChatHeader({ mood, title, subtitle }: { mood: RexMood; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <RexMascot size={52} mood={mood} />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>
    </div>
  );
}

/** Donde caen los mensajes (con aviso para lectores de pantalla). `endRef` es el final al que se desplaza. */
export function RexChatLog({ label, endRef, children }: { label: string; endRef: RefObject<HTMLDivElement>; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5" role="log" aria-live="polite" aria-label={label}>
      {children}
      <div ref={endRef} />
    </div>
  );
}

/** Un mensaje: el de Rex a la izquierda, el tuyo a la derecha. */
export function RexBubble({ from, text }: { from: ChatFrom; text: string }) {
  return (
    <div
      className={`max-w-[88%] animate-section-in rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed motion-reduce:animate-none ${
        from === 'rex' ? 'self-start rounded-bl-md bg-white/[0.06] text-neutral-100' : 'self-end rounded-br-md bg-brand-gold/15 text-brand-gold'
      }`}
    >
      {text}
    </div>
  );
}

/** Los tres puntos de «Rex está escribiendo». */
export function RexTyping() {
  return (
    <div className="flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-bl-md bg-white/[0.06] py-3" aria-label="Rex está escribiendo">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

/** Las respuestas posibles de una pregunta, como botones redondeados. */
export function RexChoices<T extends { label: string }>({ options, onPick }: { options: T[]; onPick: (option: T) => void }) {
  return (
    <div className="flex animate-section-in flex-wrap gap-2 motion-reduce:animate-none">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => onPick(o)}
          className="rounded-full border border-brand-border px-3.5 py-2 text-left text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/5"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
