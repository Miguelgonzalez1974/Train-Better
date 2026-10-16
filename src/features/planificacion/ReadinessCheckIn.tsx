import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import {
  checkFromQuickAnswer,
  getReadinessFactor,
  scoreCheck,
  type CheckInAxis,
  type CheckInOverall,
} from '../../engine/readiness';
import { SectionLabel } from '../shell/SectionLabel';

const OVERALL: { value: CheckInOverall; label: string; color: string }[] = [
  { value: 'bien', label: 'Bien', color: 'rgb(var(--c-state-good))' },
  { value: 'normal', label: 'Normal', color: 'rgb(var(--c-state-mid))' },
  { value: 'mal', label: 'Mal', color: 'rgb(var(--c-state-low))' },
];

const AXES: { value: CheckInAxis; label: string }[] = [
  { value: 'sleep', label: 'Sueño' },
  { value: 'soreness', label: 'Agujetas' },
  { value: 'stress', label: 'Estrés' },
  { value: 'motivation', label: 'Motivación' },
];

const WORD: Record<CheckInOverall, string> = { bien: 'bien', normal: 'normal', mal: 'justo' };

function overallOf(check: ReadinessCheck): CheckInOverall {
  const s = scoreCheck(check);
  return s >= 2 ? 'bien' : s <= -2 ? 'mal' : 'normal';
}

interface CheckInSummaryProps {
  dateIso: string;
  log: ReadinessCheck[];
  /** El check-in de hoy ya guardado. */
  existing: ReadinessCheck;
  /** Si está corrigiéndolo: en vez de la línea sale la pregunta otra vez. */
  editing: boolean;
  onEdit: () => void;
  onConfirm: (check: ReadinessCheck) => void;
  onCancel: () => void;
}

/**
 * Lo contestado en el check-in, en una línea ("Llegas bien · Carga de hoy +4 %") con un "Cambiar" que
 * vuelve a abrir la pregunta. El Resumen la enseña unos segundos tras contestar y luego vive en la pestaña Preparación.
 */
export function CheckInSummary({ dateIso, log, existing, editing, onEdit, onConfirm, onCancel }: CheckInSummaryProps) {
  if (editing) return <ReadinessCheckIn dateIso={dateIso} log={log} onConfirm={onConfirm} onSkip={onCancel} skipLabel="Cancelar" />;
  const { factor } = getReadinessFactor(existing);
  const pct = Math.round((factor - 1) * 100);
  const o = overallOf(existing);
  const color = OVERALL.find((x) => x.value === o)!.color;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        Llegas <span className="font-semibold text-neutral-200">{WORD[o]}</span>
      </span>
      <span>{pct === 0 ? 'Carga de hoy sin cambios' : `Carga de hoy ${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`}</span>
      <button onClick={onEdit} className="ml-auto text-neutral-500 underline-offset-2 transition-colors hover:text-white hover:underline">
        Cambiar
      </button>
    </div>
  );
}

interface ReadinessCheckInProps {
  dateIso: string;
  log: ReadinessCheck[];
  onConfirm: (check: ReadinessCheck) => void;
  onSkip: () => void;
  /** Texto del botón de arriba a la derecha ("Ahora no" al contestar; "Cancelar" al corregir). */
  skipLabel?: string;
}

/**
 * Check-in diario en una tira, sin ventana: un toque (Bien / Normal / Mal) y, solo si no vas bien,
 * marcas qué pesa. Nada viene preseleccionado — si no contestas, no se guarda nada. Ver
 * `checkFromQuickAnswer` para cómo se traduce a los 4 ejes que usa el motor.
 */
export function ReadinessCheckIn({ dateIso, log, onConfirm, onSkip, skipLabel = 'Ahora no' }: ReadinessCheckInProps) {
  const [overall, setOverall] = useState<CheckInOverall | null>(null);
  const [marked, setMarked] = useState<CheckInAxis[]>([]);
  const lastHours = [...log].reverse().find((c) => c.sleepHours !== undefined)?.sleepHours ?? 7;
  const [hours, setHours] = useState(lastHours);

  const needsDetail = overall === 'normal' || overall === 'mal';
  const toggle = (axis: CheckInAxis) => setMarked((m) => (m.includes(axis) ? m.filter((a) => a !== axis) : [...m, axis]));
  const confirm = (o: CheckInOverall) => onConfirm(checkFromQuickAnswer(dateIso, o, marked, hours));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <SectionLabel>¿Cómo llegas hoy?</SectionLabel>
        <button onClick={onSkip} className="text-xs text-neutral-500 transition-colors hover:text-neutral-300">
          {skipLabel}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OVERALL.map((opt) => {
          const selected = overall === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => (opt.value === 'bien' ? confirm('bien') : setOverall(opt.value))}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors duration-200 ${
                selected ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          );
        })}
      </div>
      {needsDetail && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-500">¿Qué es lo que más pesa? (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {AXES.map((a) => {
              const on = marked.includes(a.value);
              return (
                <button
                  key={a.value}
                  onClick={() => toggle(a.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                    on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-neutral-400 hover:bg-white/5'
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          {marked.includes('sleep') && (
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <span>Horas dormidas</span>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Menos horas"
                  onClick={() => setHours((h) => Math.max(2, h - 0.5))}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 hover:bg-white/5"
                >
                  <Minus size={13} />
                </button>
                <span className="num w-10 text-center text-sm font-semibold text-white">{String(hours).replace('.', ',')} h</span>
                <button
                  aria-label="Más horas"
                  onClick={() => setHours((h) => Math.min(12, h + 0.5))}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 hover:bg-white/5"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => overall && confirm(overall)}
            className="rounded-xl bg-brand-orange py-2.5 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
