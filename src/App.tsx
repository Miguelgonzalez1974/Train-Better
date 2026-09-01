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
import { athleteRepository } from './data/athlete/athleteRepository';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('planificacion');
  const { session, loading } = useSession();
  const [syncing, setSyncing] = useState(isSupabaseConfigured);
  // Alta guiada: perfil sin `onboardedAt` y sin ningún macrociclo = atleta nuevo. Se recomprueba tras
  // sincronizar (un usuario que ya se dio de alta en otro dispositivo trae `onboardedAt` del remoto).
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const userId = session?.user?.id ?? null;
  useEffect(() => {
    // Depende solo del id de usuario, no del objeto `session` completo: Supabase dispara
    // onAuthStateChange (y por tanto un `session` con nueva identidad) en cada refresco de
    // token o cambio de foco de la pestaña, no solo al iniciar sesión. Si volviéramos a tirar
    // de remoto en cada uno de esos eventos, una sincronización a mitad de un push local (p.ej.
    // justo tras borrar un día) podría sobreescribir el cambio local con la copia remota
    // todavía desactualizada, haciendo que lo borrado "reaparezca".
    if (!userId) return;
    setSyncing(true);
    pullRemoteOrSeed().finally(() => setSyncing(false));
  }, [userId]);

  useEffect(() => {
    if (isSupabaseConfigured && (loading || syncing)) return; // espera a que termine la sincronización
    const p = athleteRepository.getProfile();
    setNeedsOnboarding(!p.onboardedAt && p.macrocycles.length === 0);
  }, [loading, syncing]);

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

  if (needsOnboarding) {
    return <OnboardingWizard onDone={() => setNeedsOnboarding(false)} />;
  }

  return (
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar active={activeTab} onChange={setActiveTab} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-6">
        {activeTab === 'dashboard' && <Dashboard onNavigateToPlanificacion={() => setActiveTab('planificacion')} />}
        {activeTab === 'planificacion' && <Planificacion onNavigateToObjetivos={() => setActiveTab('objetivos')} />}
        {activeTab === 'objetivos' && <Objetivos />}
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
