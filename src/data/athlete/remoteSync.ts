import { supabase } from '../../lib/supabaseClient';
import type { AthleteProfile, Goal, SessionHistoryEntry } from './types';
import { DEFAULT_PROFILE } from './types';
import { localAthleteRepository } from './localRepository';
import { mergeHistory, mergeProfile } from './mergeProfile';

interface AthleteRow {
  user_id: string;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  /** @deprecated los objetivos viven ahora en `profile.goals`. Se sigue enviando `null` para no tocar la columna. */
  goal: Goal | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'error';
let syncStatus: SyncStatus = 'idle';
const statusListeners = new Set<(s: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}
/** Suscribe a los cambios de estado de sincronizacion (para un indicador en la UI). Devuelve la baja. */
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(syncStatus);
  return () => statusListeners.delete(fn);
}
function setStatus(s: SyncStatus): void {
  if (s === syncStatus) return;
  syncStatus = s;
  for (const fn of statusListeners) fn(s);
}

/** Perfil remoto normalizado (los campos que falten se rellenan con el default, como hace migrateProfile). */
function normalizeRemote(profile: AthleteProfile | null | undefined, goalColumn: Goal | null): AthleteProfile {
  const p: AthleteProfile = { ...DEFAULT_PROFILE, ...(profile ?? {}) };
  if (!p.goals || p.goals.length === 0) {
    p.goals = goalColumn ? [{ ...goalColumn, id: goalColumn.id ?? 'legacy' }] : (p.goals ?? []);
  }
  return p;
}

async function readRemoteRow(userId: string): Promise<{ profile: AthleteProfile; history: SessionHistoryEntry[]; goal: Goal | null } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('athlete_data').select('profile, history, goal').eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('No se pudo leer datos remotos de Supabase:', error.message);
    throw error;
  }
  if (!data) return null;
  return { profile: data.profile as AthleteProfile, history: (data.history as SessionHistoryEntry[]) ?? [], goal: (data.goal as Goal | null) ?? null };
}

/**
 * El nucleo de la sincronizacion: lee lo remoto, lo FUSIONA con lo local (ver `mergeProfile`) y sube
 * el resultado — y ademas guarda la fusion en local para que este dispositivo converja. Nunca hace
 * un `upsert` ciego del local: eso perdia los cambios que hubiera hecho el otro dispositivo.
 */
async function flushPush(): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: true };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true };

  const localProfile = localAthleteRepository.getProfile();
  const localHistory = localAthleteRepository.getHistory();

  let remote: Awaited<ReturnType<typeof readRemoteRow>>;
  try {
    remote = await readRemoteRow(user.id);
  } catch {
    setStatus('error');
    return { ok: false };
  }

  const mergedProfile = remote ? mergeProfile(normalizeRemote(remote.profile, remote.goal), localProfile) : localProfile;
  const mergedHistory = remote ? mergeHistory(remote.history, localHistory) : localHistory;

  // Converge el local a la fusion antes de subir — asi este dispositivo ya tiene lo del otro aunque el upsert falle.
  localAthleteRepository.saveProfile(mergedProfile);
  localAthleteRepository.replaceHistory(mergedHistory);

  const row: AthleteRow = { user_id: user.id, profile: localAthleteRepository.getProfile(), history: mergedHistory, goal: null };
  const { error } = await supabase.from('athlete_data').upsert(row);
  if (error) {
    console.error('No se pudo sincronizar con Supabase:', error.message);
    setStatus('error');
    return { ok: false };
  }
  setStatus('idle');
  return { ok: true };
}

// Serializa y agrupa: N escrituras rapidas (p.ej. 5 `saveWorkSet` seguidos en el modo entreno) no
// disparan 5 flushes que compiten entre si — se colapsan en 1-2, cada uno leyendo el estado local mas
// reciente al ejecutarse.
let chain: Promise<{ ok: boolean }> = Promise.resolve({ ok: true });
let coalesced = false;

export function pushRemote(): Promise<{ ok: boolean }> {
  coalesced = true;
  setStatus('syncing');
  chain = chain.then(
    async () => {
      if (!coalesced) return { ok: true };
      coalesced = false;
      try {
        return await flushPush();
      } catch (e) {
        console.error('Fallo al sincronizar:', e);
        setStatus('error');
        return { ok: false };
      }
    },
    // Si el eslabon anterior rechazo, no propagar el rechazo — la cadena tiene que seguir viva.
    () => ({ ok: false }),
  );
  return chain;
}

/**
 * Sube el local pisando lo remoto SIN fusionar — solo para operaciones que son un borrado
 * deliberado y global (p.ej. `resetTrainingData`), donde fusionar reviviria justo lo que se acaba
 * de borrar.
 */
export async function pushRemoteReplace(): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: true };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true };
  setStatus('syncing');
  const row: AthleteRow = {
    user_id: user.id,
    profile: localAthleteRepository.getProfile(),
    history: localAthleteRepository.getHistory(),
    goal: null,
  };
  const { error } = await supabase.from('athlete_data').upsert(row);
  if (error) {
    console.error('No se pudo sincronizar con Supabase:', error.message);
    setStatus('error');
    return { ok: false };
  }
  setStatus('idle');
  return { ok: true };
}

/**
 * Al iniciar sesion: fusiona lo remoto con lo local (por si este dispositivo hizo cambios sin
 * conexion antes de entrar) en vez de sobreescribir a ciegas, guarda la fusion y la sube. Si no hay
 * fila remota, sube lo local para arrancar.
 */
export async function pullRemoteOrSeed(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let remote: Awaited<ReturnType<typeof readRemoteRow>>;
  try {
    remote = await readRemoteRow(user.id);
  } catch {
    return;
  }

  if (!remote) {
    await pushRemote();
    return;
  }

  const local = localAthleteRepository.getProfile();
  const mergedProfile = mergeProfile(normalizeRemote(remote.profile, remote.goal), local);
  const mergedHistory = mergeHistory(remote.history, localAthleteRepository.getHistory());
  localAthleteRepository.saveProfile(mergedProfile);
  localAthleteRepository.replaceHistory(mergedHistory);
  await pushRemote();
}
