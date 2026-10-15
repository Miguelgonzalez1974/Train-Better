import { beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase simulado: una sola fila en memoria, con las mismas llamadas que usa remoteSync.
const remote = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remote.row, error: null }) }) }),
      upsert: async (r: Record<string, unknown>) => {
        remote.row = JSON.parse(JSON.stringify(r));
        return { error: null };
      },
    }),
  },
}));

// localStorage mínimo para el entorno de pruebas (node).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

import { localAthleteRepository } from './localRepository';
import { pullRemoteOrSeed, pushRemote } from './remoteSync';
import { DEFAULT_PROFILE } from './types';
import type { AthleteProfile, Macrocycle } from './types';

const macro = (id: string): Macrocycle => ({ id, label: id, startDate: '2026-01-05', endDate: '2026-06-01' });
const remoteMacroIds = () => ((remote.row?.profile as AthleteProfile).macrocycles ?? []).map((m) => m.id);
const localMacroIds = () => localAthleteRepository.getProfile().macrocycles.map((m) => m.id);

describe('sincronización: borrar un macrociclo no lo revive', () => {
  beforeEach(() => {
    store.clear();
    remote.row = null;
  });

  it('borrarlo y sincronizar lo quita del local y del servidor', async () => {
    const profile: AthleteProfile = { ...DEFAULT_PROFILE, onboardedAt: '2026-01-01T00:00:00.000Z', macrocycles: [macro('invierno-primavera'), macro('verano')] };
    localAthleteRepository.saveProfile(profile);
    await pullRemoteOrSeed(); // primera sincronización: sube el perfil y guarda la foto de lo sincronizado
    expect(remoteMacroIds().sort()).toEqual(['invierno-primavera', 'verano']);

    // El atleta borra el macro en Objetivos: se guarda el perfil sin él y se sincroniza.
    localAthleteRepository.saveProfile({ ...localAthleteRepository.getProfile(), macrocycles: [macro('verano')] });
    await pushRemote();
    expect(localMacroIds()).toEqual(['verano']);
    expect(remoteMacroIds()).toEqual(['verano']);

    // Y sigue sin volver en sincronizaciones posteriores.
    await pushRemote();
    expect(localMacroIds()).toEqual(['verano']);
  });

  it('un macro creado en otro dispositivo sí llega, y lo que borraron allí desaparece aquí', async () => {
    const profile: AthleteProfile = { ...DEFAULT_PROFILE, onboardedAt: '2026-01-01T00:00:00.000Z', macrocycles: [macro('a'), macro('b')] };
    localAthleteRepository.saveProfile(profile);
    await pullRemoteOrSeed();

    // El otro dispositivo borra "a" y crea "c" directamente en el servidor.
    const row = remote.row as { profile: AthleteProfile };
    row.profile = { ...row.profile, macrocycles: [macro('b'), macro('c')] };
    await pushRemote();
    expect(localMacroIds().sort()).toEqual(['b', 'c']);
  });
});
