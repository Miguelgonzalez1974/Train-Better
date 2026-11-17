import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, EyeOff, Eye, Pin, PinOff, Pencil, RotateCcw, type LucideIcon } from 'lucide-react';
import { MAX_SHOWN, rankTiles, resetPrefs, TILE_GROUP_LABEL, toggleHidden, togglePinned, type TileContext, type TileGroup, type TilePrefs } from './rexTiles';

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
 * Los atajos del panel de Rex como teselas: las que más encajan con el momento a la vista (hasta 6, con las que has fijado primero),
 * «Todos» para el resto agrupado, y «Editar» para fijar o esconder cada una. Lo que se elige se guarda en este dispositivo.
 */
export function RexTileGrid({ tiles, ctx, prefs, onPrefs }: { tiles: PanelTile[]; ctx: TileContext; prefs: TilePrefs; onPrefs: (next: TilePrefs) => void }) {
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const { shown, rest } = useMemo(() => rankTiles(tiles.map((t) => t.id), ctx, prefs), [tiles, ctx, prefs]);
  if (tiles.length === 0) return null;

  const grouped = (ids: string[]) =>
    GROUP_ORDER.map((g) => ({ group: g, items: ids.map((id) => byId.get(id)!).filter((t) => t && t.group === g) })).filter((x) => x.items.length > 0);

  if (editing) {
    const everything = [...shown, ...rest];
    return (
      <div className="mt-4" data-testid="rex-tiles-edit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Editar atajos</p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => onPrefs(resetPrefs())} className="flex items-center gap-1 rounded-full border border-brand-border px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-white/5">
              <RotateCcw size={12} aria-hidden="true" />
              Que decida Rex
            </button>
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-semibold text-black hover:bg-brand-orange-dark">
              <Check size={12} aria-hidden="true" />
              Listo
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-neutral-400">
          Fija hasta {MAX_SHOWN} para tenerlas siempre a la vista. Las que escondas siguen en «Todos». El resto lo coloca Rex según el momento.
        </p>
        {grouped(everything).map(({ group, items }) => (
          <div key={group} className="mb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{TILE_GROUP_LABEL[group]}</p>
            <div className="flex flex-col gap-1.5">
              {items.map((t) => {
                const pinned = prefs.pinned.includes(t.id);
                const hidden = prefs.hidden.includes(t.id);
                const Icon = t.Icon;
                return (
                  <div key={t.id} data-tile-id={t.id} className={`flex items-center gap-2.5 rounded-xl border border-white/10 bg-brand-surface px-3 py-2 ${hidden ? 'opacity-50' : ''}`}>
                    <Icon size={18} aria-hidden="true" className="shrink-0 text-brand-orange" />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-neutral-100">{t.label}</span>
                    <button
                      onClick={() => onPrefs(togglePinned(prefs, t.id))}
                      aria-pressed={pinned}
                      aria-label={pinned ? `Soltar ${t.label}` : `Fijar ${t.label}`}
                      disabled={!pinned && prefs.pinned.length >= MAX_SHOWN}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-30 ${pinned ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-400 hover:text-white'}`}
                    >
                      {pinned ? <Pin size={16} /> : <PinOff size={16} />}
                    </button>
                    <button
                      onClick={() => onPrefs(toggleHidden(prefs, t.id))}
                      aria-pressed={hidden}
                      aria-label={hidden ? `Volver a enseñar ${t.label}` : `Esconder ${t.label}`}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${hidden ? 'border-white/30 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'}`}
                    >
                      {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
        {shown.map((id) => {
          const t = byId.get(id);
          return t ? <Tile key={id} tile={t} pinned={prefs.pinned.includes(id)} onClick={t.run} /> : null;
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
