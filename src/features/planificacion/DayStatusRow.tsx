import { useState, type ReactNode } from 'react';
import { Flame, Lightbulb, Wrench } from 'lucide-react';
import type { DailySession, PainFlag, StrainTarget } from '../../data/athlete/types';
import { LIGHT_LABEL } from '../../engine/dayLight';
import { PAIN_AREA_LABEL } from '../../engine/painFlags';
import type { PlannedStrain, PlanFit } from '../../engine/plannedStrain';
import { DayLightPill, lightColor } from '../shell/DayLightPill';
import { PainChips } from './CoachNotices';

const FIT_COLOR: Record<PlanFit, string> = {
  dentro: 'rgb(var(--c-state-good))',
  'se-pasa': 'rgb(var(--c-state-mid))',
  'se-queda-corta': 'rgb(var(--c-state-cool))',
};
const GOLD = 'rgb(var(--c-brand-gold))';
const PHASE_WORD: Record<NonNullable<DailySession['competition']>['phase'], string> = {
  construccion: 'construcción',
  'pico-1': 'pico',
  pico: 'pico',
  taper: 'taper',
  activacion: 'activación',
  vispera: 'víspera',
  evento: 'compites',
  post: 'recupera',
};

interface Tile {
  id: string;
  value: string;
  note: string;
  label: string;
  /** Color del texto de la nota. */
  color?: string;
  tone?: 'normal' | 'alert' | 'gold' | 'muted';
  dot?: boolean;
  detail: ReactNode;
}

export interface DayStatusProps {
  session: DailySession;
  planned: PlannedStrain | null;
  target: StrainTarget | null;
  fit: { fit: PlanFit; diff: number } | null;
  painFlags: PainFlag[];
  onRemovePain: (id: string) => void;
  /** null = hoy no hay nada de dureza que enseñar (sesión ya hecha, descanso…). */
  hardness: {
    available: boolean;
    /** Por qué no se puede, si no se puede. */
    reason: string | null;
    /** Sugerencia del coach para subirla hoy (ver `suggestHardness`). */
    suggestion?: string;
    onOpen: () => void;
    onReset: () => void;
  } | null;
  canSwapWod: boolean;
  onSwapWod: () => void;
  onLighter: () => void;
  onShowReasons: (() => void) | null;
}

const BTN = 'rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold';

/**
 * El estado del día de un vistazo, en una fila de casillas tocables (como la del Análisis): esfuerzo previsto frente al objetivo,
 * semáforo, dureza, cuenta atrás de la competición y molestias. Cada una enseña lo esencial y, al tocarla, abre su detalle justo
 * debajo: antes eran seis líneas de texto suelto entre el título y el calentamiento. Lo que importa (molestia activa, competición)
 * sale con color y sin tocar nada.
 */
