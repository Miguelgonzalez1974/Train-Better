import { useMemo, useState } from 'react';
import { ChevronLeft, Dumbbell, CalendarRange, Sparkles, ClipboardList } from 'lucide-react';
import type { PersonalRecords } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { toLocalIsoDate } from '../../engine/periodization';
import { PR_ROWS } from '../dashboard/PersonalRecordsCard';

interface OnboardingWizardProps {
  /** Se llama al terminar o saltar — el padre deja de renderizar el asistente. */
  onDone: () => void;
}

const DAY_OPTIONS: (3 | 4 | 5 | 6)[] = [3, 4, 5, 6];
const WEEK_OPTIONS = [8, 10, 12, 16, 20];

function nextMondayIso(): string {
  const d = new Date();
  const daysUntilMon = (1 - d.getDay() + 7) % 7; // 0 si hoy es lunes
  d.setDate(d.getDate() + daysUntilMon);
  return toLocalIsoDate(d);
}

function addWeeksIso(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toLocalIsoDate(d);
}

const longDate = (iso: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));

const numInput =
  'w-full rounded-lg border border-brand-border bg-brand-bg px-2 py-2 text-center text-base font-semibold text-white transition-colors focus:border-brand-gold focus:outline-none';

/**
 * Asistente de primera vez: reúne en un flujo lo que antes estaba repartido entre "Tu perfil"
 * (PRs + días/semana) y "Objetivos" (el macrociclo). Se muestra desde `App.tsx` cuando el perfil no
 * tiene `onboardedAt` y aún no hay ningún macrociclo. Al terminar recarga la página para que el
 * resto de la app lea el perfil recién escrito sin estados obsoletos.
 */
export function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const initial = useMemo(() => athleteRepository.getProfile(), []);
  const [step, setStep] = useState(0);
  const [prs, setPrs] = useState<PersonalRecords>({ ...initial.prs });
  const [days, setDays] = useState<3 | 4 | 5 | 6>(initial.trainingDaysPerWeek);
  const [startDate, setStartDate] = useState(nextMondayIso());
  const [weeks, setWeeks] = useState(12);

  const endDate = addWeeksIso(startDate, weeks);
  const filledPrs = PR_ROWS.filter(({ key }) => (prs[key] ?? 0) > 0).length;
  const TOTAL = 5;

  function finish(skip: boolean) {
    const profile = athleteRepository.getProfile();
    if (skip) {
      athleteRepository.saveProfile({ ...profile, onboardedAt: new Date().toISOString() });
      onDone();
      return;
    }
    athleteRepository.saveProfile({
      ...profile,
      prs,
      trainingDaysPerWeek: days,
      macrocycles: [
        ...profile.macrocycles,
        { id: crypto.randomUUID(), label: 'Macrociclo 1', startDate, endDate },
      ],
      onboardedAt: new Date().toISOString(),
    });
    // Recarga para que Dashboard/Planificación relean el perfil nuevo desde cero.
    window.location.reload();
  }

  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-bg">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-8 pt-10">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-gold' : 'bg-white/10'}`} />
            ))}
          </div>
          <span className="shrink-0 text-[11px] text-neutral-500">
            {step + 1} / {TOTAL}
          </span>
        </div>

        <div className="flex-1">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-neon/15 text-brand-neon">
                <Sparkles size={22} strokeWidth={2.25} />
              </span>
              <h1 className="text-2xl font-bold text-white">Vamos a configurar tu entrenamiento</h1>
              <p className="text-sm leading-relaxed text-neutral-400">
                En un par de minutos dejamos lo básico listo: tus marcas actuales, cuántos días entrenas por semana y tu primer
                bloque. El coach se encarga del resto — periodización, WODs, progresiones y ajuste de cargas.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
                <Dumbbell size={22} strokeWidth={2.25} />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-white">Tus marcas</h1>
                <p className="mt-1 text-sm text-neutral-400">1RM aproximado en kg. Pon las que sepas — el resto se ajustan solas con los tests y tus series.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PR_ROWS.map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-1 text-xs text-neutral-500">
                    {label}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={2.5}
                      value={prs[key] || ''}
                      onChange={(e) => setPrs((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                      className={numInput}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
                <CalendarRange size={22} strokeWidth={2.25} />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-white">Tu semana</h1>
                <p className="mt-1 text-sm text-neutral-400">¿Cuántos días entrenas por semana? El coach reparte fuerza, oly y condición física en esos días.</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border py-3 transition-colors ${
                      days === d ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-300 hover:border-brand-gold/50'
                    }`}
                  >
                    <span className="text-xl font-bold">{d}</span>
                    <span className="text-[10px] text-neutral-500">días</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
                <ClipboardList size={22} strokeWidth={2.25} />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-white">Tu primer bloque</h1>
                <p className="mt-1 text-sm text-neutral-400">Un macrociclo — el coach lo divide en fases (acumulación, intensificación, pico, descarga) automáticamente.</p>
              </div>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Empieza el
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
                />
              </label>
              <div className="flex flex-col gap-1.5 text-xs text-neutral-500">
                Duración
                <div className="flex flex-wrap gap-2">
                  {WEEK_OPTIONS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setWeeks(w)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        weeks === w ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-300 hover:border-brand-gold/50'
                      }`}
                    >
                      {w} sem
                    </button>
                  ))}
                </div>
              </div>
              <p className="rounded-lg bg-brand-surfaceMuted/70 px-3 py-2 text-xs text-neutral-400">
                Termina el <span className="font-semibold text-neutral-200">{longDate(endDate)}</span>.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-neon/15 text-brand-neon">
                <Sparkles size={22} strokeWidth={2.25} />
              </span>
              <h1 className="text-2xl font-bold text-white">Todo listo</h1>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between rounded-lg bg-brand-surfaceMuted/70 px-3 py-2">
                  <span className="text-neutral-500">Marcas</span>
                  <span className="font-semibold text-white">{filledPrs} de 8</span>
                </div>
                <div className="flex justify-between rounded-lg bg-brand-surfaceMuted/70 px-3 py-2">
                  <span className="text-neutral-500">Días por semana</span>
                  <span className="font-semibold text-white">{days}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-brand-surfaceMuted/70 px-3 py-2">
                  <span className="text-neutral-500">Bloque</span>
                  <span className="font-semibold text-white">{weeks} semanas · desde {longDate(startDate)}</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                ¿Tienes un objetivo concreto (una dominada, un PR, una competición)? Añádelo cuando quieras en la pestaña
                Objetivos y el coach lo prioriza.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center gap-3">
          {step > 0 ? (
            <button
              onClick={back}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition-colors hover:bg-white/10"
              aria-label="Atrás"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <button onClick={() => finish(true)} className="text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-300">
              Saltar
            </button>
          )}
          <div className="flex-1" />
          {step < TOTAL - 1 ? (
            <button
              onClick={next}
              className="rounded-full bg-brand-orange px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-orange-dark"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={() => finish(false)}
              className="rounded-full bg-brand-neon px-6 py-3 text-sm font-bold text-black transition-colors"
            >
              Empezar a entrenar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
