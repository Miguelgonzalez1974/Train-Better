import type { BodyweightEntry, DailySession } from '../data/athlete/types';

/**
 * Plan de nutricion deportiva ORIENTATIVO, ajustado a la carga del dia. No es una dieta ni un plan clinico:
 * no calcula calorias ni fija un deficit (eso depende de altura, edad, composicion corporal e historial de
 * salud, y es donde un dietista deportivo aporta mas). Trabaja con cantidades POR KILO de peso corporal y con
 * la tendencia del peso registrado.
 *
 * Todas las cifras salen de posicionamientos publicados: ACSM/Academy of Nutrition and Dietetics (2016), ISSN sobre
 * proteina (Jäger 2017), Morton 2018, Helms 2014 y Garthe 2011. Donde el plan se aparta del rango de una fuente
 * (carbohidrato en el punto bajo por el objetivo de perder grasa) esta dicho en su nota.
 * Objetivo del atleta: rendir mejor Y perder grasa (deficit pequeno y sostenido, proteina alta,
 * carbohidrato concentrado en los dias y las horas de mas carga).
 */

// ---------- Tipo de dia ----------

export type NutritionDayType = 'descanso' | 'ligero' | 'normal' | 'alto';

export const NUTRITION_DAY_LABEL: Record<NutritionDayType, string> = {
  descanso: 'Día de descanso',
  ligero: 'Día ligero',
  normal: 'Día de entreno normal',
  alto: 'Día de carga alta',
};

/**
 * Tipo de dia a partir de la sesion que el motor ya genero: descanso (sin sesion), ligero (recuperacion activa,
 * dia suave o descarga), carga alta (doble WOD o el dia fuerte de la semana) o normal.
 */
export function classifyNutritionDay(session: DailySession | null | undefined): NutritionDayType {
  if (!session || session.isRestDay || session.blocks.length === 0) return 'descanso';
  if (session.doubleWod || session.dayIntensity === 'alta') return 'alto';
  const recovery = session.blocks.some((b) => b.block === 'wod' && b.title === 'Recuperación activa');
  if (recovery || session.dayIntensity === 'baja' || session.energySystem === 'recuperacion' || session.mesocycleWeek === 4) return 'ligero';
  return 'normal';
}

// ---------- Cantidades por dia ----------

/** Proteina (g/kg/dia): ISSN 1.4-2.0 en atletas y hasta ~2.2 en deficit (Morton 2018: 1.6-2.2); punto alto por el objetivo de perder grasa. Igual todos los dias. */
export const PROTEIN_G_PER_KG = { min: 1.8, max: 2.2 };

/**
 * Carbohidrato (g/kg/dia) por tipo de dia. ACSM 2016: 3-5 (ligero), 5-7 (~1 h/dia moderado), 6-10 (1-3 h/dia).
 * Aqui va DELIBERADAMENTE en el punto bajo de cada rango porque el objetivo incluye perder grasa, salvo el dia de
 * carga alta (doble WOD), que usa el rango moderado completo: ahi manda el rendimiento.
 */
export const CARBS_G_PER_KG: Record<NutritionDayType, { min: number; max: number }> = {
  descanso: { min: 3, max: 4 },
  ligero: { min: 3, max: 4 },
  normal: { min: 4, max: 5 },
  alto: { min: 5, max: 7 },
};

/** Redondea a multiplos de 5 g: una cifra mas fina que eso es falsa precision. */
export function round5(g: number): number {
  return Math.round(g / 5) * 5;
}

export interface DayNutrition {
  dayType: NutritionDayType;
  label: string;
  weightKg: number;
  proteinPerKg: { min: number; max: number };
  proteinG: { min: number; max: number };
  carbsPerKg: { min: number; max: number };
  carbsG: { min: number; max: number };
}

export function nutritionForDay(dayType: NutritionDayType, weightKg: number): DayNutrition {
  const c = CARBS_G_PER_KG[dayType];
  return {
    dayType,
    label: NUTRITION_DAY_LABEL[dayType],
    weightKg,
    proteinPerKg: PROTEIN_G_PER_KG,
    proteinG: { min: round5(PROTEIN_G_PER_KG.min * weightKg), max: round5(PROTEIN_G_PER_KG.max * weightKg) },
    carbsPerKg: c,
    carbsG: { min: round5(c.min * weightKg), max: round5(c.max * weightKg) },
  };
}

// ---------- Tendencia del peso ----------

export type WeightTrendStatus = 'sin-datos' | 'rapido' | 'en-objetivo' | 'lento' | 'sin-perdida';

export interface WeightTrend {
  status: WeightTrendStatus;
  /** % de peso corporal perdido por semana (positivo = pierdes). null sin datos suficientes. */
  lossPctPerWeek: number | null;
  /** Dias que cubren los registros usados. */
  spanDays: number;
  message: string;
}

