import { supabase } from '../../lib/supabaseClient';
import type { AthleteProfile, Goal, SessionHistoryEntry } from './types';
import { localAthleteRepository } from './localRepository';

interface AthleteRow {
  user_id: string;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  goal: Goal | null;
}

/** Sube el estado local completo a la fila del usuario en Supabase (upsert). Silencioso: si falla, se reintenta en el proximo write. */
export async function pushRemote(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const row: AthleteRow = {
    user_id: user.id,
    profile: localAthleteRepository.getProfile(),
    history: localAthleteRepository.getHistory(),
    goal: localAthleteRepository.getGoal(),
  };

  const { error } = await supabase.from('athlete_data').upsert(row);
  if (error) console.error('No se pudo sincronizar con Supabase:', error.message);
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
    localAthleteRepository.saveProfile(data.profile);
    localAthleteRepository.replaceHistory(data.history ?? []);
    if (data.goal) localAthleteRepository.saveGoal(data.goal);
    else localAthleteRepository.clearGoal();
  } else {
    await pushRemote();
  }
}
