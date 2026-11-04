import { useState } from 'react';
import { CalendarRange, ChevronDown, Dumbbell, Gauge, MessageCircle, Pause, Pencil, Plus, Map, Sparkles, Target, Trash2, type LucideIcon } from 'lucide-react';
import { RexMascot } from './RexMascot';
import type { ChipTone, OpenAction, OpenGroups, OpenItem } from './openItems';

export type AddKind = 'objetivo' | 'macro' | 'programa' | 'rampa' | 'temporada';

const ADD_OPTIONS: { key: AddKind; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: 'objetivo', label: 'Un objetivo', hint: 'Subir un PR, una habilidad, una competición…', Icon: Target },
  { key: 'macro', label: 'Un macrociclo', hint: 'El plan de fondo, por fases', Icon: CalendarRange },
  { key: 'programa', label: 'Un programa de fuerza', hint: '5/3/1, lineal, halterofilia…', Icon: Dumbbell },
  { key: 'rampa', label: 'Una rampa de vuelta', hint: 'Si vienes de un parón', Icon: Gauge },
  { key: 'temporada', label: 'Planificar temporada', hint: 'Varios bloques hasta tu fecha clave', Icon: Sparkles },
];

const CHIP_CLASS: Record<ChipTone, string> = {
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  accent: 'bg-brand-gold/15 text-brand-gold',
  muted: 'bg-white/10 text-neutral-300',
};

const ACTION_META: Record<OpenAction, { label: string; Icon: LucideIcon }> = {
  editar: { label: 'Editar', Icon: Pencil },
  plan: { label: 'Plan de fases', Icon: Map },
  terminar: { label: 'Terminar', Icon: Trash2 },
  quitar: { label: 'Quitar', Icon: Trash2 },
  eliminar: { label: 'Eliminar', Icon: Trash2 },
};

function Bar({ item }: { item: OpenItem }) {
  if (item.pct === null) return null;
  return (
    <div className="mt-3">
      <div className="relative h-[5px] rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.pct} aria-label={`Avance de ${item.title}`}>
        <div className={`h-full rounded-full ${item.dim ? 'bg-neutral-600' : ''}`} style={{ width: `${item.pct}%`, ...(item.dim ? {} : { backgroundColor: item.color }) }} />
        {item.tick !== null && (
          <span aria-hidden="true" className="absolute -top-[3px] h-[11px] w-0.5 rounded-full bg-white/80" style={{ left: `${item.tick}%` }} title="Lo esperable a estas alturas" />
        )}
      </div>
      {item.legend && <p className="mt-1 text-[11px] text-neutral-500">{item.legend}</p>}
    </div>
  );
}

