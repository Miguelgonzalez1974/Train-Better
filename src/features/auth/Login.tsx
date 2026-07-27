import { useState } from 'react';
import { Brain } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? 'error' : 'sent');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-brand-surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-surfaceMuted">
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-brand-neon/20 blur-lg" />
            <Brain size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_6px_rgba(57,255,20,0.65)]" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">Train Better</p>
            <p className="text-xs text-neutral-500">Inicia sesión para sincronizar tu entrenamiento</p>
          </div>
        </div>

        {status === 'sent' ? (
          <p className="text-sm text-neutral-300">
            Te enviamos un enlace a <span className="font-semibold text-white">{email}</span>. Ábrelo desde este mismo dispositivo para
            entrar.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:opacity-60"
            >
              {status === 'sending' ? 'Enviando...' : 'Enviar enlace de acceso'}
            </button>
            {status === 'error' && <p className="text-xs text-red-400">No se pudo enviar el enlace. Inténtalo de nuevo.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
