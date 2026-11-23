import { useEffect, useMemo, useRef, useState } from 'react';
import { RexBubble, RexChatHeader, RexChatLog, RexChoices, RexTyping, useRexChat } from '../shell/rexChat';
import { applySupport, getSupportNode, summarize, type SupportAction, type SupportEffect, type SupportOption, type SupportState } from './rexSupportFlow';
import type { AthleteProfile } from '../../data/athlete/types';

interface Msg {
  id: number;
  from: 'rex' | 'me';
  text: string;
}

/**
 * Rex para los imprevistos (me duele algo, hoy no estoy para el plan, voy a faltar unos días). Pregunta poco, enseña qué haría y
 * solo lo aplica si el atleta dice que sí. Lo que hace cada respuesta vive en `rexSupport.ts`; esto solo lo pinta y entrega el
 * resultado a `onApply`, que lo guarda como ya lo hace el resto de la pantalla.
 */
export function RexSupport({
  profile,
  todayIso,
  todayDone,
  canSwapWod = false,
  canChangeType = false,
  canHarder = false,
  canEdit = false,
  moreOptions = false,
  noticeCount = 0,
  canDelete = false,
  startNode,
  onApply,
  onAct,
  onClose,
}: {
  profile: AthleteProfile;
  todayIso: string;
  todayDone: boolean;
  /** Se puede cambiar el WOD de hoy por otro. */
  canSwapWod?: boolean;
  /** Se puede cambiar el tipo de la sesión de hoy. */
  canChangeType?: boolean;
  /** Se puede subir la dureza de hoy. */
  canHarder?: boolean;
  /** Se puede editar la sesión de hoy. */
  canEdit?: boolean;
  /** Mostrar «Más opciones» (librería de complejos, avisos, deshacer o borrar). */
  moreOptions?: boolean;
  /** Avisos del coach pendientes. */
  noticeCount?: number;
  /** Se puede borrar la sesión de hoy. */
  canDelete?: boolean;
  /** Por dónde empieza la conversación (la molestia, «hoy no», faltar unos días) cuando RexLab ya sabe qué ha pasado; por defecto, el principio. */
  startNode?: string;
  onApply: (effect: SupportEffect) => void;
  /** Un cambio directo de la sesión (otro WOD, cambiar el tipo, más dura): la pantalla lo hace y esta conversación se cierra. */
  onAct?: (action: SupportAction) => void;
  onClose: () => void;
}) {
  const ctx = useMemo(() => ({ profile, todayIso, todayDone, canSwapWod, canChangeType, canHarder, canEdit, moreOptions, noticeCount, canDelete }), [profile, todayIso, todayDone, canSwapWod, canChangeType, canHarder, canEdit, moreOptions, noticeCount, canDelete]);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'chat' | 'confirm' | 'done'>('chat');
  const [state, setState] = useState<SupportState>({});
  const chat = useRexChat<Msg>({ makeText: (from, text) => ({ from, text }), scrollWhen: [nodeId, phase] });
  const { items: msgs, typing, mood, tokenRef, endRef } = chat;

  const stateRef = useRef<SupportState>({});

  const push = chat.tell;
  const setBoth = (next: SupportState) => {
    stateRef.current = next;
    setState(next);
  };

  /** Rex «escribe» y, al terminar, hace lo siguiente; al empezar se quitan los botones de la pregunta anterior. */
  const say = (text: string, then: () => void, after?: Parameters<typeof chat.say>[2]) => chat.say(text, then, after, () => setNodeId(null));

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
    if (option.act && onAct) {
      onAct(option.act);
      onClose();
      return;
    }
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
    ask(startNode ?? 'start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const node = nodeId ? getSupportNode(nodeId, ctx) : null;
  const summary = phase === 'confirm' ? summarize(state, ctx) : null;

  return (
    <div className="flex flex-col gap-3">
      <RexChatHeader mood={mood} title="Rex" subtitle="Te cuento qué haría y no toco nada hasta que digas que sí." />

      <RexChatLog label="Conversación con Rex" endRef={endRef}>
        {msgs.map((m) => (
          <RexBubble key={m.id} from={m.from} text={m.text} />
        ))}

        {typing && <RexTyping />}

        {node && !typing && <RexChoices options={node.options} onPick={pick} />}

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
      </RexChatLog>
    </div>
  );
}
