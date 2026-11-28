import { useState, type FormEvent } from 'react';
import { CalendarDays, ChevronRight, CircleCheck, Dumbbell, Info, Pencil, Timer, Trophy, X } from 'lucide-react';
import type { LevelSnapshot } from '../../engine/levelCategories';
import { ZONES } from '../../engine/levelReference';
import { PartGuard } from '../shell/PartGuard';
import { MiniCategoryRadar } from './CategoryRadar';
import type { LevelCardModel, LevelCardStep } from './myLevelModel';

/** Pesos creíbles: fuera de aquí casi seguro es un error al teclear. */
const WEIGHT_RANGE = [30, 250] as const;
const STAIR_HEIGHTS = [7, 10, 13, 16, 20];

const comma = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Los cinco escalones, de Principiante a Élite, encendidos hasta el tuyo. */
function Stairs({ zone }: { zone: number | null }) {
  return (
    <span className="mt-1.5 flex h-5 items-end gap-[3px]" role="img" aria-label={zone === null ? 'Sin escalón todavía' : `Escalón ${zone + 1} de ${ZONES.length}`} data-testid="my-level-stairs">
      {STAIR_HEIGHTS.map((height, i) => (
        <span key={height} className={`w-[9px] rounded-sm ${zone !== null && i <= zone ? 'bg-brand-orange' : 'bg-white/[0.1]'}`} style={{ height }} />
      ))}
    </span>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <>
      <span className="num line-clamp-2 block text-[15px] font-semibold leading-[19.5px] text-white">{value}</span>
      <span className="mt-px line-clamp-2 block text-[11px] leading-snug text-neutral-500">{label}</span>
    </>
  );
}

function StepStrip({ step }: { step: LevelCardStep }) {
  const Icon = step.tone === 'done' ? CircleCheck : step.timed ? Timer : Dumbbell;
  return (
    <span className="flex w-full items-center gap-2.5 rounded-lg bg-white/[0.05] px-2.5 py-2" data-testid="my-level-step" data-tone={step.tone}>
      <Icon size={20} strokeWidth={2.25} className={`shrink-0 ${step.tone === 'hold' ? 'text-neutral-500' : 'text-brand-orange'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`num block text-[13px] font-semibold leading-snug ${step.tone === 'today' ? 'text-brand-orange' : 'text-white'}`}>{step.title}</span>
        <span className="mt-px block text-[11px] leading-snug text-neutral-400">{step.text}</span>
      </span>
    </span>
  );
}

function CardBody({ model, level, onOpen, onSaveWeight }: LevelSummaryCardProps) {
  const { overall, delta, filled, total, stairs, improve, weightKg, step, test, line } = model;
  const LineIcon = line.icon === 'trophy' ? Trophy : Info;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const kg = Number(draft.trim().replace(',', '.'));
  const valid = draft.trim() !== '' && Number.isFinite(kg) && kg >= WEIGHT_RANGE[0] && kg <= WEIGHT_RANGE[1];

  function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    onSaveWeight(Math.round(kg * 10) / 10);
    setEditing(false);
    setDraft('');
  }

  return (
    <div className="day-card relative flex w-full flex-col gap-[9px] px-[13px] py-[11px] text-left transition-colors duration-200" data-testid="my-level-card">
      {/* Toda la tarjeta abre «Tu nivel»; lo del peso va por encima. */}
      <button type="button" onClick={onOpen} className="absolute inset-0 rounded-[inherit]" aria-label="Abrir Tu nivel" data-testid="my-level-open" />
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">Tu nivel</span>
        <span className="-my-1.5 flex shrink-0 items-center [&>svg]:h-[26px] [&>svg]:w-[26px]">
          <MiniCategoryRadar categories={level.categories} />
        </span>
        <span className="num shrink-0 text-[15px] font-semibold leading-none text-white" data-testid="my-level-number">
          {overall ?? `${filled} de ${total}`}
        </span>
        {overall === null ? (
          <span className="shrink-0 text-[11px] text-neutral-500">categorías</span>
        ) : delta !== null ? (
          <span className={`shrink-0 text-[11px] ${delta > 0 ? 'text-good' : delta < 0 ? 'text-warn' : 'text-neutral-500'}`}>
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {Math.abs(delta)} en 3 meses
          </span>
        ) : null}
        <ChevronRight size={14} className="-mr-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
      </span>
      <span className="grid w-full grid-cols-3">
        <span className="min-w-0 pr-2.5" data-testid="my-level-figure">
          <Figure value={stairs.value} label={stairs.label} />
          <Stairs zone={stairs.zone} />
        </span>
        <span className="min-w-0 border-l border-white/[0.12] pl-[11px] pr-1" data-testid="my-level-figure">
          <Figure value={improve.value} label={improve.label} />
        </span>
        <span className="min-w-0 border-l border-white/[0.12] pl-[11px]" data-testid="my-level-figure">
          <Figure value={weightKg === null ? '—' : `${comma(weightKg)} kg`} label="tu peso" />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className={`relative z-10 mt-1.5 inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] ${editing ? 'border-brand-orange text-brand-orange' : 'border-white/20 text-white'}`}
            data-testid="my-level-weight-toggle"
          >
            {editing ? <X size={12} aria-hidden="true" /> : <Pencil size={12} aria-hidden="true" />}
            {editing ? 'Cerrar' : 'Apuntar'}
          </button>
        </span>
      </span>
      {editing && (
        <form onSubmit={save} className="relative z-10 flex flex-col gap-1.5" data-testid="my-level-weight-form">
          <span className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Peso de hoy (kg)"
              aria-label="Peso de hoy en kilos"
              className="h-9 w-full min-w-0 rounded-lg border border-brand-border bg-brand-bg px-3 text-[15px] text-white focus:border-brand-orange focus:outline-none"
            />
            <button type="submit" disabled={!valid} className="h-9 shrink-0 rounded-lg bg-brand-orange px-4 text-[13px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">
              Guardar
            </button>
          </span>
          <span className="text-[11px] text-neutral-500">Tu peso cambia los kilos que pide cada nivel.</span>
        </form>
      )}
      {step && <StepStrip step={step} />}
      <span className="flex w-full flex-col gap-1.5 border-t border-white/[0.08] pt-2 text-[11px] text-neutral-400">
        {test && (
          <span className="flex w-full items-start gap-[7px]" data-testid="my-level-test">
            <CalendarDays size={13} strokeWidth={2.25} className="mt-px shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-white">{test.text}</span>
              {test.when && <span>{test.when}</span>}
            </span>
          </span>
        )}
        <span className="flex w-full items-center gap-[7px]" data-testid="my-level-line">
          <LineIcon size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{line.text}</span>
        </span>
      </span>
    </div>
  );
}

interface LevelSummaryCardProps {
  model: LevelCardModel;
  level: LevelSnapshot;
  onOpen: () => void;
  onSaveWeight: (kg: number) => void;
}

/** La tarjeta «Tu nivel»: tus mediciones de un vistazo. Al tocarla se abre su pantalla con los chips (`LevelScreen`). */
export function LevelSummaryCard(props: LevelSummaryCardProps) {
  return (
    <PartGuard
      name="la tarjeta Tu nivel"
      fallback={
        <button onClick={props.onOpen} className="day-card w-full px-[13px] py-3 text-left text-[13px] font-semibold text-white" data-testid="my-level-card">
          Tu nivel · toca para verlo
        </button>
      }
    >
      <CardBody {...props} />
    </PartGuard>
  );
}
