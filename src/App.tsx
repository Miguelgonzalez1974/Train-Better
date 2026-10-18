import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './features/shell/Sidebar';
import { BottomNav } from './features/shell/BottomNav';
import { SyncIndicator } from './features/shell/SyncIndicator';
import type { TabId } from './features/shell/navItems';
import { Login } from './features/auth/Login';
import { useSession } from './features/auth/useSession';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { pullRemoteOrSeed } from './data/athlete/remoteSync';
import { athleteRepository } from './data/athlete/athleteRepository';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { getReadinessCheckForDate } from './engine/readiness';

// Cada pestaña carga en su propio trozo de JS, servido solo cuando el atleta la abre — Planificación y
// Nutrición cargan de paso catálogos enormes (benchmarks/WODs de biblioteca, alimentos) que no hacen
// falta para ver el Dashboard. `Suspense` más abajo cubre el instante de descarga con un indicador fijo.
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Objetivos = lazy(() => import('./features/objetivos/Objetivos').then((m) => ({ default: m.Objetivos })));
const Planificacion = lazy(() => import('./features/planificacion/Planificacion').then((m) => ({ default: m.Planificacion })));
const Nutricion = lazy(() => import('./features/nutricion/Nutricion').then((m) => ({ default: m.Nutricion })));
// La tarjeta de la mañana (check-in) carga aparte: arrastra el motor de sesiones, que no hace falta para pintar la primera pantalla.
const MorningCard = lazy(() => import('./features/morning/MorningCard').then((m) => ({ default: m.MorningCard })));

function TabLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-brand-gold" aria-label="Cargando" />
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('planificacion');
  const { session, loading } = useSession();
  const [syncing, setSyncing] = useState(isSupabaseConfigured);
  // Alta guiada: perfil sin `onboardedAt` y sin ningún macrociclo = atleta nuevo. Se recomprueba tras
  // sincronizar (un usuario que ya se dio de alta en otro dispositivo trae `onboardedAt` del remoto).
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // Tarjeta de la mañana: sale sola al abrir la app si hoy aún no hay check-in (`auto`) o a petición desde Preparación (`edit`).
  // Al guardar algo sube `dataVersion`, que remonta Dashboard y Planificación para que relean el perfil.
  const [morning, setMorning] = useState<'closed' | 'auto' | 'edit'>('closed');
  const [dataVersion, setDataVersion] = useState(0);

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

  const ready = !(isSupabaseConfigured && (loading || syncing || !session)) && !needsOnboarding;
  useEffect(() => {
    if (!ready) return;
    const p = athleteRepository.getProfile();
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!getReadinessCheckForDate(p.readinessLog, todayIso)) setMorning('auto');
  }, [ready]);

  const closeMorning = (changed: boolean) => {
    setMorning('closed');
    if (changed) setDataVersion((v) => v + 1);
  };

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
      <SyncIndicator />
      <Sidebar active={activeTab} onChange={setActiveTab} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-6 lg:max-w-5xl">
        <Suspense fallback={<TabLoading />}>
          {activeTab === 'dashboard' && (
            <Dashboard
              key={dataVersion}
              onNavigateToPlanificacion={() => setActiveTab('planificacion')}
              onNavigateToObjetivos={() => setActiveTab('objetivos')}
              onNavigateToNutricion={() => setActiveTab('nutricion')}
              onOpenMorning={() => setMorning('edit')}
            />
          )}
          {activeTab === 'planificacion' && (
            <Planificacion key={dataVersion} onNavigateToObjetivos={() => setActiveTab('objetivos')} onNavigateToNutricion={() => setActiveTab('nutricion')} />
          )}
          {activeTab === 'nutricion' && <Nutricion />}
          {activeTab === 'objetivos' && <Objetivos />}
        </Suspense>
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />
      {morning !== 'closed' && (
        <Suspense fallback={null}>
          <MorningCard mode={morning} onClose={closeMorning} />
        </Suspense>
      )}
    </div>
  );
}