const MS_DAY = 86_400_000;
/** Ventana de la tendencia y minimo de registros / dias que la cubren para fiarse (un solo pesaje varia >0,5 kg por hidratacion). */
const TREND_WINDOW_DAYS = 28;
const TREND_MIN_ENTRIES = 3;
const TREND_MIN_SPAN_DAYS = 14;
/** Ritmo de perdida en atletas: 0.5-1 % del peso por semana (Helms 2014); 0.7 %/sem conserva mas masa magra que 1.4 %/sem (Garthe 2011). */
export const LOSS_RATE_TARGET_PCT_PER_WEEK = { min: 0.5, max: 1 };

function dayNumber(iso: string): number {
  return Math.round(new Date(`${iso}T12:00:00`).getTime() / MS_DAY);
}

/**
 * Tendencia del peso por regresion lineal de los pesajes de las ultimas 4 semanas, y que hacer con ella. Sin
 * numeros de calorias: dice si mantener, comer algo mas o tener paciencia. `highStrain` (ACWR alto, descarga por
 * fatiga, RPE alto sostenido...) manda sobre todo: con la carga alta no se aprieta el deficit.
 */
export function analyzeWeightTrend(log: BodyweightEntry[], todayIso: string, opts: { highStrain?: boolean } = {}): WeightTrend {
  const today = dayNumber(todayIso);
  const recent = log
    .filter((e) => dayNumber(e.date) <= today && dayNumber(e.date) > today - TREND_WINDOW_DAYS && e.kg > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = recent.length > 1 ? dayNumber(recent[recent.length - 1].date) - dayNumber(recent[0].date) : 0;
  if (recent.length < TREND_MIN_ENTRIES || spanDays < TREND_MIN_SPAN_DAYS) {
    return {
      status: 'sin-datos',
      lossPctPerWeek: null,
      spanDays,
      message: `Para valorar tu tendencia hacen falta al menos ${TREND_MIN_ENTRIES} pesajes repartidos en ${TREND_MIN_SPAN_DAYS} días o más (mejor por la mañana, en ayunas). Registra tu peso con el botón de abajo.`,
    };
  }
  const xs = recent.map((e) => dayNumber(e.date));
  const ys = recent.map((e) => e.kg);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const slopeKgPerDay = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const lossPct = ((-slopeKgPerDay * 7) / my) * 100;
  const pct = `${Math.abs(lossPct).toFixed(1).replace('.', ',')} %`;
  const { min, max } = LOSS_RATE_TARGET_PCT_PER_WEEK;

  if (lossPct > max) {
    return {
      status: 'rapido',
      lossPctPerWeek: lossPct,
      spanDays,
      message: `Estás perdiendo ~${pct} de tu peso por semana, por encima del 0,5-1 % que se considera razonable en atletas. Perder más deprisa cuesta músculo y rendimiento: sube algo el carbohidrato, sobre todo en torno al entreno.`,
    };
  }
  if (opts.highStrain) {
    return {
      status: lossPct >= min ? 'en-objetivo' : lossPct > 0 ? 'lento' : 'sin-perdida',
      lossPctPerWeek: lossPct,
      spanDays,
      message: 'Tu carga de entrenamiento o tu recuperación están tensas ahora mismo: no es momento de apretar más. Mantén las cantidades de tu rango (mejor el punto alto del carbohidrato) y vuelve a valorar cuando se normalice.',
    };
  }
  if (lossPct >= min) {
    return {
      status: 'en-objetivo',
      lossPctPerWeek: lossPct,
      spanDays,
      message: `Vas perdiendo ~${pct} por semana: dentro del 0,5-1 % recomendado. Mantén el plan tal cual.`,
    };
  }
  if (lossPct > 0) {
    return {
      status: 'lento',
      lossPctPerWeek: lossPct,
      spanDays,
      message: `Vas perdiendo ~${pct} por semana, más despacio que el 0,5-1 % habitual. Es compatible con rendir bien: dale 3-4 semanas más antes de tocar nada, y si sigue igual, ajusta un poco el carbohidrato de los días de menos carga (no el de alrededor del entreno).`,
    };
  }
  return {
    status: 'sin-perdida',
    lossPctPerWeek: lossPct,
    spanDays,
    message:
      'Tu peso no está bajando en las últimas semanas. Antes de recortar, revisa que las cantidades reales de los días de descanso y ligeros se parezcan a tu rango. Si es así, ajusta un poco el carbohidrato de esos días (no el de alrededor del entreno) y mantén la proteína.',
  };
}

export const NUTRITION_DISCLAIMER =
  'Orientación general de nutrición deportiva basada en posicionamientos publicados, no una dieta ni un consejo médico. No calcula calorías ni fija un déficit: si tienes una condición médica, tomas medicación, estás embarazada o has tenido problemas con la alimentación, consúltalo con un dietista o médico antes de cambiar cómo comes. Señales de comer demasiado poco: cansancio que no se va, mal sueño, enfermar a menudo, bajada de rendimiento sostenida; si las notas, sube las cantidades y habla con un profesional.';
