import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { RxOrScaled, WodScoreType } from '../../data/athlete/types';
import type { WodResultForm } from '../../engine/wodScoring';
import { WodResultField } from './WodResultField';
import { DurationStepper, RpePicker } from './SessionFeelFields';


type Part = 1 | 2;

interface CompleteSessionPanelProps {
  /** Partes de WOD de hoy (1, o 1 y 2 en un día de doble WOD). */
  wodParts: Part[];
  scoreTypes: Record<Part, WodScoreType | null>;
  /** Objetivo del coach de cada parte, ya formateado ("12:30", "5 rondas"...). */
  targets: Partial<Record<Part, string>>;
  forms: Record<Part, WodResultForm>;
  onFormChange: (part: Part, patch: Partial<WodResultForm>) => void;
  /** Presente solo en un día de test de 1RM. */
  test?: { movementName: string; loadKg: number; onChange: (kg: number) => void };
  rxOrScaled: RxOrScaled;
  onRxOrScaled: (value: RxOrScaled) => void;
  rpe: number;
  onRpe: (value: number) => void;
  durationMin: number;
  onDuration: (minutes: number) => void;
  /** Minutos que estimó el coach para la sesión — se enseña como referencia. */
  estimatedMin: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Cierre de sesión en dos pasos. Primero lo que ha pasado (resultado del WOD y test de 1RM — solo si
 * hoy había), después cómo lo has sentido (RPE, Rx o escalado y duración, ya estimada). Un día
 * normal de fuerza se queda en un único paso: un toque de RPE y guardar.
 */
export function CompleteSessionPanel({
  wodParts,
  scoreTypes,
  targets,
  forms,
  onFormChange,
  test,
  rxOrScaled,
  onRxOrScaled,
  rpe,
  onRpe,
  durationMin,
  onDuration,
  estimatedMin,
  onConfirm,
  onCancel,
}: CompleteSessionPanelProps) {
  const resultParts = wodParts.filter((p) => scoreTypes[p]);
  const hasResultStep = resultParts.length > 0 || Boolean(test);
  const [step, setStep] = useState<0 | 1>(hasResultStep ? 0 : 1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Al abrirse el panel (y al pasar de paso, que cambia su altura) se centra en pantalla: el botón que
  // lo abre está justo debajo y, si venimos del modo foco, la vista podía estar en cualquier otro punto.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [step]);

  const isDouble = wodParts.length > 1;

  return (
    <div ref={rootRef} className="card mb-14 flex flex-col gap-4 border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        {hasResultStep ? (
          <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Pasos">
            {(['Resultado', 'Sensaciones'] as const).map((label, i) => {
              const done = step > i;
              const current = step === i;
              return (
                <li key={label} className="flex items-center gap-2">
                  {i > 0 && <span className={`h-px w-5 ${step >= i ? 'bg-brand-orange' : 'bg-white/15'}`} />}
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      done ? 'bg-brand-orange text-black' : current ? 'bg-brand-orange/20 text-brand-orange ring-1 ring-brand-orange' : 'bg-white/10 text-neutral-500'
                    }`}
                  >
                    {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={current ? 'text-white' : 'text-neutral-500'}>{label}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm font-semibold text-white">Cerrar sesión</p>
        )}
        <button
          onClick={onCancel}
          title="Cancelar"
          aria-label="Cancelar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
        >
          <X size={16} />
        </button>
      </div>

      {step === 0 && (
        <div key="resultado" className="flex animate-section-in flex-col gap-4 motion-reduce:animate-none">
          <p className="text-lg font-semibold text-white">¿Cómo te fue?</p>

          {resultParts.map((part) => (
            <div key={part} className="rounded-xl bg-white/[0.03] p-3">
              <p className="mb-2 text-sm font-medium text-neutral-300">
                {isDouble ? `WOD · parte ${part} de 2` : 'WOD'}
                {targets[part] && <span className="ml-2 font-normal text-neutral-500">objetivo {targets[part]}</span>}
              </p>
              <WodResultField scoreType={scoreTypes[part]!} form={forms[part]} onChange={(patch) => onFormChange(part, patch)} />
            </div>
          ))}

          {test && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="mb-2 text-sm font-medium text-neutral-300">Test 1RM · {test.movementName}</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={2.5}
                  inputMode="decimal"
                  value={test.loadKg}
                  onChange={(e) => test.onChange(Number(e.target.value))}
                  className="w-20 rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white"
                />
                <span className="text-neutral-500">kg levantados</span>
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                Si supera tu marca actual, se actualiza tu PR y las próximas sesiones se calculan sobre el nuevo número.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setStep(1)} className="px-2 py-2 text-sm text-neutral-500 underline decoration-dotted transition-colors hover:text-neutral-200">
              Saltar
            </button>
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
            >
              Siguiente
              <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div key="sensaciones" className="flex animate-section-in flex-col gap-5 motion-reduce:animate-none">
          <div>
            <p className="mb-3 text-lg font-semibold text-white">¿Cómo lo has sentido?</p>
            <RpePicker value={rpe} onChange={onRpe} />
          </div>

          <DurationStepper value={durationMin} onChange={onDuration} hint={`El coach estimó ~${estimatedMin} min`} />

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-300">¿Lo hiciste como estaba escrito?</p>
            <div className="flex rounded-lg bg-white/5 p-0.5" role="radiogroup" aria-label="Rx o escalado">
              {(['rx', 'scaled'] as RxOrScaled[]).map((option) => (
                <button
                  key={option}
                  role="radio"
                  aria-checked={rxOrScaled === option}
                  onClick={() => onRxOrScaled(option)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    rxOrScaled === option ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'
                  }`}
                >
                  {option === 'rx' ? 'Rx' : 'Escalado'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            {hasResultStep ? (
              <button onClick={() => setStep(0)} className="flex items-center gap-1.5 px-2 py-2 text-sm text-neutral-400 transition-colors hover:text-white">
                <ArrowLeft size={15} />
                Atrás
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
            >
              <Check size={15} strokeWidth={3} />
              Guardar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
