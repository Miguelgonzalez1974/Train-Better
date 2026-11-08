import { useCallback, useMemo, useRef, useState } from 'react';
import { Scale } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { NutritionPrefs } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { BodyweightCard } from '../dashboard/BodyweightCard';
import { Modal } from '../shell/Modal';
import { DiarioView } from './DiarioView';
import { ScreenRex } from '../dashboard/ScreenRex';
import { computeWeekDays, mondayOf, type WeekDay } from './nutritionData';
import type { NutritionShared } from './shared';

/**
 * Módulo de nutrición en una sola pantalla: el diario del día. Apuntas lo que comes y se llenan los anillos de proteína
 * e hidratos frente a lo que te toca hoy. Lee del entreno el tipo de día. Ver `engine/mealPlan.ts`.
 */
export function Nutricion() {
  const [profile, setProfile] = useState(() => athleteRepository.getProfile());
  const [history] = useState(() => athleteRepository.getHistory());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
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
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Nutrición</h1>
          <p className="text-xs text-neutral-500">Lo que llevas comido frente a lo que te toca hoy.</p>
        </div>
        {/* El peso vive aquí (de él salen las cantidades): el último pesaje, y un toque para registrar otro. */}
        {latest && (
          <button
            onClick={() => setShowWeight(true)}
            aria-label={`Peso corporal, ${String(latest.kg).replace('.', ',')} kilos. Registrar peso`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Scale size={13} strokeWidth={2.25} aria-hidden="true" />
            <span className="num">{String(latest.kg).replace('.', ',')} kg</span>
          </button>
        )}
      </header>

      {!shared ? (
        <div className="flex flex-col gap-3 pb-44">
          <ScreenRex id="nutricion-sin-peso" lead="Nutrición." text="Para calcular lo que te toca cada día primero necesito tu peso. Apúntalo aquí y lo preparo." tone="mid" />
          <div className="card p-4 text-sm text-neutral-300">
            <p className="mb-3">Los objetivos de cada día se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
            <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
          </div>
        </div>
      ) : (
        <DiarioView shared={shared} iso={selectedIso} onChangeIso={setSelectedIso} />
      )}

      {showWeight && (
        <Modal open onClose={() => setShowWeight(false)} title="Peso corporal">
          <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
        </Modal>
      )}
    </div>
  );
}
