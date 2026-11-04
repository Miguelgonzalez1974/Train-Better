import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import type { AthleteProfile } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { RexMascot, type RexMood } from './RexMascot';
import { shortDate } from './openItems';
import { applyPlan, commitItems, getNode, reviewNotes, type CommitKind, type FlowState, type PlanItem, type RexOption } from './rexFlow';

interface Msg {
  id: number;
  from: 'rex' | 'me';
  text: string;
}

const TYPING_MS = 650;

/**
 * Rex, el asistente guiado: pregunta con botones y va montando "tu plan" (objetivos, macrociclos, programas de fuerza, rampas o una
 * temporada entera). Nada se guarda hasta la revisión final; al crear, lo entrega entero a `onCreate`. Las preguntas y lo que crea
 * salen de `rexFlow.ts`, que es lo que se prueba; esto solo las pinta, con la mascota reaccionando a lo que pasa.
 */
export function RexAssistant({ profile, onCreate, onClose }: { profile: AthleteProfile; onCreate: (next: AthleteProfile) => void; onClose: () => void }) {
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const ctx = useMemo(() => ({ profile, todayIso }), [profile, todayIso]);
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), []);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [mood, setMood] = useState<RexMood>('idle');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'chat' | 'review' | 'done'>('chat');
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [depth, setDepth] = useState(0);
  const [dateValue, setDateValue] = useState('');
  const [dateError, setDateError] = useState('');

  const stateRef = useRef<FlowState>({});
  const planRef = useRef<PlanItem[]>([]);
  const tokenRef = useRef(0);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const setPlanBoth = (next: PlanItem[]) => {
    planRef.current = next;
    setPlan(next);
  };
  const push = (from: Msg['from'], text: string) => setMsgs((prev) => [...prev, { id: ++idRef.current, from, text }]);

  /** Rex "escribe" un mensaje y, al terminar, hace lo siguiente. Un reinicio cancela lo que estuviera en marcha. */
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
    const node = getNode(id, stateRef.current, ctx, planRef.current);
    if (id === 'start' || id === 'more') setDepth(0);
    else setDepth((d) => d + 1);
    setDateValue('');
    setDateError('');
    say(node.text, () => setNodeId(id));
  }

  function startOver() {
    tokenRef.current += 1;
    stateRef.current = {};
    setPlanBoth([]);
    setMsgs([]);
    setDepth(0);
    setPhase('chat');
    setTyping(false);
    ask('start');
  }

  function commit(kind: CommitKind) {
    const made = commitItems(kind, stateRef.current, ctx);
    setPlanBoth([...planRef.current, ...made]);
    say(made.length > 1 ? `${made.length} cosas añadidas a tu plan.` : `Añadido a tu plan: ${made[0].title}.`, () => ask('more'), 'happy');
  }

  function review() {
    if (planRef.current.length === 0) {
      say('Tu plan está vacío. ¿Qué montamos?', () => ask('start'));
      return;
    }
    say('Esto es lo que dejo montado. Toca cada cosa para ver qué hace:', () => setPhase('review'), 'happy');
  }

  function pick(option: RexOption) {
    if (option.reset) stateRef.current = {};
    stateRef.current = { ...stateRef.current, ...option.set };
    push('me', option.label);
    if (option.commit) commit(option.commit);
    else if (option.next === 'review') review();
    else ask(option.next ?? 'more');
  }

  function submitDate(field: 'targetDate' | 'eventEndDate' | 'startIso', min: string | undefined, next?: string, kind?: CommitKind) {
    if (!dateValue) {
      setDateError('Elige una fecha primero');
      return;
    }
    if (min && dateValue < min) {
      setDateError(`La fecha tiene que ser el ${shortDate(min)} o después`);
      return;
    }
    stateRef.current = { ...stateRef.current, [field]: dateValue };
    push('me', shortDate(dateValue));
    if (kind) commit(kind);
    else ask(next ?? 'more');
  }

  function createAll() {
    const items = planRef.current;
    onCreate(applyPlan(profile, items));
    setPhase('done');
    setMood('lift');
    setNodeId(null);
    push('rex', `Listo: ${items.length} ${items.length === 1 ? 'cosa creada' : 'cosas creadas'}. Ya las tienes en Objetivos y en Planificación.`);
    window.setTimeout(() => setMood('happy'), reduced ? 0 : 2800);
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

  const node = nodeId ? getNode(nodeId, stateRef.current, ctx, plan) : null;
  const notes = phase === 'review' ? reviewNotes(plan, profile, todayIso) : [];

  return (
    <div className="flex animate-section-in flex-col gap-4 motion-reduce:animate-none">
      <div className="flex items-start gap-3">
        <div className="flex w-24 shrink-0 flex-col items-center">
          <RexMascot size={80} mood={mood} />
          <p className="text-xs font-semibold text-white">Rex</p>
          <p className="text-[11px] text-neutral-500">tu coach</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-neutral-400">Tu plan {plan.length > 0 && <span className="font-normal text-neutral-500">({plan.length})</span>}</p>
          <div className="mt-1.5 flex min-h-7 flex-wrap items-center gap-1.5" aria-label="Lo que llevas montado">
            {plan.length === 0 ? (
              <span className="text-xs text-neutral-500">Todavía nada. Lo que montemos aparece aquí y se crea todo junto al final.</span>
            ) : (
              plan.map((it) => (
                <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2.5 py-1 text-xs font-semibold text-brand-gold">
                  {it.kind}: {it.short}
                  {phase !== 'done' && (
                    <button onClick={() => setPlanBoth(planRef.current.filter((x) => x.id !== it.id))} aria-label={`Quitar ${it.short}`} className="ml-0.5 rounded-full p-0.5 hover:bg-white/10">
                      <X size={11} strokeWidth={3} />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label="Avance de la pregunta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(92, depth * 22)}>
            <div className="h-full rounded-full bg-brand-gold transition-[width] duration-300" style={{ width: `${Math.min(92, depth * 22)}%` }} />
          </div>
          <button onClick={startOver} className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-200">
            <RotateCcw size={12} strokeWidth={2.5} aria-hidden="true" />
            Empezar de nuevo
          </button>
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

        {node?.options && !typing && (
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

        {node?.date && !typing && (
          <div className="flex animate-section-in flex-col gap-1.5 motion-reduce:animate-none">
            <div className="flex items-center gap-2">
              <input
                type="date"
                min={node.date.min}
                value={dateValue}
                onChange={(e) => {
                  setDateValue(e.target.value);
                  setDateError('');
                }}
                aria-label="Fecha"
                className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-2 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none"
              />
              <button
                onClick={() => node.date && submitDate(node.date.field, node.date.min, node.date.next, node.date.commit)}
                className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:bg-brand-orange-dark"
              >
                Vale
              </button>
            </div>
            {dateError && (
              <p className="text-xs text-warn" role="alert">
                {dateError}
              </p>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div className="flex animate-section-in flex-col gap-1 rounded-2xl border border-brand-gold/30 bg-white/[0.04] p-4 motion-reduce:animate-none">
            {plan.map((it) => (
              <details key={it.id} className="group border-t border-white/5 py-2 first:border-t-0 first:pt-0">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">
                      {it.kind} · {it.title}
                    </span>
                    <span className="block text-xs text-neutral-400">{it.sub}</span>
                  </span>
                  <ChevronDown size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-neutral-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-neutral-400">
                  {it.fx.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
            ))}
            {notes.map((n) => (
              <p key={n} className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-snug text-warn">
                {n}
              </p>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={createAll} className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
                <Check size={15} strokeWidth={3} aria-hidden="true" />
                Crear todo ({plan.length})
              </button>
              <button
                onClick={() => {
                  setPhase('chat');
                  ask('more');
                }}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
              >
                Seguir añadiendo
              </button>
              <button onClick={onClose} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5">
                Editar a mano
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <button onClick={onClose} className="self-start rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
            Ver mis objetivos
          </button>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
