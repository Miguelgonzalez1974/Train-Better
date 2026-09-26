import { Check, CircleAlert, CircleCheck, Dumbbell } from 'lucide-react';
import type { DayFlow as DayFlowData, FlowMeal } from '../../engine/dayFlow';

const AXIS_START = 7;
const AXIS_END = 23;

const pos = (hour: number) => Math.max(0, Math.min(100, ((hour - AXIS_START) / (AXIS_END - AXIS_START)) * 100));

function fmt(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round(((hour - h) * 60) / 15) * 15;
  return m === 60 ? `${String(h + 1).padStart(2, '0')}:00` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.07) 4px 8px)';

interface MacroBarProps {
  label: string;
  meals: FlowMeal[];
  value: (m: FlowMeal) => number;
  doneTotal: number;
  plannedTotal: number;
  fillClass: string;
}

/** Una barra por macro, partida en un trozo por comida (del tamaño de lo que aporta): en color las hechas, con trama las previas al entreno aún sin hacer. */
function MacroBar({ label, meals, value, doneTotal, plannedTotal, fillClass }: MacroBarProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="num text-xs text-neutral-400">
          <b className="text-white">{doneTotal}</b> / {plannedTotal} g
        </span>
      </div>
      <div className="mt-1 flex h-6 gap-0.5" role="img" aria-label={`${label}: ${doneTotal} de ${plannedTotal} gramos`}>
        {meals.map((m) => {
          const v = value(m);
          const pre = m.beforeTraining === true && !m.done;
          return (
            <div
              key={m.key}
              title={`${m.label}: ${v} g${m.done ? ' (hecha)' : ''}`}
              style={{ flex: `${Math.max(v, 1)} 1 0`, backgroundImage: pre ? HATCH : undefined }}
              className={`flex min-w-0 items-center justify-center overflow-hidden rounded-md text-[10px] transition-colors duration-300 ${
                m.done ? `${fillClass} font-semibold text-black/80` : 'border border-white/10 bg-white/[0.03] text-neutral-500'
              }`}
            >
              {plannedTotal > 0 && (v / plannedTotal) * 100 > 9 ? v : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const g = (n: number) => `${n} g`;

/**
 * "Línea del día" (ver `engine/dayFlow.ts`): las cinco comidas en su hora sobre un eje de 07:00 a 23:00, con el entreno
 * como línea de corte y "ahora" si es hoy; debajo, dos barras (proteína e hidratos) partidas por comida y un resumen de
 * lo de antes y después del entreno con un aviso suave. Lo hecho es lo que el atleta marcó como hecho.
 */
export function DayFlow({ flow }: { flow: DayFlowData }) {
  const { meals, trainingHour, nowHour } = flow;

  return (
    <div className="flex flex-col gap-3">
      {/* Eje del día */}
      <div>
        <div className="relative mx-3 h-[4.25rem]" role="img" aria-label="Las cinco comidas del día en su hora">
          <div className="absolute inset-x-0 top-8 h-0.5 rounded-full bg-white/15" />
          {trainingHour !== null && (
            <div className="absolute bottom-2 top-0 border-l-2 border-dashed border-brand-orange/80" style={{ left: `${pos(trainingHour)}%` }}>
              <span className="absolute -top-0.5 left-1.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-brand-orange">
                <Dumbbell size={10} aria-hidden="true" /> {fmt(trainingHour)}
              </span>
            </div>
          )}
          {nowHour !== null && (
            <div className="absolute bottom-3 top-4 w-0.5 rounded-full bg-white/50" style={{ left: `${pos(nowHour)}%` }}>
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">ahora</span>
            </div>
          )}
          {meals.map((m) => (
            <div key={m.key} className="absolute top-[1.4rem]" style={{ left: `${pos(m.hour)}%` }}>
              <span
                className={`-ml-2.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-white transition-colors duration-300 ${
                  m.done ? 'border-emerald-400 bg-emerald-400' : 'border-white/30 bg-brand-surface'
                }`}
                title={`${m.label} · ${fmt(m.hour)}${m.done ? ' · hecha' : ''}`}
              >
                {m.done && <Check size={11} strokeWidth={3.5} className="text-black" aria-hidden="true" />}
              </span>
              <span className="num absolute left-0 top-6 -translate-x-1/2 whitespace-nowrap text-[9px] text-neutral-500">{fmt(m.hour)}</span>
            </div>
          ))}
        </div>
        <div className="mx-3 mt-0.5 flex justify-between text-[10px] text-neutral-600">
          <span>07:00</span>
          <span>15:00</span>
          <span>23:00</span>
        </div>
      </div>

      <MacroBar label="Proteína" meals={meals} value={(m) => m.protein} doneTotal={flow.done.protein} plannedTotal={flow.planned.protein} fillClass="bg-red-400" />
      <MacroBar label="Hidratos" meals={meals} value={(m) => m.carbs} doneTotal={flow.done.carbs} plannedTotal={flow.planned.carbs} fillClass="bg-brand-gold" />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" aria-hidden="true" /> hecha
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border border-white/20" aria-hidden="true" /> prevista
        </span>
        {trainingHour !== null && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-white/20" style={{ backgroundImage: HATCH }} aria-hidden="true" /> previa al entreno
          </span>
        )}
      </p>

      {/* Resumen antes / después */}
      {flow.before && flow.after ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Antes de entrenar</p>
            <p className="num mt-0.5 text-sm text-neutral-200">
              <b className="text-white">{flow.before.done.carbs}</b> / {g(flow.before.planned.carbs)} hid.
            </p>
            <p className="num text-sm text-neutral-200">
              <b className="text-white">{flow.before.done.protein}</b> / {g(flow.before.planned.protein)} prot.
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Después</p>
            <p className="num mt-0.5 text-sm text-neutral-200">
              quedan <b className="text-white">{g(flow.after.remaining.carbs)}</b> hid.
            </p>
            <p className="num text-sm text-neutral-200">
              quedan <b className="text-white">{g(flow.after.remaining.protein)}</b> prot.
            </p>
          </div>
        </div>
      ) : null}

      <FlowMessage flow={flow} />
      <p className="text-[11px] leading-relaxed text-neutral-600">
        Cuenta lo que marques como hecho. Las horas y las cantidades son orientativas, y solo cuentan proteína e hidratos.
      </p>
    </div>
  );
}

function FlowMessage({ flow }: { flow: DayFlowData }) {
  if (flow.status === 'atrasado') {
    const parts = [flow.missed.carbs >= 20 ? `${flow.missed.carbs} g de hidratos` : '', flow.missed.protein >= 12 ? `${flow.missed.protein} g de proteína` : ''].filter(Boolean);
    return (
      <p className="flex items-start gap-2 rounded-lg bg-brand-gold/10 px-3 py-2 text-sm text-brand-gold" role="status">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Vas algo por detrás: te faltan unos {parts.join(' y ')} de las comidas que ya tocaban. Una toma ligera (fruta, tostada) te pone al día antes de entrenar.
      </p>
    );
  }
  if (flow.status === 'al-dia') {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
        <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Vas al día para entrenar.
      </p>
    );
  }
  if (flow.status === 'despues' && flow.after) {
    const { carbs, protein } = flow.after.remaining;
    return (
      <p className="flex items-start gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-neutral-300" role="status">
        <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
        {carbs + protein === 0
          ? 'Recuperación completada: has hecho todas las comidas de después del entreno.'
          : `Ahora toca recuperar: te quedan ${carbs} g de hidratos y ${protein} g de proteína por tomar.`}
      </p>
    );
  }
  return null;
}
