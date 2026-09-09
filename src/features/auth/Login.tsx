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
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        console.error('signInWithOtp failed', error);
        setStatus('error');
      } else {
        setStatus('sent');
      }
    } catch (err) {
      console.error('signInWithOtp failed', err);
      setStatus('error');
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-border bg-brand-surfaceMuted">
            <Brain size={26} strokeWidth={2} className="text-brand-neon" />
          </span>
          <p className="font-display text-2xl font-semibold tracking-tight text-white">
            Train <span className="text-brand-gold">Better</span>
          </p>
          <p className="mt-1.5 text-sm text-neutral-400">Tu entrenador de fuerza y CrossFit, día a día.</p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-surface p-5">
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
            {status === 'error' && (
              <p className="text-xs text-red-400">
                No se pudo enviar el enlace. Inténtalo de nuevo en unos segundos.
              </p>
            )}
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
