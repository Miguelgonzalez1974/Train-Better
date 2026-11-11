import { useMemo, useState } from 'react';
import { Flag, Timeline, Trophy } from 'lucide-react';
import type { AthleteProfile } from '../../data/athlete/types';
import { buildSeasonMap, type MapBar, type MapKind, type SeasonMap as SeasonMapData } from '../../engine/seasonMap';

/**
 * El mapa de la temporada: una línea de tiempo con los bloques del macro, el programa de fuerza, la rampa, el modo competición, las
 * fechas que importan (competición, metas en kilos) y un marcador de hoy. Toca un elemento para ver su detalle. Todo se lee del perfil
 * (`engine/seasonMap.ts`); aquí solo se pinta. Dos versiones: la completa y una línea compacta que abre la completa.
 */

const BAR_CLASS: Record<MapKind, string> = {
  macro: 'bg-info/20 text-info',
  programa: 'bg-good/15 text-good',
  rampa: 'bg-white/10 text-neutral-300',
  modo: 'bg-warn/20 text-warn',
};
const PEAK_CLASS = 'bg-warn/20 text-warn';

const LANE_H = 28;
const LANE_GAP = 6;
const AXIS_H = 20;
const FLAG_H = 40;

function barClass(b: MapBar): string {
  return b.kind === 'macro' && b.peak ? PEAK_CLASS : BAR_CLASS[b.kind];
}

function useMap(profile: AthleteProfile, todayIso: string): SeasonMapData | null {
  return useMemo(() => buildSeasonMap(profile, todayIso), [profile, todayIso]);
}

export function SeasonMapFull({ profile, todayIso, embedded = false }: { profile: AthleteProfile; todayIso: string; /** Dentro de una ventana que ya lleva el título: sin marco ni título propio. */ embedded?: boolean }) {
  const map = useMap(profile, todayIso);
  const [selected, setSelected] = useState<string | null>(null);
  if (!map) return null;

  const detail = [...map.bars, ...map.flags].find((x) => x.id === selected)?.detail ?? null;
  const barsTop = AXIS_H;
  const flagsTop = barsTop + map.lanes * (LANE_H + LANE_GAP) + 4;
  const height = flagsTop + map.flagRows * FLAG_H + 4;
  const todayLeft = `${map.todayPct}%`;

  return (
    <section className={`flex flex-col gap-3 ${embedded ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-3.5'}`} aria-label="Tu temporada">
      <div>
        {!embedded && (
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Timeline size={16} aria-hidden="true" className="text-brand-gold" />
            Tu temporada
          </p>
        )}
        <p className={`text-xs text-neutral-400 ${embedded ? '' : 'mt-1'}`}>
          {map.now}
          {map.toCompetition ? ` · ${map.toCompetition.charAt(0).toLowerCase()}${map.toCompetition.slice(1)}` : ''}
        </p>
      </div>

      <div className="relative w-full" style={{ height }} role="group" aria-label="Línea de tiempo de la temporada">
        {map.months.filter((m) => Math.abs(m.pct - map.todayPct) >= 5).map((m) => (
          <span key={`${m.label}-${m.pct}`} className="absolute top-0 border-l border-white/10 pl-1 text-[11px] text-neutral-500" style={{ left: `${m.pct}%`, height: height }}>
            {m.label}
          </span>
        ))}

        {map.bars.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelected(selected === b.id ? null : b.id)}
            aria-label={b.label}
            aria-pressed={selected === b.id}
            className={`absolute flex items-center truncate rounded-md px-2 text-left text-xs font-semibold transition-shadow ${barClass(b)} ${
              selected === b.id ? 'ring-1 ring-white' : 'hover:ring-1 hover:ring-white/30'
            } ${b.current ? '' : 'opacity-80'}`}
            style={{ left: `${b.startPct}%`, width: `${b.widthPct}%`, top: barsTop + b.lane * (LANE_H + LANE_GAP), height: LANE_H }}
          >
            {b.widthPct > 7 ? b.label : ''}
          </button>
        ))}

        {map.flags.map((f) => {
          const Icon = f.kind === 'competicion' ? Trophy : Flag;
          // Las banderas pegadas al borde derecho se alinean a su derecha para no salirse.
          const edge = f.pct > 88;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(selected === f.id ? null : f.id)}
              aria-label={f.label}
              aria-pressed={selected === f.id}
              className={`absolute flex flex-col ${edge ? 'items-end' : 'items-center'} text-[11px] text-neutral-400 hover:text-white`}
              style={{ left: edge ? undefined : `${f.pct}%`, right: edge ? 0 : undefined, transform: edge ? undefined : 'translateX(-50%)', top: flagsTop + f.row * FLAG_H }}
            >
              <Icon size={16} aria-hidden="true" className={f.kind === 'competicion' ? 'text-brand-gold' : 'text-info'} />
              <span className="whitespace-nowrap">{f.label}</span>
            </button>
          );
        })}

        <div className="pointer-events-none absolute bottom-0 w-0.5 bg-bad" style={{ left: todayLeft, top: 14 }} aria-hidden="true" />
        <span className="pointer-events-none absolute top-0 -translate-x-1/2 text-[11px] font-semibold text-bad" style={{ left: todayLeft }}>
          hoy
        </span>
      </div>

      <p className="min-h-[2.5rem] rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-300" aria-live="polite">
        {detail ?? 'Toca un bloque, el programa o una fecha para ver el detalle.'}
      </p>
    </section>
  );
}

/** Una línea fina con el bloque en el que estás y cuánto falta; al tocarla se abre el mapa completo. */
export function SeasonMapCompact({ profile, todayIso, onOpen }: { profile: AthleteProfile; todayIso: string; onOpen: () => void }) {
  const map = useMap(profile, todayIso);
  if (!map) return null;
  const macros = map.bars.filter((b) => b.kind === 'macro').sort((a, b) => a.startPct - b.startPct);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/5"
      aria-label={`Tu temporada: ${map.now}. Abrir el mapa`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Tu temporada</span>
      <span className="flex justify-between gap-3 text-xs text-neutral-400">
        <span className="min-w-0 truncate">{map.now}</span>
        {map.toCompetition && <span className="shrink-0">{map.toCompetition.replace(' para la competición', '')}</span>}
      </span>
      <span className="relative block h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        {macros.map((b) => (
          <span key={b.id} className={`absolute top-0 h-full ${b.peak ? 'bg-warn/40' : 'bg-info/30'} ${b.current ? 'opacity-100' : 'opacity-70'}`} style={{ left: `${b.startPct}%`, width: `${b.widthPct}%` }} />
        ))}
        <span className="absolute top-0 h-full w-0.5 bg-bad" style={{ left: `${map.todayPct}%` }} />
      </span>
    </button>
  );
}
