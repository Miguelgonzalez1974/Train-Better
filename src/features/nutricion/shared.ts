import type { AthleteProfile, NutritionPrefs, SessionHistoryEntry } from '../../data/athlete/types';
import type { WeekDay } from './nutritionData';

/** Lo que comparten las pestañas del módulo de nutrición. */
export interface NutritionShared {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  weightKg: number;
  prefs: NutritionPrefs;
  todayIso: string;
  /** Aplica un cambio a las preferencias y lo guarda en el perfil (y lo sincroniza). */
  updatePrefs: (update: (prefs: NutritionPrefs) => NutritionPrefs) => void;
  /** Tipos de día de la semana que contiene la fecha (con caché). */
  getWeek: (anyIsoInWeek: string) => WeekDay[];
}