export function DayStatusRow({ session, planned, target, fit, painFlags, onRemovePain, hardness, canSwapWod, onSwapWod, onLighter, onShowReasons }: DayStatusProps) {
  const [open, setOpen] = useState<string | null>(null);
  const tiles: Tile[] = [];

  if (planned) {
    const f = fit?.fit ?? 'dentro';
    const note = !target ? '' : f === 'se-pasa' ? `se pasa ${fit?.diff ?? ''}`.trim() : f === 'se-queda-corta' ? 'por debajo' : 'dentro';
    tiles.push({
      id: 'esfuerzo',
      value: `~${Math.round(planned.strain)}`,
      note,
      label: target ? `obj. ${target.low}–${target.high}` : 'esfuerzo',
      color: target ? FIT_COLOR[f] : undefined,
      detail: (
        <>
          <p>
            Esfuerzo previsto <b className="num text-white">~{Math.round(planned.strain)}</b>
            {target && (
              <>
                {' '}
                frente a tu objetivo de hoy <b className="num text-white">{target.low}–{target.high}</b>:{' '}
                {f === 'dentro' ? 'dentro.' : f === 'se-pasa' ? `${fit?.diff} por encima.` : 'te deja margen.'}
              </>
            )}{' '}
            Duración estimada <b className="num text-white">{Math.round(planned.minutes)} min</b>.
          </p>
          {/* Sin semáforo (aún sin check-in) el «por qué» de la sesión vive aquí. */}
          {!session.dayLight && onShowReasons && (
            <button onClick={onShowReasons} className="mt-2 block font-semibold text-brand-gold underline decoration-dotted">
              Por qué tu sesión es así hoy →
            </button>
          )}
          {f === 'se-pasa' && (
            <div className="mt-2 flex flex-wrap gap-2">
              {canSwapWod && (
                <button onClick={onSwapWod} className={BTN}>
                  Probar otro WOD
                </button>
              )}
              <button onClick={onLighter} className={BTN}>
                Sesión ligera
              </button>
            </div>
          )}
        </>
      ),
    });
  }

  if (session.dayLight) {
    const meta = LIGHT_LABEL[session.dayLight.color];
    tiles.push({
      id: 'semaforo',
      value: meta.name.replace('Día ', '').replace(/^./, (c) => c.toUpperCase()),
      note: target?.readiness != null ? `${Math.round(target.readiness)} %` : meta.short,
      label: 'semáforo',
      color: lightColor(session.dayLight.color),
      detail: (
        <div className="flex flex-col items-start gap-1.5">
          <DayLightPill light={session.dayLight} />
          <p>{session.dayLight.reasons.join(' · ')}</p>
          {onShowReasons && (
            <button onClick={onShowReasons} className="font-semibold text-brand-gold underline decoration-dotted">
              Por qué tu sesión es así hoy →
            </button>
          )}
        </div>
      ),
    });
  }

  if (hardness) {
    if (session.hardness) {
      tiles.push({
        id: 'dureza',
        value: `+${session.hardness}`,
        note: 'subida',
        label: 'dureza',
        color: 'rgb(var(--c-brand-orange))',
        detail: (
          <>
            <p>
              <b className="text-white">Más dura +{session.hardness}</b> · {session.hardnessMode === 'intensity' ? 'más carga con el mismo volumen' : 'más series y rondas'}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={hardness.onOpen} className={BTN}>
                Cambiar
              </button>
              <button onClick={hardness.onReset} className={BTN}>
                Volver a normal
              </button>
            </div>
          </>
        ),
      });
    } else if (hardness.available) {
      tiles.push({
        id: 'dureza',
        value: 'Más dura',
        note: hardness.suggestion ? 'el coach sugiere' : 'disponible',
        label: 'dureza',
        color: hardness.suggestion ? GOLD : undefined,
        tone: hardness.suggestion ? 'gold' : 'normal',
        dot: Boolean(hardness.suggestion),
        detail: (
          <>
            {hardness.suggestion && (
              <p className="flex items-start gap-1.5 text-brand-gold">
                <Lightbulb size={13} strokeWidth={2.25} className="mt-0.5 shrink-0" aria-hidden="true" />
                {hardness.suggestion}
              </p>
            )}
            <p className={hardness.suggestion ? 'mt-1' : ''}>Si te ves bien puedes subir la dureza de hoy (+1 o +2): el coach te dice lo que cambia y te avisa si no conviene.</p>
            <button onClick={hardness.onOpen} className="mt-2 flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-bold text-brand-orange hover:bg-brand-orange/20">
              <Flame size={13} strokeWidth={2.5} aria-hidden="true" /> Subir la dureza
            </button>
          </>
        ),
      });
    } else if (hardness.reason) {
      tiles.push({ id: 'dureza', value: 'No hoy', note: '', label: 'dureza', tone: 'muted', detail: <p>{hardness.reason}</p> });
    }
  }

  const c = session.competition;
  if (c && !c.eventDay && c.daysToEvent > 0) {
    tiles.push({
      id: 'competicion',
      value: `${c.daysToEvent} d`,
      note: c.simulacro ? 'simulacro' : PHASE_WORD[c.phase],
      label: 'competición',
      color: GOLD,
      tone: 'gold',
      detail: (
        <p>
          <b className="text-white">{c.label}.</b> {c.guidance}
        </p>
      ),
    });
  }

  if (painFlags.length > 0) {
    tiles.push({
      id: 'molestia',
      value: painFlags.length === 1 ? PAIN_AREA_LABEL[painFlags[0].area].split(' / ')[0] : `${painFlags.length} zonas`,
      note: 'molestia',
      label: 'activa',
      color: 'rgb(var(--c-state-mid))',
      tone: 'alert',
      detail: (
        <>
          <p className="mb-2 flex items-start gap-1.5">
            <Wrench size={13} strokeWidth={2.25} className="mt-0.5 shrink-0" aria-hidden="true" />
            El coach evita los movimientos que cargan esa zona.
          </p>
          <PainChips flags={painFlags} onRemove={onRemovePain} />
        </>
      ),
    });
  }

  if (tiles.length === 0) return null;
  const opened = tiles.find((t) => t.id === open);
  const tight = tiles.length >= 5;

  return (
    <div className="sm:max-w-xl">
      <div className="grid gap-1.5 text-center" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
        {tiles.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
            className={`min-w-0 rounded-xl border-[1.5px] px-1 pb-2 pt-2.5 transition-colors ${open === t.id ? 'border-brand-gold' : 'border-transparent'} ${
              t.tone === 'alert' ? 'bg-warn/10' : t.tone === 'gold' ? 'bg-brand-gold/10' : 'bg-white/[0.05] hover:bg-white/[0.08]'
            }`}
          >
            <span className={`num block truncate font-extrabold leading-tight ${tight ? 'text-[13px]' : 'text-[15px]'} ${t.tone === 'muted' ? 'text-neutral-500' : 'text-white'}`} style={t.tone === 'gold' ? { color: GOLD } : undefined}>
              {t.value}
              {t.dot && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: GOLD }} aria-hidden="true" />}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-bold leading-tight text-neutral-400" style={t.color ? { color: t.color } : undefined}>
              {t.note || ' '}
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-neutral-500">{t.label}</span>
          </button>
        ))}
      </div>
      {opened && <div className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-neutral-300">{opened.detail}</div>}
    </div>
  );
}
