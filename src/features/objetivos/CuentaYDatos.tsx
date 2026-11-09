import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { pushRemote } from '../../data/athlete/remoteSync';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { AdminInviteUser } from '../auth/AdminInviteUser';

/**
 * Cuenta y datos, al fondo de Objetivos y plegado: la versión de la app, cerrar sesión, invitar usuarios (solo el administrador) y
 * empezar en blanco. Antes vivían en la rueda de Planificación, mezclados con las marcas.
 */
export function CuentaYDatos() {
  const [resetting, setResetting] = useState(false);

  async function handleResetTrainingData() {
    const confirmed = window.confirm(
      'Esto borra tu historial de sesiones, la caché de sesiones generadas y el contador de días entrenados, y pone tus PRs a 0. Tus macrociclos, objetivos y peso corporal no se tocan. Es irreversible. ¿Seguro?',
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      athleteRepository.resetTrainingData();
      const { ok } = await pushRemote();
      if (!ok) {
        window.alert('Se reinició localmente, pero no se pudo sincronizar con el servidor. No recargues todavía o los datos antiguos podrían volver — inténtalo de nuevo cuando tengas conexión.');
        setResetting(false);
        return;
      }
      window.location.reload();
    } catch {
      setResetting(false);
    }
  }

  return (
    <details className="group rounded-xl bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-neutral-500 [&::-webkit-details-marker]:hidden">
        <span>Cuenta y datos</span>
        <ChevronDown size={14} strokeWidth={2.25} className="transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 px-3.5 pb-3.5 pt-1">
        <p className="text-[11px] text-neutral-500">Versión de la app: {__BUILD_ID__}</p>
        {isSupabaseConfigured && (
          <button onClick={() => supabase?.auth.signOut()} className="self-start text-xs text-neutral-400 underline decoration-dotted hover:text-neutral-200">
            Cerrar sesión
          </button>
        )}
        <AdminInviteUser />
        <div className="rounded-lg border border-bad/20 bg-bad/5 p-3">
          <p className="text-xs text-neutral-400">
            Empezar en blanco: borra historial de sesiones, sesiones ya registradas y PRs, para elegir libremente el tipo de sesión sin datos previos condicionando al coach.
          </p>
          <button
            onClick={handleResetTrainingData}
            disabled={resetting}
            className="mt-2 rounded-lg border border-bad/40 px-3 py-1.5 text-xs font-semibold text-bad transition-colors hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetting ? 'Borrando…' : 'Reiniciar datos de entrenamiento'}
          </button>
        </div>
      </div>
    </details>
  );
}
