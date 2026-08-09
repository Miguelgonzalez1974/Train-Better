import { supabase } from '../../lib/supabaseClient';
import type { AthleteProfile, Goal, SessionHistoryEntry } from './types';
import { localAthleteRepository } from './localRepository';

interface AthleteRow {
  user_id: string;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  /** @deprecated los objetivos viven ahora en `profile.goals`. Se sigue enviando `null` para no tocar la columna. */
  goal: Goal | null;
}

/**
 * Sube el estado local completo a la fila del usuario en Supabase (upsert). Los llamadores que
 * usan `void pushRemote()` como fire-and-forget ignoran el resultado (si falla, se reintenta en
 * el proximo write); `ok: false` existe para los que necesitan saber si de verdad se guardo antes
 * de hacer algo irreversible en base a ello (ej. recargar la pagina tras un reset de datos).
 */
export async function pushRemote(): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: true };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true };

  const row: AthleteRow = {
    user_id: user.id,
    profile: localAthleteRepository.getProfile(),
    history: localAthleteRepository.getHistory(),
    goal: null,
  };

  const { error } = await supabase.from('athlete_data').upsert(row);
  if (error) {
    console.error('No se pudo sincronizar con Supabase:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Al iniciar sesion: si el usuario ya tiene datos remotos, sobreescriben lo local (el otro
 * dispositivo manda). Si no hay fila remota todavia, sube lo que haya en este dispositivo
 * para arrancar la sincronizacion.
 */
export async function pullRemoteOrSeed(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase.from('athlete_data').select('profile, history, goal').eq('user_id', user.id).maybeSingle();

  if (error) {
    console.error('No se pudo leer datos remotos de Supabase:', error.message);
    return;
  }

  if (data) {
    // Filas remotas guardadas antes de soportar varios objetivos tenian el unico objetivo en su
    // propia columna — se pliega dentro del perfil para no perderlo al migrar.
    const profile: AthleteProfile = { ...data.profile };
    if (!profile.goals) {
      profile.goals = data.goal ? [{ ...data.goal, id: data.goal.id ?? 'legacy' }] : [];
    }
    localAthleteRepository.saveProfile(profile);
    localAthleteRepository.replaceHistory(data.history ?? []);
  } else {
    await pushRemote();
  }
}
