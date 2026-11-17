import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pin, Pencil, RotateCcw, Sparkles, type LucideIcon } from 'lucide-react';
import { hasChosenSlots, MAX_SHOWN, rankTiles, resetPrefs, setSlot, TILE_GROUP_LABEL, type TileContext, type TileGroup, type TilePrefs } from './rexTiles';

/** Una tesela lista para dibujar y tocar: lo que la pantalla (o la biblioteca) pone y lo que hace al tocarla. */
export interface PanelTile {
  id: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
  group: TileGroup;
  run: () => void;
}

const GROUP_ORDER: TileGroup[] = ['sesion', 'dia', 'cuerpo', 'datos', 'nutricion', 'objetivos', 'mas'];

function Tile({ tile, pinned, onClick }: { tile: PanelTile; pinned: boolean; onClick: () => void }) {
  const Icon = tile.Icon;
  return (
    <button
      onClick={onClick}
      data-testid="rex-tile"
      data-tile-id={tile.id}
      className="relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-brand-surface px-1.5 py-2 text-center transition-colors duration-200 hover:border-brand-gold active:scale-[0.98]"
    >
      {pinned && <Pin size={11} aria-label="Fijada" className="absolute right-2 top-2 text-brand-gold" />}
      <Icon size={26} strokeWidth={2} aria-hidden="true" className="text-brand-orange" />
      <span className="block text-[12.5px] font-semibold leading-tight text-neutral-100">{tile.label}</span>
      {tile.hint && <span className="block text-[10.5px] leading-tight text-neutral-500">{tile.hint}</span>}
    </button>
  );
}

/**
 * Los atajos del panel de Rex como teselas: las que más encajan con el momento a la vista (6 huecos), «Todos» para el resto agrupado, y «Editar»
 * para elegir de una en una qué tesela va en cada hueco (o dejar que lo decida Rex). Lo que se elige se guarda en este dispositivo.
 */
