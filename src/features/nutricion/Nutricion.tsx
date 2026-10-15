import { useCallback, useMemo, useRef, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { NutritionPrefs } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { BodyweightCard } from '../dashboard/BodyweightCard';
import { NutritionModal } from '../dashboard/NutritionModal';
import { Modal } from '../shell/Modal';
import { AlimentosView } from './AlimentosView';
import { DiarioView } from './DiarioView';
import { MenuDiaView } from './MenuDiaView';
import { computeWeekDays, mondayOf, type WeekDay } from './nutritionData';
import { SemanaView } from './SemanaView';
import type { NutritionShared } from './shared';

type SubTab = 'hoy' | 'menus' | 'alimentos';
type MenuView = 'dia' | 'semana';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'menus', label: 'Menús' },
  { id: 'alimentos', label: 'Alimentos' },
];

const MENU_VIEWS: { id: MenuView; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
];

/**
 * Módulo de nutrición en tres pestañas: Hoy (el diario: apuntas lo que comes y se llenan los anillos de proteína e
 * hidratos), Menús (menús posibles para el día y la semana, que se comen de un toque) y Alimentos (el catálogo, los
 * tuyos y los que no quieres). Lee del entreno el tipo de día. Ver `engine/mealPlan.ts`.
 */
export function Nutricion() {
  const [profile, setProfile] = useState(() => athleteRepository.getProfile());
  const [history] = useState(() => athleteRepository.getHistory());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [tab, setTab] = useState<SubTab>('hoy');
  const [menuView, setMenuView] = useState<MenuView>('dia');
  const [showGuide, setShowGuide] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const todayIso = toLocalIsoDate(new Date());
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const weekCache = useRef(new Map<string, WeekDay[]>());
  const getWeek = useCallback(
    (anyIsoInWeek: string) => {
      const monday = mondayOf(anyIsoInWeek);
      const cached = weekCache.current.get(monday);
      if (cached) return cached;
      const week = computeWeekDays(profile, history, anyIsoInWeek);
      weekCache.current.set(monday, week);
      return week;
    },
    [profile, history],
  );

  const latest = useMemo(() => [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop(), [bodyweightLog]);
  const prefs = profile.nutritionPrefs ?? {};

  const updatePrefs = useCallback((update: (p: NutritionPrefs) => NutritionPrefs) => {
    // Se relee el perfil justo antes de escribir: otra pestaña o el sincronizador pueden haberlo tocado desde que se montó esta.
    const fresh = athleteRepository.getProfile();
    const next = update(fresh.nutritionPrefs ?? {});
    athleteRepository.saveProfile({ ...fresh, nutritionPrefs: next });
    setProfile((prev) => ({ ...prev, nutritionPrefs: next }));
  }, []);

  const shared: NutritionShared | null = latest ? { profile, history, weightKg: latest.kg, prefs, todayIso, updatePrefs, getWeek } : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Nutrición</h1>
        <p className="text-xs text-neutral-500">Menús sencillos para rendir mejor y perder grasa, ajustados a tu entreno.</p>
      </header>

      <div className="flex gap-0.5 rounded-xl bg-white/5 p-0.5" role="tablist" aria-label="Secciones de nutrición">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold transition-colors duration-200 ${
              tab === t.id ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!shared ? (
        <div className="flex flex-col gap-3">
          <div className="card p-4 text-sm text-neutral-300">
            <p className="mb-3">Las cantidades de los menús se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
            <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
          </div>
        </div>
      ) : (
        <>
          {tab === 'hoy' && <DiarioView shared={shared} iso={selectedIso} onChangeIso={setSelectedIso} onOpenGuide={() => setShowGuide(true)} />}
          {tab === 'menus' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1.5" role="tablist" aria-label="Vista de menús">
                {MENU_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={menuView === v.id}
                    onClick={() => setMenuView(v.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      menuView === v.id ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {menuView === 'dia' && <MenuDiaView shared={shared} iso={selectedIso} onChangeIso={setSelectedIso} />}
              {menuView === 'semana' && (
                <SemanaView
                  shared={shared}
                  onOpenDay={(iso) => {
                    setSelectedIso(iso);
                    setMenuView('dia');
                  }}
                />
              )}
            </div>
          )}
          {tab === 'alimentos' && <AlimentosView shared={shared} />}
        </>
      )}

      {showGuide && (
        <NutritionModal
          profile={profile}
          history={history}
          bodyweightLog={bodyweightLog}
          onClose={() => setShowGuide(false)}
          onOpenBodyweight={() => {
            setShowGuide(false);
            setShowWeight(true);
          }}
        />
      )}

      {showWeight && (
        <Modal open onClose={() => setShowWeight(false)} title="Peso corporal">
          <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
        </Modal>
      )}
    </div>
  );
}
