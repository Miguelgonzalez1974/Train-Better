import { useState } from 'react';
import type { AthleteProfile, PersonalRecords } from '../../data/athlete/types';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';

const PR_FIELDS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'clean', label: 'Clean' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'cleanAndJerk', label: 'Clean & Jerk' },
];

const inputClass =
  'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

interface PerfilRapidoProps {
  profile: AthleteProfile;
  onSave: (profile: AthleteProfile) => void;
}

export function PerfilRapido({ profile, onSave }: PerfilRapidoProps) {
  const [draft, setDraft] = useState<AthleteProfile>(profile);

  function handlePrChange(key: keyof PersonalRecords, value: string) {
    const parsed = Number(value);
    setDraft((prev) => ({ ...prev, prs: { ...prev.prs, [key]: Number.isFinite(parsed) ? parsed : 0 } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-xs text-neutral-500">Tus marcas personales alimentan los pesos que calcula el Coach IA.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PR_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-xs text-neutral-400">
            {field.label} (kg)
            <input
              type="number"
              min={0}
              step={2.5}
              value={draft.prs[field.key]}
              onChange={(e) => handlePrChange(field.key, e.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Días de entrenamiento / semana
        <select
          value={draft.trainingDaysPerWeek}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, trainingDaysPerWeek: Number(e.target.value) as AthleteProfile['trainingDaysPerWeek'] }))
          }
          className={`w-40 ${inputClass}`}
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} días
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Inicio del macrociclo
        <input
          type="date"
          value={draft.mesocycleStartDate}
          onChange={(e) => setDraft((prev) => ({ ...prev, mesocycleStartDate: e.target.value }))}
          className={`w-40 ${inputClass}`}
        />
        <span className="text-neutral-600">Antes de esta fecha no se genera programación.</span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
        >
          Guardar perfil
        </button>
        {isSupabaseConfigured && (
          <button
            type="button"
            onClick={() => supabase?.auth.signOut()}
            className="text-xs text-neutral-500 underline decoration-dotted hover:text-neutral-300"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </form>
  );
}
