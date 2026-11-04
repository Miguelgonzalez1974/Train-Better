import { useEffect, useMemo, useRef, useState } from 'react';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';
import { applySupport, getSupportNode, summarize, type SupportEffect, type SupportOption, type SupportState } from './rexSupportFlow';
import type { AthleteProfile } from '../../data/athlete/types';

interface Msg {
  id: number;
  from: 'rex' | 'me';
  text: string;
}

const TYPING_MS = 600;

/**
 * Rex para los imprevistos (me duele algo, hoy no estoy para el plan, voy a faltar unos días). Pregunta poco, enseña qué haría y
 * solo lo aplica si el atleta dice que sí. Lo que hace cada respuesta vive en `rexSupport.ts`; esto solo lo pinta y entrega el
 * resultado a `onApply`, que lo guarda como ya lo hace el resto de la pantalla.
 */
export function RexSupport({ profile, todayIso, todayDone, onApply, onClose }: { profile: AthleteProfile; todayIso: string; todayDone: boolean; onApply: (effect: SupportEffect) => void; onClose: () => void }) {
  const ctx = useMemo(() => ({ profile, todayIso, todayDone }), [profile, todayIso, todayDone]);
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), []);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [mood, setMood] = useState<RexMood>('idle');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'chat' | 'confirm' | 'done'>('chat');
  const [state, setState] = useState<SupportState>({});

  const stateRef = useRef<SupportState>({});
  const tokenRef = useRef(0);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (from: Msg['from'], text: string) => setMsgs((prev) => [...prev, { id: ++idRef.current, from, text }]);
  const setBoth = (next: SupportState) => {
    stateRef.current = next;
    setState(next);
  };

  function say(text: string, then: () => void, after: RexMood = 'idle') {
    const my = tokenRef.current;
    setNodeId(null);
    setTyping(true);
    setMood('think');
    window.setTimeout(
      () => {
        if (my !== tokenRef.current) return;
        setTyping(false);
        push('rex', text);
        setMood(after);
        then();
      },
      reduced ? 0 : TYPING_MS,
    );
  }

  function ask(id: string) {
    say(getSupportNode(id, ctx).text, () => setNodeId(id));
  }

  function restart() {
    tokenRef.current += 1;
    setBoth({});
    setPhase('chat');
    ask('start');
  }

  function pick(option: SupportOption) {
    setBoth({ ...stateRef.current, ...option.set });
    push('me', option.label);
    if (option.next === 'summary') say('Esto haría:', () => setPhase('confirm'));
    else ask(option.next);
  }

  function confirm() {
    const summary = summarize(stateRef.current, ctx);
    push('me', 'Hacerlo');
    onApply(applySupport(stateRef.current, ctx));
    setPhase('done');
    say(summary.done, () => undefined, 'happy');
  }

  function change() {
    push('me', 'Cambiar algo');
    setBoth({});
    setPhase('chat');
    ask('start');
  }

  useEffect(() => {
    ask('start');
    return () => {
      tokenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [msgs.length, typing, nodeId, phase, reduced]);

  const node = nodeId ? getSupportNode(nodeId, ctx) : null;
  const summary = phase === 'confirm' ? summarize(state, ctx) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <RexMascot size={52} mood={mood} />
        <div>
          <p className="text-sm font-semibold text-white">Rex</p>
          <p className="text-xs text-neutral-400">Te cuento qué haría y no toco nada hasta que digas que sí.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5" role="log" aria-live="polite" aria-label="Conversación con Rex">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-[88%] animate-section-in rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed motion-reduce:animate-none ${
              m.from === 'rex' ? 'self-start rounded-bl-md bg-white/[0.06] text-neutral-100' : 'self-end rounded-br-md bg-brand-gold/15 text-brand-gold'
            }`}
          >
            {m.text}
          </div>
        ))}

        {typing && (
          <div className="flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-bl-md bg-white/[0.06] py-3" aria-label="Rex está escribiendo">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}

        {node && !typing && (
          <div className="flex animate-section-in flex-wrap gap-2 motion-reduce:animate-none">
            {node.options.map((o) => (
              <button
                key={o.label}
                onClick={() => pick(o)}
                className="rounded-full border border-brand-border px-3.5 py-2 text-left text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/5"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {summary && (
          <div className="flex animate-section-in flex-col gap-1 rounded-2xl border border-brand-gold/30 bg-white/[0.04] p-4 motion-reduce:animate-none">
            <p className="text-sm font-semibold text-white">{summary.title}</p>
            <p className="text-xs text-neutral-400">{summary.sub}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-neutral-400">
              {summary.fx.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={confirm} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
                Hacerlo
              </button>
              <button onClick={change} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5">
                Cambiar algo
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && !typing && (
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
              Cerrar
            </button>
            <button onClick={restart} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5">
              Algo más
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