function ItemCard({ item, onAction }: { item: OpenItem; onAction: (item: OpenItem, action: OpenAction) => void }) {
  return (
    <details className={`group overflow-hidden rounded-xl bg-white/[0.04] ${item.dim ? 'opacity-80' : ''}`}>
      <summary className="cursor-pointer list-none p-3.5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.06]" style={{ color: item.dim ? undefined : item.color }}>
            <item.Icon size={17} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-white">{item.title}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{item.sub}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP_CLASS[item.chip.tone]}`}>{item.chip.text}</span>
            <ChevronDown size={15} strokeWidth={2.25} className="text-neutral-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </div>
        </div>
        <Bar item={item} />
      </summary>
      <div className="border-t border-white/5 px-3.5 pb-3.5 pt-3">
        {item.facts.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-neutral-400">
            {item.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {item.actions.map((a) => {
            const { label, Icon } = ACTION_META[a];
            return (
              <button
                key={a}
                onClick={() => onAction(item, a)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:bg-white/5 hover:text-white"
              >
                <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function Group({ label, items, onAction }: { label: string; items: OpenItem[]; onAction: (item: OpenItem, action: OpenAction) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <p className="px-1 text-xs font-semibold text-neutral-400">
        {label} <span className="font-normal text-neutral-500">({items.length})</span>
      </p>
      {items.map((it) => (
        <ItemCard key={it.id} item={it} onAction={onAction} />
      ))}
    </section>
  );
}

export interface HomeSuggestion {
  title: string;
  cta: string;
}

/**
 * Objetivos como "lo que tengo abierto": los objetivos con su avance, el plan de fondo (programa de fuerza, macrociclo, rampa),
 * lo que viene y lo ya terminado. Cada tarjeta se abre para ver qué hace el coach con ella y sus acciones; crear algo nuevo
 * sale del botón Añadir. Los formularios de siempre siguen detrás de Editar.
 */
export function ObjetivosHome({
  groups,
  suggestion,
  onSuggestionAccept,
  onSuggestionDismiss,
  onAction,
  onAdd,
  onTalk,
}: {
  groups: OpenGroups;
  suggestion: HomeSuggestion | null;
  onSuggestionAccept: () => void;
  onSuggestionDismiss: () => void;
  onAction: (item: OpenItem, action: OpenAction) => void;
  onAdd: (kind: AddKind) => void;
  onTalk: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nothingOpen = groups.total === 0;

  return (
    <div className="flex animate-section-in flex-col gap-4 motion-reduce:animate-none">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <RexMascot size={42} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-white">Objetivos</h1>
          <p className="text-xs text-neutral-400">{nothingOpen ? 'Nada abierto' : `${groups.total} ${groups.total === 1 ? 'abierto' : 'abiertos'}`}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <button
          onClick={onTalk}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark sm:flex-none"
        >
          <MessageCircle size={15} strokeWidth={2.5} aria-hidden="true" />
          Hablar con Rex
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:bg-white/5"
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            Añadir
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-20 cursor-default" aria-label="Cerrar el menú" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-72 animate-menu-in rounded-xl border border-brand-border bg-brand-surface p-1 shadow-xl shadow-black/40">
                {ADD_OPTIONS.map(({ key, label, hint, Icon }) => (
                  <button
                    key={key}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAdd(key);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-white/5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                      <Icon size={16} strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{label}</span>
                      <span className="block truncate text-[11px] text-neutral-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      {suggestion && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-neon/30 bg-brand-neon/[0.06] p-3.5">
          <Sparkles size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-neon" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{suggestion.title}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={onSuggestionAccept} className="rounded-md bg-brand-neon px-2.5 py-1 text-xs font-semibold text-brand-bg transition-colors duration-200 hover:bg-brand-neon-soft">
                {suggestion.cta}
              </button>
              <button onClick={onSuggestionDismiss} className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5">
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {nothingOpen ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-8 text-center">
          <RexMascot size={92} />
          <p className="text-base font-semibold text-white">Todavía no tienes nada abierto</p>
          <p className="max-w-xs text-sm text-neutral-400">Cuéntame qué quieres conseguir y te hago unas preguntas para montarlo. O elige tú qué crear.</p>
          <button
            onClick={onTalk}
            className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
          >
            <MessageCircle size={15} strokeWidth={2.5} aria-hidden="true" />
            Hablar con Rex
          </button>
          <div className="grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
            {ADD_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => onAdd(key)}
                className="flex items-center gap-2 rounded-xl border border-brand-border px-3 py-2.5 text-left text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:bg-white/5"
              >
                <Icon size={16} strokeWidth={2.25} className="shrink-0 text-neutral-400" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {groups.pauseNote && (
            <p className="flex items-start gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-snug text-neutral-300">
              <Pause size={13} strokeWidth={2.25} className="mt-px shrink-0" aria-hidden="true" />
              {groups.pauseNote}
            </p>
          )}
          <Group label="Objetivos" items={groups.objetivos} onAction={onAction} />
          <Group label="Plan de fondo" items={groups.fondo} onAction={onAction} />
          <Group label="Lo que viene" items={groups.viene} onAction={onAction} />
        </>
      )}

      {groups.terminados.length > 0 && (
        <details className="group rounded-xl bg-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-neutral-500 [&::-webkit-details-marker]:hidden">
            <span>Terminados ({groups.terminados.length})</span>
            <ChevronDown size={14} strokeWidth={2.25} className="transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-1 px-2 pb-2">
            {groups.terminados.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <it.Icon size={14} strokeWidth={2.25} className="shrink-0 text-neutral-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-neutral-400">{it.title}</p>
                  <p className="text-[11px] text-neutral-600">{it.sub}</p>
                </div>
                <button
                  onClick={() => onAction(it, it.actions[0])}
                  aria-label={`${ACTION_META[it.actions[0]].label} ${it.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border text-neutral-500 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                >
                  <Trash2 size={13} strokeWidth={2.25} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
