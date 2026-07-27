import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no configuradas — la app funciona solo en local, sin sincronizar.');
}

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url, anonKey) : null;
