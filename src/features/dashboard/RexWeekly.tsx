import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Trophy } from 'lucide-react';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';
import type { ReviewMetric, ReviewTone, WeeklyReview } from './weeklyReview';

type Item =
  | { id: number; kind: 'rex' | 'me'; text: string }
  | { id: number; kind: 'metrics'; metrics: ReviewMetric[] }
  | { id: number; kind: 'list'; title: string; icon: 'best' | 'watch'; lines: string[] }
  | { id: number; kind: 'ok'; text: string };

type NewItem = Item extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never;

interface Choice {
  label: string;
  run: () => void;
}

const TYPING_MS = 600;
const CARD_MS = 450;

const TONE_CLASS: Record<ReviewTone, string> = { good: 'text-good', warn: 'text-warn', muted: 'text-white' };

/**
 * La revisión semanal con Rex: un repaso en conversación de la semana que acaba de cerrarse. Cifras, lo mejor, lo que vigilar,
 * la propuesta del coach si la hay (con botones) y cómo sigue el plan. Lo que se decide se entrega a `onAccept` / `onDismiss`; al
 * llegar al final la semana se da por revisada (`onDone`). Todo el contenido sale de `buildWeeklyReview`.
 */
export function RexWeekly({
  review,
  onAccept,
  onDismiss,
  onDone,
  onAdjustGoal,
  onOpenEmphasis,
  onGoPlanificacion,
  onClose,
}: {
  review: WeeklyReview;
  onAccept: () => void;
  onDismiss: () => void;
  onDone: () => void;
  /** Cambia la meta de un objetivo (un peso más bajo o una fecha más tarde). */
  onAdjustGoal: (goalId: string, patch: { targetKg?: number; targetDate?: string }) => void;
  onOpenEmphasis: () => void;
  onGoPlanificacion: () => void;
  onClose: () => void;
}) {
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), []);
  const [items, setItems] = useState<Item[]>([]);
  const [typing, setTyping] = useState(false);
  const [mood, setMood] = useState<RexMood>('idle');
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [finished, setFinished] = useState(false);
  const tokenRef = useRef(0);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (item: NewItem) => setItems((prev) => [...prev, { ...item, id: ++idRef.current } as Item]);

  function say(text: string, then: () => void, after: RexMood = 'idle') {
    const my = tokenRef.current;
    setChoices(null);
    setTyping(true);
    setMood('think');
    window.setTimeout(
      () => {
        if (my !== tokenRef.current) return;
        setTyping(false);
        push({ kind: 'rex', text });
        setMood(after);
        then();
      },
      reduced ? 0 : TYPING_MS,
    );
  }

  function card(item: NewItem, then: () => void) {
    const my = tokenRef.current;
    setChoices(null);
    push(item);
    window.setTimeout(() => {
      if (my === tokenRef.current) then();
    }, reduced ? 0 : CARD_MS);
  }

  function ask(list: Choice[]) {
    const my = tokenRef.current;
    setChoices(
      list.map((c) => ({
        label: c.label,
        run: () => {
          if (my !== tokenRef.current) return;
          push({ kind: 'me', text: c.label });
          setChoices(null);
          c.run();
        },
      })),
    );
  }

  /** El final: cómo sigue el plan, y la semana queda revisada. */
  function finish(extra?: string) {
    say(
      `${review.nextLine}${extra ? ` ${extra}` : ''}`,
      () => {
        onDone();
        push({ kind: 'ok', text: 'Semana revisada. No te lo vuelvo a sacar.' });
        setFinished(true);
        setMood('happy');
      },
      'happy',
    );
  }

  function emphasisStep(extra?: string) {
    if (!review.emphasisReviewPending) return finish(extra);
    say('Además ha llegado la revisión de 4 semanas de lo que priorizo en tu programación.', () =>
      ask([
        {
          label: 'Verla ahora',
          run: () => {
            onDone();
            onOpenEmphasis();
          },
        },
        { label: 'Luego', run: () => finish(extra) },
      ]),
    );
  }

  /** Una meta en kilos que no llega: bajarla, mover la fecha o dejarla; lo que se elige se aplica al momento. */
  function goalStep() {
    const g = review.goalAdjust;
    if (!g) return suggestionStep();
    const options: Choice[] = [];
    if (g.lowerKg !== null) {
      const kg = g.lowerKg;
      options.push({ label: `Bajar la meta a ${String(kg).replace('.', ',')} kg`, run: () => { onAdjustGoal(g.goalId, { targetKg: kg }); say(`Hecho: la meta de ${g.name} pasa a ${String(kg).replace('.', ',')} kg.`, () => suggestionStep(), 'happy'); } });
    }
    if (g.moveDate !== null && g.moveWeeks !== null) {
      const date = g.moveDate;
      const weeks = g.moveWeeks;
      options.push({ label: `Mover la fecha ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`, run: () => { onAdjustGoal(g.goalId, { targetDate: date }); say(`Hecho: la fecha pasa al ${new Date(`${date}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')}.`, () => suggestionStep(), 'happy'); } });
    }
    options.push({ label: 'Dejarlo así', run: () => say('Vale, lo dejamos. Lo vuelvo a mirar la semana que viene.', () => suggestionStep()) });
    say(g.message, () => ask(options));
  }

  function suggestionStep() {
    const s = review.suggestion;
    if (!s) return emphasisStep();
    const yes = s.kind === 'extend-phase' ? 'Sí, alargar una semana' : 'Sí, subirlo';
    const accept = () => {
      onAccept();
      say(s.kind === 'extend-phase' ? 'Hecho: la fase dura una semana más y el pico se retrasa una semana.' : 'Hecho: ese objetivo pasa a intensivo desde mañana.', () => emphasisStep(), 'happy');
    };
    const decline = () => {
      onDismiss();
      say('Vale, lo dejamos como está. Lo vuelvo a mirar la semana que viene.', () => emphasisStep());
    };
    say(s.headline, () =>
      ask([
        { label: yes, run: accept },
        { label: 'Ahora no', run: decline },
        {
          label: '¿Por qué lo propones?',
          run: () =>
            say(s.detail, () =>
              ask([
                { label: yes, run: accept },
                { label: 'Ahora no', run: decline },
              ]),
            ),
        },
      ]),
    );
  }

  function start() {
    const intro = review.planLine ? `Repasamos tu semana pasada (${review.planLine}). Te la cuento en un minuto.` : 'Repasamos tu semana pasada. Te la cuento en un minuto.';
    say(intro, () =>
      card({ kind: 'metrics', metrics: review.metrics }, () => {
        if (review.short) {
          say('Con tan pocas sesiones no saco conclusiones: no juzgo una semana por unos pocos entrenos sueltos. Si pasó algo, cuéntamelo y lo ajusto.', () =>
            ask([
              {
                label: 'Algo ha pasado',
                run: () =>
                  say('Para contármelo, abre Planificación y pulsa el botón de Rex junto a «Empezar sesión»: ahí puedo poner un aviso de molestia, marcar días de descanso o cambiarte la sesión.', () =>
                    ask([
                      { label: 'Ir a Planificación', run: () => { onDone(); onGoPlanificacion(); } },
                      { label: 'Luego', run: () => finish() },
                    ]),
                  ),
              },
              { label: 'Fue una semana tranquila', run: () => say('Vale, sin problema. Semana a semana.', () => emphasisStep()) },
            ]),
          );
          return;
        }
        const lists = [
          { title: 'Lo mejor', icon: 'best' as const, lines: review.best },
          { title: 'Lo que vigilar', icon: 'watch' as const, lines: review.watch },
        ].filter((l) => l.lines.length > 0);
        const next = () => goalStep();
        if (lists.length === 0) return say('Una semana sin sobresaltos: nada que destacar ni que vigilar.', next);
        const run = (i: number) => {
          if (i >= lists.length) return next();
          card({ kind: 'list', ...lists[i] }, () => run(i + 1));
        };
        run(0);
      }),
    );
  }

  useEffect(() => {
    start();
    return () => {
      tokenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [items.length, typing, choices, finished, reduced]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <RexMascot size={52} mood={mood} />
        <div>
          <p className="text-sm font-semibold text-white">Rex · revisión semanal</p>
          <p className="text-xs text-neutral-400">Un minuto: cifras, lo mejor, lo que vigilar y, si hace falta, una propuesta.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5" role="log" aria-live="polite" aria-label="Revisión semanal con Rex">
        {items.map((it) => {
          if (it.kind === 'rex' || it.kind === 'me') {
            return (
              <div
                key={it.id}
                className={`max-w-[88%] animate-section-in rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed motion-reduce:animate-none ${
                  it.kind === 'rex' ? 'self-start rounded-bl-md bg-white/[0.06] text-neutral-100' : 'self-end rounded-br-md bg-brand-gold/15 text-brand-gold'
                }`}
              >
                {it.text}
              </div>
            );
          }
          if (it.kind === 'metrics') {
            return (
              <div key={it.id} className="animate-section-in rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 motion-reduce:animate-none">
                <p className="text-xs font-semibold text-neutral-400">Tu semana pasada</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {it.metrics.map((m) => (
                    <div key={m.label} className="rounded-lg bg-white/[0.04] px-3 py-2">
                      <p className={`num text-lg font-semibold ${TONE_CLASS[m.tone]}`}>{m.value}</p>
                      <p className="text-[11px] text-neutral-500">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          if (it.kind === 'list') {
            const Icon = it.icon === 'best' ? Trophy : Eye;
            return (
              <div key={it.id} className="animate-section-in rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 motion-reduce:animate-none">
                <p className={`flex items-center gap-1.5 text-xs font-semibold ${it.icon === 'best' ? 'text-good' : 'text-warn'}`}>
                  <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
                  {it.title}
                </p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-neutral-300">
                  {it.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            );
          }
          return (
            <p key={it.id} className="animate-section-in rounded-lg bg-good/10 px-3 py-2 text-xs font-semibold text-good motion-reduce:animate-none">
              {it.text}
            </p>
          );
        })}

        {typing && (
          <div className="flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-bl-md bg-white/[0.06] py-3" aria-label="Rex está escribiendo">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}

        {choices && !typing && (
          <div className="flex animate-section-in flex-wrap gap-2 motion-reduce:animate-none">
            {choices.map((c) => (
              <button
                key={c.label}
                onClick={c.run}
                className="rounded-full border border-brand-border px-3.5 py-2 text-left text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/5"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {finished && (
          <button onClick={onClose} className="self-start rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
            Cerrar
          </button>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