export function RexTileGrid({ tiles, ctx, prefs, onPrefs }: { tiles: PanelTile[]; ctx: TileContext; prefs: TilePrefs; onPrefs: (next: TilePrefs) => void }) {
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState(false);
  /** El hueco que se está eligiendo (0-5), o null. */
  const [picking, setPicking] = useState<number | null>(null);
  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const { shown, rest } = useMemo(() => rankTiles(tiles.map((t) => t.id), ctx, prefs), [tiles, ctx, prefs]);
  if (tiles.length === 0) return null;

  const grouped = (ids: string[]) =>
    GROUP_ORDER.map((g) => ({ group: g, items: ids.map((id) => byId.get(id)!).filter((t) => t && t.group === g) })).filter((x) => x.items.length > 0);

  const isFixed = (i: number) => {
    const id = prefs.slots[i];
    return !!id && byId.has(id);
  };

  if (editing) {
    const done = () => {
      setPicking(null);
      setEditing(false);
    };
    const choose = (index: number, id: string | null) => {
      onPrefs(setSlot(prefs, index, id));
      setPicking(null);
    };
    // La biblioteca del selector: siempre en el mismo orden (por grupo, y dentro del grupo como las pone la pantalla), nunca reordenada por puntuación.
    const library = grouped(tiles.map((t) => t.id));
    const pickedFixed = picking !== null ? prefs.slots[picking] : null;

    return (
      <div className="mt-4" data-testid="rex-tiles-edit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Editar atajos</p>
          <div className="flex items-center gap-1.5">
            {hasChosenSlots(prefs) && (
              <button onClick={() => { onPrefs(resetPrefs()); setPicking(null); }} className="flex items-center gap-1 rounded-full border border-brand-border px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-white/5">
                <RotateCcw size={12} aria-hidden="true" />
                Todo automático
              </button>
            )}
            <button onClick={done} className="flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-semibold text-black hover:bg-brand-orange-dark">
              <Check size={12} aria-hidden="true" />
              Listo
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-neutral-400">Toca un hueco y elige qué atajo quieres en él. Los huecos «Automático» los rellena Rex según el momento.</p>

        <div className="grid grid-cols-3 gap-2" data-testid="rex-slots">
          {Array.from({ length: MAX_SHOWN }, (_, i) => {
            const t = shown[i] ? byId.get(shown[i]) : undefined;
            const fixed = isFixed(i);
            const Icon = t?.Icon;
            const active = picking === i;
            return (
              <button
                key={i}
                onClick={() => setPicking(active ? null : i)}
                aria-pressed={active}
                aria-label={`Hueco ${i + 1}: ${t ? t.label : 'vacío'}${fixed ? ', fijado' : ', automático'}`}
                data-slot={i}
                className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center transition-colors ${
                  active ? 'border-brand-orange bg-brand-orange/10' : fixed ? 'border-brand-gold/60 bg-brand-surface' : 'border-dashed border-white/20 bg-brand-surface/60'
                }`}
              >
                <span className="absolute left-2 top-1.5 text-[10px] font-semibold text-neutral-500">{i + 1}</span>
                {fixed ? <Pin size={11} aria-hidden="true" className="absolute right-2 top-2 text-brand-gold" /> : <Sparkles size={11} aria-hidden="true" className="absolute right-2 top-2 text-neutral-500" />}
                {Icon && <Icon size={24} strokeWidth={2} aria-hidden="true" className={fixed ? 'text-brand-orange' : 'text-neutral-400'} />}
                <span className={`block text-[12px] font-semibold leading-tight ${fixed ? 'text-neutral-100' : 'text-neutral-400'}`}>{t ? t.label : 'Vacío'}</span>
                <span className="block text-[10px] leading-tight text-neutral-500">{fixed ? 'Fijado' : 'Automático'}</span>
              </button>
            );
          })}
        </div>

        {picking !== null && (
          <div className="mt-3 rounded-2xl border border-brand-orange/40 bg-brand-surface p-3" data-testid="rex-slot-picker">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-orange">Hueco {picking + 1}: ¿qué atajo?</p>
            <button
              onClick={() => choose(picking, null)}
              aria-pressed={!pickedFixed}
              data-pick="auto"
              className={`mb-3 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${!pickedFixed ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:bg-white/5'}`}
            >
              <Sparkles size={18} aria-hidden="true" className="shrink-0 text-brand-orange" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight text-neutral-100">Automático</span>
                <span className="block text-[11px] leading-tight text-neutral-500">Que lo decida Rex según el momento</span>
              </span>
              {!pickedFixed && <Check size={16} aria-hidden="true" className="shrink-0 text-brand-orange" />}
            </button>
            {library.map(({ group, items }) => (
              <div key={group} className="mb-2.5 last:mb-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{TILE_GROUP_LABEL[group]}</p>
                <div className="flex flex-col gap-1">
                  {items.map((t) => {
                    const Icon = t.Icon;
                    const at = prefs.slots.indexOf(t.id);
                    const here = at === picking;
                    return (
                      <button
                        key={t.id}
                        onClick={() => choose(picking, t.id)}
                        data-pick={t.id}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${here ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:bg-white/5'}`}
                      >
                        <Icon size={18} aria-hidden="true" className="shrink-0 text-brand-orange" />
                        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-neutral-100">{t.label}</span>
                        {here ? (
                          <Check size={16} aria-hidden="true" className="shrink-0 text-brand-orange" />
                        ) : at >= 0 ? (
                          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">en el {at + 1}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4" data-testid="rex-tiles">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Atajos</p>
        <div className="flex items-center gap-1">
          {rest.length > 0 && (
            <button onClick={() => setAll((v) => !v)} aria-expanded={all} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-white/5">
              {all ? 'Menos' : 'Todos'}
              {all ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            </button>
          )}
          <button onClick={() => setEditing(true)} aria-label="Editar atajos" className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white">
            <Pencil size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {shown.map((id, i) => {
          const t = byId.get(id);
          return t ? <Tile key={id} tile={t} pinned={isFixed(i)} onClick={t.run} /> : null;
        })}
      </div>
      {all &&
        grouped(rest).map(({ group, items }) => (
          <div key={group} className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{TILE_GROUP_LABEL[group]}</p>
            <div className="grid grid-cols-3 gap-2">
              {items.map((t) => (
                <Tile key={t.id} tile={t} pinned={false} onClick={t.run} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
