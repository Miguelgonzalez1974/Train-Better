import { useState } from 'react';
import { X } from 'lucide-react';
import type { AthleteProfile, PersonalRecords, VariantPersonalRecords } from '../../data/athlete/types';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { pushRemote } from '../../data/athlete/remoteSync';
import { getActivePainFlags, PAIN_AREA_LABEL } from '../../engine/painFlags';
import { toLocalIsoDate } from '../../engine/periodization';

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

const VARIANT_PR_FIELDS: { key: keyof VariantPersonalRecords; label: string }[] = [
  { key: 'sumoDeadlift', label: 'Sumo Deadlift' },
  { key: 'pushPress', label: 'Push Press' },
  { key: 'splitJerk', label: 'Split Jerk' },
  { key: 'overheadSquat', label: 'Overhead Squat' },
  { key: 'powerSnatch', label: 'Power Snatch' },
  { key: 'powerClean', label: 'Power Clean' },
];

type WodSourceId = NonNullable<AthleteProfile['wodSources']>[number];

/** Las programaciones que se pueden marcar; "Clásicos" incluye también las piezas de programaciones menores. */
const WOD_SOURCE_OPTIONS: { key: string; label: string; sources: WodSourceId[] }[] = [
  { key: 'pushjerk', label: 'PushJerk', sources: ['pushjerk'] },
  { key: 'mayhem', label: 'CrossFit Mayhem', sources: ['mayhem'] },
  { key: 'comptrain', label: 'CompTrain', sources: ['comptrain'] },
  { key: 'invictus', label: 'CrossFit Invictus', sources: ['invictus'] },
  { key: 'clasicos', label: 'Clásicos (Girls, Heroes, Open)', sources: ['clasicos', 'otros'] },
];

const inputClass =
  'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

interface PerfilRapidoProps {
  profile: AthleteProfile;
  onSave: (profile: AthleteProfile) => void;
  onRemovePainFlag: (id: string) => void;
}

export function PerfilRapido({ profile, onSave, onRemovePainFlag }: PerfilRapidoProps) {
  const [draft, setDraft] = useState<AthleteProfile>(profile);
  const [resetting, setResetting] = useState(false);
  const activePainFlags = getActivePainFlags(profile.painFlags, toLocalIsoDate(new Date()));

  function handlePrChange(key: keyof PersonalRecords, value: string) {
    const parsed = Number(value);
    setDraft((prev) => ({ ...prev, prs: { ...prev.prs, [key]: Number.isFinite(parsed) ? parsed : 0 } }));
  }

  function handleVariantPrChange(key: keyof VariantPersonalRecords, value: string) {
    const parsed = Number(value);
    setDraft((prev) => ({ ...prev, variantPrs: { ...prev.variantPrs, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined } }));
  }

  // Sin lista guardada valen todas. "Clásicos" agrupa los clásicos y el resto de programaciones sueltas.
  const selectedWodSources = WOD_SOURCE_OPTIONS.filter((o) => !draft.wodSources || o.sources.some((s) => draft.wodSources!.includes(s))).map((o) => o.key);

  function toggleWodSource(key: string) {
    const next = selectedWodSources.includes(key) ? selectedWodSources.filter((k) => k !== key) : [...selectedWodSources, key];
    if (next.length === 0) return; // siempre queda al menos una
    const sources = next.length === WOD_SOURCE_OPTIONS.length ? undefined : WOD_SOURCE_OPTIONS.filter((o) => next.includes(o.key)).flatMap((o) => o.sources);
    setDraft((prev) => ({ ...prev, wodSources: sources }));
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

      <div>
        <p className="mb-2 text-xs text-neutral-500">
          Opcional — rellena solo si tienes una marca propia y distinta a la del levantamiento base (Sumo Deadlift/Push
          Press/Split Jerk en Conjugado; Overhead Squat, Power Snatch y Power Clean como movimientos independientes).
          Mientras no pongas un número aquí, el coach no calcula ningún peso a partir de un PR que no le corresponde a ese
          movimiento.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {VARIANT_PR_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-xs text-neutral-400">
              {field.label} (kg)
              <input
                type="number"
                min={0}
                step={2.5}
                placeholder="—"
                value={draft.variantPrs?.[field.key] ?? ''}
                onChange={(e) => handleVariantPrChange(field.key, e.target.value)}
                className={inputClass}
              />
            </label>
          ))}
        </div>
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
        Reparto de la fuerza
        <select
          value={draft.strengthSplit ?? 'weekly'}
          onChange={(e) => setDraft((prev) => ({ ...prev, strengthSplit: e.target.value as NonNullable<AthleteProfile['strengthSplit']> }))}
          className={`w-full sm:w-72 ${inputClass}`}
        >
          <option value="weekly">Semanal por días</option>
          <option value="adaptive">Adaptativo</option>
        </select>
        <span className="text-[11px] text-neutral-600">
          Semanal: cada día tiene su patrón fijo (piernas, pecho, hombro, peso muerto) con un complemento (p. ej. banca + remo); el sábado va al que más lo necesita. Adaptativo: el reparto se recalcula según la fase y tus objetivos.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-neutral-400">Programaciones de las que sale tu WOD</legend>
        <div className="flex flex-wrap gap-2">
          {WOD_SOURCE_OPTIONS.map((opt) => {
            const on = selectedWodSources.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWodSource(opt.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-neutral-500 hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-neutral-600">
          El coach elige el WOD de cada día entre las programaciones marcadas. Si dejas pocas, algún día puede recurrir a un WOD generado.
        </span>
      </fieldset>

      {activePainFlags.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Avisos de molestia activos</p>
          {activePainFlags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center gap-2 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-sm text-bad"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bad" />
              <span className="flex-1">
                {PAIN_AREA_LABEL[flag.area]} — {flag.until ? `hasta el ${flag.until}` : 'hasta que lo quites'}
              </span>
              <button
                type="button"
                onClick={() => onRemovePainFlag(flag.id)}
                title="Quitar aviso"
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors duration-200 hover:bg-bad/10 hover:text-bad"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <p className="text-xs text-neutral-600">Los avisos nuevos se crean desde Planificación, junto a la sesión de hoy.</p>
        </div>
      )}

      <p className="text-xs text-neutral-600">
        Tus macrociclos y objetivos se gestionan ahora en la pestaña "Objetivos".
      </p>
      <p className="text-[11px] text-neutral-600">Versión de la app: {__BUILD_ID__}</p>

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

      <div className="mt-2 rounded-lg border border-bad/20 bg-bad/5 p-3">
        <p className="text-xs text-neutral-400">
          Empezar en blanco: borra historial de sesiones, sesiones ya registradas y PRs, para elegir libremente el tipo de sesión
          sin datos previos condicionando al Coach IA.
        </p>
        <button
          type="button"
          onClick={handleResetTrainingData}
          disabled={resetting}
          className="mt-2 rounded-lg border border-bad/40 px-3 py-1.5 text-xs font-semibold text-bad transition-colors hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetting ? 'Borrando…' : 'Reiniciar datos de entrenamiento'}
        </button>
      </div>
    </form>
  );
}
