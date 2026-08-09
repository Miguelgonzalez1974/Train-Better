import { useState } from 'react';
import type { AthleteProfile, PersonalRecords } from '../../data/athlete/types';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { pushRemote } from '../../data/athlete/remoteSync';

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
  const [resetting, setResetting] = useState(false);

  function handlePrChange(key: keyof PersonalRecords, value: string) {
    const parsed = Number(value);
    setDraft((prev) => ({ ...prev, prs: { ...prev.prs, [key]: Number.isFinite(parsed) ? parsed : 0 } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(draft);
  }

  async function handleResetTrainingData() {
    const confirmed = window.confirm(
      'Esto borra tu historial de sesiones, la caché de sesiones generadas y el contador de días entrenados, y pone tus PRs a 0. Tus macrociclos, objetivos y peso corporal no se tocan. Es irreversible. ¿Seguro?'
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      athleteRepository.resetTrainingData();
      const { ok } = await pushRemote();
      if (!ok) {
        window.alert(
          'Se reinició localmente, pero no se pudo sincronizar con el servidor. No recargues todavía o los datos antiguos podrían volver — inténtalo de nuevo cuando tengas conexión.'
        );
        setResetting(false);
        return;
      }
      window.location.reload();
    } catch {
      setResetting(false);
    }
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

      <p className="text-xs text-neutral-600">
        Tus macrociclos y objetivos se gestionan ahora en la pestaña "Objetivos".
      </p>

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

      <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <p className="text-xs text-neutral-400">
          Empezar en blanco: borra historial de sesiones, sesiones ya registradas y PRs, para elegir libremente el tipo de sesión
          sin datos previos condicionando al Coach IA.
        </p>
        <button
          type="button"
          onClick={handleResetTrainingData}
          disabled={resetting}
          className="mt-2 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetting ? 'Borrando…' : 'Reiniciar datos de entrenamiento'}
        </button>
      </div>
    </form>
  );
}
