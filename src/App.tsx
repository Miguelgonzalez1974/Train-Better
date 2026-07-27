import { useEffect, useState } from 'react';
import { Sidebar } from './features/shell/Sidebar';
import { BottomNav } from './features/shell/BottomNav';
import type { TabId } from './features/shell/navItems';
import { Dashboard } from './features/dashboard/Dashboard';
import { Objetivos } from './features/objetivos/Objetivos';
import { Planificacion } from './features/planificacion/Planificacion';
import { Login } from './features/auth/Login';
import { useSession } from './features/auth/useSession';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { pullRemoteOrSeed } from './data/athlete/remoteSync';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('planificacion');
  const { session, loading } = useSession();
  const [syncing, setSyncing] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!session) return;
    setSyncing(true);
    pullRemoteOrSeed().finally(() => setSyncing(false));
  }, [session]);

  if (isSupabaseConfigured && (loading || (session && syncing))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <p className="text-sm text-neutral-500">Sincronizando tu entrenamiento…</p>
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <Login />;
  }

  return (
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar active={activeTab} onChange={setActiveTab} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-6">
        {activeTab === 'dashboard' && <Dashboard onNavigateToPlanificacion={() => setActiveTab('planificacion')} />}
        {activeTab === 'planificacion' && <Planificacion />}
        {activeTab === 'objetivos' && <Objetivos />}
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
