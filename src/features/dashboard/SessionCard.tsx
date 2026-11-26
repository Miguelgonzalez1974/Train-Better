import { Component, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronRight, Clock, History, Minus, Plus, Timer, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { CardEffort, CardFigure, CardLine, SessionCardModel } from './sessionCardModel';
import type { EnergyItem } from './dayEnergy';
import { EnergyPill } from './EnergyPill';
import { ACCENT as EFFORT, OVER, PLAN } from './StrainRing';

const LINE_ICON: Record<CardLine['icon'], LucideIcon> = { history: History, up: TrendingUp, down: TrendingDown, same: Minus, alert: AlertCircle, plus: Plus, check: Check };

/** El peso de las últimas veces: una línea fina con el último punto marcado. Sin ejes: es para ver la tendencia de un vistazo. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 3 + (i * 38) / (values.length - 1);
  const y = (v: number) => (max === min ? 7 : 12 - ((v - min) / (max - min)) * 10);
  const last = values.length - 1;
  return (
    <svg viewBox="0 0 44 14" className="h-[14px] w-11 shrink-0" role="img" aria-label={`Peso de las últimas ${values.length} veces: ${values.join(', ')} kilos`}>
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-white) / 0.4)' }} />
      <circle cx={x(last)} cy={y(values[last])} r="2.2" style={{ fill: 'rgb(var(--c-white))' }} />
    </svg>
  );
}

const RADIUS = 9;
const AROUND = 2 * Math.PI * RADIUS;

/** El anillo pequeño del esfuerzo, el mismo lenguaje que los aros de arriba: cuánto es (gris lo previsto, azul lo hecho, rojo si te pasas) y una marca en tu máximo de hoy. */
function EffortMini({ effort }: { effort: CardEffort }) {
  const color = effort.over ? OVER : effort.planned ? PLAN : EFFORT;
  const share = Math.max(0, Math.min(100, effort.value)) / 100;
  const mark = (Math.max(0, Math.min(100, effort.high)) / 100) * 2 * Math.PI - Math.PI / 2;
  const at = (r: number) => ({ x: 12 + r * Math.cos(mark), y: 12 + r * Math.sin(mark) });
  return (
    <span className="flex shrink-0 items-center gap-1.5" data-testid="session-effort">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r={RADIUS} fill="none" strokeWidth="3" style={{ stroke: 'rgb(var(--c-white) / 0.1)' }} />
        <circle cx="12" cy="12" r={RADIUS} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${share * AROUND} ${AROUND}`} transform="rotate(-90 12 12)" style={{ stroke: color }} />
        <line x1={at(6.4).x} y1={at(6.4).y} x2={at(11.8).x} y2={at(11.8).y} strokeWidth="1.4" style={{ stroke: 'rgb(var(--c-white) / 0.75)' }} />
      </svg>
      <span className="num text-[15px] font-semibold leading-none" style={{ color }}>
        {effort.planned ? '~' : ''}
        {effort.value}
      </span>
      <span className={`text-[11px] ${effort.over ? 'font-semibold' : 'text-neutral-500'}`} style={effort.over ? { color: OVER } : undefined}>
        {effort.label}
      </span>
    </span>
  );
}

function Figure({ figure, first }: { figure: CardFigure; first: boolean }) {
  const wod = figure.kind === 'wod';
  return (
    <span className={`min-w-0 ${first ? 'pr-2.5' : 'border-l border-white/[0.12] pl-[11px]'}`} data-testid="session-figure">
      <span
        className={`num block font-semibold ${wod ? 'line-clamp-2 text-[12.5px] leading-[19.5px]' : 'truncate text-[15px] leading-[19.5px]'} ${figure.tone === 'muted' ? '' : 'text-white'}`}
        style={figure.tone === 'muted' ? { color: PLAN } : undefined}
      >
        {figure.value}
      </span>
      <span className="mt-px flex items-start gap-1 text-[11px] leading-snug text-neutral-500">
        {wod && <Timer size={11} strokeWidth={2.25} className="mt-[2px] shrink-0" aria-hidden="true" />}
        <span className="line-clamp-2">{figure.label}</span>
      </span>
    </span>
  );
}

/** Si pintar la tarjeta fallara (un dato guardado inesperado), en su sitio queda una fila sencilla y el resto del Resumen sigue funcionando. */
class CardGuard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('La tarjeta de sesión no se pudo pintar:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface SessionCardProps {
  model: SessionCardModel;
  /** Lo que la sesión restará de energía; solo se enseña antes de hacerla. */
  energy?: EnergyItem;
  onOpenPlan: () => void;
  onOpenDone: () => void;
}

/** Lo que restará de energía la sesión si la haces como está planteada. Discontinua porque aún no ha pasado. */
function PlannedEnergy({ energy }: { energy: EnergyItem }) {
  return (
    <span className="flex w-full items-center justify-between gap-2 text-[11px] text-neutral-500" data-testid="session-energy">
      <span>Energía</span>
      <EnergyPill cost={energy.cost} planned small />
    </span>
  );
}

/**
 * La tarjeta de sesión del Resumen: título con el esfuerzo, dos columnas (peso y WOD) y una sola línea más con los minutos. Casi todo en blanco y
 * gris: el color solo aparece cuando significa algo (azul = lo hecho, rojo = te pasas, ámbar = el coach ha cambiado la sesión). Toda la tarjeta se toca.
 */
export function SessionCard(props: SessionCardProps) {
  const open = props.model.action === 'done' ? props.onOpenDone : props.onOpenPlan;
  return (
    <CardGuard
      key={`${props.model.kind}-${props.model.title}`}
      fallback={
        <button onClick={open} className="day-card w-full px-[13px] py-3 text-left text-[13px] font-semibold text-white" data-testid="session-card" data-kind="fallback">
          Tu sesión · toca para verla
        </button>
      }
    >
      <CardBody {...props} />
    </CardGuard>
  );
}

function CardBody({ model, energy, onOpenPlan, onOpenDone }: SessionCardProps) {
  const done = model.kind === 'done';
  const open = model.action === 'plan' ? onOpenPlan : model.action === 'done' ? onOpenDone : null;
  const { figures, line, meta, effort } = model;
  const LineIcon = line ? LINE_ICON[line.icon] : Clock;
  const hasFigures = figures.length > 0;
  // Los minutos van al final de la última línea; sin cifras (descanso, sin sesión…) la explicación va bajo el título.
  const footer = Boolean(line) || (hasFigures && Boolean(meta));
  const withWod = figures.length === 2 && figures[1].kind === 'wod';

  const body = (
    <>
      <span className="flex w-full items-center gap-2">
        {done && <Check size={15} strokeWidth={3} className="shrink-0" style={{ color: EFFORT }} aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] font-semibold ${model.kind === 'missing' ? 'text-neutral-400' : 'text-white'}`}>{model.title}</span>
          {meta && !hasFigures && <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{meta}</span>}
        </span>
        {effort && <EffortMini effort={effort} />}
        {open && <ChevronRight size={14} className="-mr-0.5 shrink-0 text-neutral-600" aria-hidden="true" />}
      </span>
      {hasFigures && (
        <span className={`grid w-full ${withWod ? 'grid-cols-[minmax(0,0.75fr)_minmax(0,1.5fr)]' : figures.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {figures.map((f, i) => (
            <Figure key={`${i}-${f.value}`} figure={f} first={i === 0} />
          ))}
        </span>
      )}
      {footer && (
        <span className={`flex w-full items-center gap-[7px] border-t border-white/[0.08] pt-2 text-[11px] ${line?.warn ? 'text-warn' : 'text-neutral-400'}`} data-testid="session-line">
          <LineIcon size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{line ? line.text : meta}</span>
          {line?.spark && <Spark values={line.spark} />}
          {line && meta && hasFigures && <span className="shrink-0 whitespace-nowrap text-neutral-500">{meta}</span>}
        </span>
      )}
      {energy && !energy.done && energy.cost > 0 && <PlannedEnergy energy={energy} />}
    </>
  );

  const cls = 'day-card flex w-full flex-col gap-[9px] px-[13px] py-[11px] text-left';
  return open ? (
    <button onClick={open} className={`${cls} transition-colors duration-200`} data-testid="session-card" data-kind={model.kind}>
      {body}
    </button>
  ) : (
    <div className={cls} data-testid="session-card" data-kind={model.kind}>
      {body}
    </div>
  );
}
