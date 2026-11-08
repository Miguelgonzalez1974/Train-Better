import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile } from '../../data/athlete/types';
import { FOODS, type Food } from '../../data/nutrition/foods';
import { customFoodToCatalogFood } from '../../engine/customFoods';
import { describeIdea, mealIdeas } from '../../engine/mealIdeas';
import { addDaysIso } from '../../engine/periodization';
import { appNav } from '../../lib/appNav';
import { handoff } from '../../lib/handoff';
import { MEAL_DRAFT_KEY } from '../../lib/mealDraft';
import { rexBus } from '../../lib/rexBus';
import { dinnerAnswer, elsewhereAnswer, helpAnswer, missingAnswer, parseAsk, weightAnswer, type AskAnswer, type AskIntent } from './rexAsk';

export type RexScreen = 'dashboard' | 'planificacion' | 'nutricion' | 'objetivos';

export interface RouterApi {
  todayIso: string;
  /** Lo que esta pantalla hace por su cuenta, por tipo de petición. Lo que no esté aquí lo resuelve el reparto común. */
  local?: { [K in AskIntent['kind']]?: (intent: Extract<AskIntent, { kind: K }>) => AskAnswer | 'close' };
  /** Lo que falta del día en comida (null si no se puede calcular: sin peso), para «¿qué me falta?» y «¿qué ceno?». */
  missing?: () => { protein: number; carbs: number } | null;
  /** Se acaba de apuntar un peso: la pantalla refresca el suyo. */
  onWeightLogged?: () => void;
}

/** Los alimentos con los propios del atleta, y los que más ha apuntado estas dos semanas (van primero en «¿qué ceno?»). */
export function foodsAndRecents(profile: AthleteProfile, todayIso: string): { foods: Food[]; recent: string[] } {
  const custom = (profile.nutritionPrefs?.customFoods ?? []).map(customFoodToCatalogFood);
  const since = addDaysIso(todayIso, -14);
  const count = new Map<string, number>();
  for (const [date, list] of Object.entries(profile.nutritionPrefs?.extraFoods ?? {})) {
    if (date < since) continue;
    for (const e of list) for (const it of e.items) count.set(it.foodId, (count.get(it.foodId) ?? 0) + 1);
  }
  return { foods: [...FOODS, ...custom], recent: [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id) };
}

/** Apunta el peso de hoy y dice cómo cambia frente al último. */
export function logWeight(kg: number, todayIso: string): AskAnswer {
  const last = [...athleteRepository.getBodyweightLog()].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const daysAgo = last ? Math.max(0, Math.round((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${last.date}T00:00:00`).getTime()) / 86_400_000)) : 0;
  athleteRepository.appendBodyweightEntry({ date: todayIso, kg });
  return weightAnswer(kg, last ? { kg: last.kg, daysAgo } : null);
}

/** Lleva una frase de comida a Nutrición: si ya estás ahí la escribe en la caja; si no, la deja pendiente y cambia de pestaña. */
export function sendMealToNutrition(text: string, onNutrition: boolean): void {
  if (onNutrition) {
    rexBus.emit('meal-text', text);
    return;
  }
  try {
    window.sessionStorage.setItem(MEAL_DRAFT_KEY, text);
  } catch {
    /* sin almacenamiento: se abre Nutrición y se escribe allí */
  }
  appNav.goTo('nutricion');
}

/** «¿Qué ceno?»: ideas con tus alimentos para cerrar lo que falta. */
export function dinnerFor(profile: AthleteProfile, todayIso: string, missing: { protein: number; carbs: number }): AskAnswer {
  const { foods, recent } = foodsAndRecents(profile, todayIso);
  return dinnerAnswer(mealIdeas(missing, foods, recent).map(describeIdea));
}

const SUPPORT_NODE: Partial<Record<AskIntent['kind'], string>> = { dolor: 'p_zone', 'no-plan': 't_what', faltar: 'a_why' };

/**
 * Lee lo escrito en la caja de RexLab de cualquier pantalla y lo reparte: lo que la pantalla hace por su cuenta (`api.local`) va primero;
 * el resto se resuelve igual en todas (apuntar el peso, una comida, lo que falta) o lleva a la pantalla donde se hace, con lo pedido ya
 * preparado (la conversación de la molestia en Planificación, el asistente en Objetivos). 'close' = ya se ha hecho algo y RexLab se va.
 */
export function routeAsk(text: string, screen: RexScreen, api: RouterApi): AskAnswer | 'close' {
  const intent = parseAsk(text, new Date().getDay());
  const local = api.local?.[intent.kind] as ((i: AskIntent) => AskAnswer | 'close') | undefined;
  if (local) return local(intent);

  switch (intent.kind) {
    case 'peso': {
      const answer = logWeight(intent.kg, api.todayIso);
      api.onWeightLogged?.();
      return answer;
    }
    case 'comida':
      sendMealToNutrition(intent.text, screen === 'nutricion');
      return 'close';
    case 'falta':
    case 'cena': {
      const missing = api.missing?.() ?? null;
      if (!missing) return elsewhereAnswer('Para calcular lo que te falta necesito tu peso y tu diario: míralo en Nutrición.', 'ir-nutricion');
      return intent.kind === 'falta' ? missingAnswer(missing) : dinnerFor(athleteRepository.getProfile(), api.todayIso, missing);
    }
    case 'dolor':
    case 'no-plan':
    case 'faltar':
    case 'otro-wod':
      if (screen === 'planificacion') return helpAnswer();
      if (intent.kind === 'otro-wod') handoff.put('plan-act', 'otro-wod');
      else handoff.put('support-start', SUPPORT_NODE[intent.kind] ?? 'start');
      appNav.goTo('planificacion');
      return 'close';
    case 'programa':
      return elsewhereAnswer('El programa de fuerza se ve y se decide debajo de tu sesión, en Planificación.', 'ir-planificacion');
    case 'crear':
      handoff.put('objetivos-asistente', intent.what);
      appNav.goTo('objetivos');
      return 'close';
    case 'dia':
    case 'estado':
      return elsewhereAnswer('Eso te lo cuento en el Dashboard, donde está tu estado de hoy.', 'ir-dashboard');
    case 'modulo':
      return elsewhereAnswer('Ese módulo está en el Dashboard.', 'ir-dashboard');
    case 'ayuda':
      return helpAnswer();
  }
}
