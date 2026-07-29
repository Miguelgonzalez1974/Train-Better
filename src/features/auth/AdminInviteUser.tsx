import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSession } from './useSession';

const ADMIN_EMAIL = 'miguelg.rincon@gmail.com';

export function AdminInviteUser() {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (session?.user?.email !== ADMIN_EMAIL) return null;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const token = currentSession?.access_token;
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, redirectTo: window.location.origin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo enviar la invitación.');
      setStatus('sent');
      setEmail('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-brand-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold">Admin: invitar usuario</p>
      <form onSubmit={handleInvite} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nuevo.usuario@email.com"
          className="flex-1 rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black transition-all duration-200 hover:brightness-95 disabled:opacity-60"
        >
          {status === 'sending' ? 'Enviando...' : 'Invitar'}
        </button>
      </form>
      {status === 'sent' && <p className="text-xs text-emerald-400">Invitación enviada.</p>}
      {status === 'error' && <p className="text-xs text-red-400">{errorMsg}</p>}
    </div>
  );
}
