import type { BodyweightEntry, DailySession } from '../data/athlete/types';

/**
 * Plan de nutricion deportiva ORIENTATIVO, ajustado a la carga del dia. No es una dieta ni un plan clinico:
 * no calcula calorias ni fija un deficit (eso depende de altura, edad, composicion corporal e historial de
 * salud, y es donde un dietista deportivo aporta mas). Trabaja con cantidades POR KILO de peso corporal y con
 * la tendencia del peso registrado.
 *
 * Todas las cifras salen de posicionamientos publicados — ver `NUTRITION_SOURCES`. Donde el plan se aparta del
 * rango de una fuente (carbohidrato en el punto bajo por el objetivo de perder grasa) esta dicho en su nota.
 * Objetivo del atleta: rendir mejor Y perder grasa (deficit pequeno y sostenido, proteina alta,
 * carbohidrato concentrado en los dias y las horas de mas carga).
 */

export const NUTRITION_SOURCES: { key: string; label: string }[] = [
  {
    key: 'acsm',
    label: 'ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada. Nutrition and Athletic Performance (2016). Med Sci Sports Exerc 48(3).',
  },
  { key: 'issn-protein', label: 'ISSN. Position Stand: protein and exercise (Jäger et al., 2017). J Int Soc Sports Nutr 14:20.' },
  { key: 'morton', label: 'Morton et al. (2018). Protein supplementation and resistance training-induced gains: meta-analysis. Br J Sports Med 52(6).' },
  { key: 'helms', label: 'Helms et al. (2014). Evidence-based recommendations for natural bodybuilding contest preparation. J Int Soc Sports Nutr 11:20.' },
  { key: 'garthe', label: 'Garthe et al. (2011). Effect of two different weight-loss rates on body composition and strength in elite athletes. Int J Sport Nutr Exerc Metab 21(2).' },
  { key: 'issn-creatine', label: 'ISSN. Position Stand: safety and efficacy of creatine supplementation (Kreider et al., 2017). J Int Soc Sports Nutr 14:18.' },
  { key: 'issn-caffeine', label: 'ISSN. Position Stand: caffeine and exercise performance (Guest et al., 2021). J Int Soc Sports Nutr 18:1.' },
  { key: 'drake', label: 'Drake et al. (2013). Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med 9(11).' },
  { key: 'who', label: 'OMS. Healthy diet (fact sheet): al menos 400 g de fruta y verdura al día.' },
  { key: 'usda', label: 'USDA FoodData Central: composicion aproximada de los alimentos de ejemplo.' },
];

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
/** Proteina por toma (g/kg): ACSM 0.25-0.3 g/kg (20-25 g) cada 3-5 h; ISSN 0.25 g/kg o 20-40 g. */
export const PROTEIN_PER_MEAL_G_PER_KG = 0.3;

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
  proteinPerMealG: number;
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
    proteinPerMealG: round5(PROTEIN_PER_MEAL_G_PER_KG * weightKg),
    carbsPerKg: c,
    carbsG: { min: round5(c.min * weightKg), max: round5(c.max * weightKg) },
  };
}

// ---------- Alrededor del entreno ----------

export type TrainingSlot = 'manana' | 'tarde';

export const TRAINING_SLOT_LABEL: Record<TrainingSlot, string> = { manana: 'Por la mañana (9:00)', tarde: 'Por la tarde (17:00)' };

export interface MealStep {
  when: string;
  what: string;
}

/**
 * Que comer y beber alrededor del entreno segun la hora (por la manana o por la tarde), con las cantidades
 * ya calculadas para el peso. ACSM 2016: 1-4 g/kg de carbohidrato 1-4 h antes; 5-7 ml/kg de liquido al menos 4 h antes;
 * 30-60 g/h de carbohidrato solo en esfuerzos de mas de ~1 h; proteina 0.25-0.3 g/kg en la comida de despues.
 */
export function mealTimingPlan(slot: TrainingSlot, dayType: NutritionDayType, weightKg: number, isDouble: boolean): MealStep[] {
  if (dayType === 'descanso') {
    return [
      { when: 'Todo el día', what: 'Sin entreno no hace falta comida especial: reparte la proteína en 3-5 tomas y deja el carbohidrato en el punto bajo de tu rango (mira arriba).' },
      { when: 'Hidratación', what: 'Bebe con normalidad a lo largo del día; el color de la orina claro es la señal más simple.' },
    ];
  }
  const carbBefore = round5(1 * weightKg);
  const proteinServing = round5(PROTEIN_PER_MEAL_G_PER_KG * weightKg);
  const round50 = (ml: number) => Math.round(ml / 50) * 50;
  const drinkBefore = `${round50(5 * weightKg)}-${round50(7 * weightKg)} ml`;
  const during = isDouble
    ? 'Entre las dos partes: solo agua a sorbos, sin comer. Si la sesión completa pasa de ~1 h de esfuerzo continuo, 30-60 g de carbohidrato por hora es opcional (plátano, bebida deportiva).'
    : 'Agua. El carbohidrato durante el entreno (30-60 g por hora) solo compensa en esfuerzos continuos de más de ~1 h; en sesiones de fuerza + WOD normales no hace falta.';
  const caffeine =
    'Si usas cafeína (3-6 mg por kg, unos 60 min antes), corta al menos 6 h antes de dormir: 400 mg 6 h antes ya reducen el sueño más de 1 h (Drake 2013).';

  if (slot === 'manana') {
    return [
      { when: 'Antes (1-2 h antes, ~7:00-8:00)', what: `Desayuno ligero con ~${carbBefore} g de carbohidrato (avena, tostada, fruta) y una toma de proteína (huevos, yogur, jamón). Bebe ${drinkBefore} de agua en las 2-4 h previas. Si solo tienes 30-60 min: algo pequeño y fácil, como un plátano.` },
      { when: 'Durante', what: during },
      { when: 'Después (en las 2 h siguientes)', what: `Una comida con ~${proteinServing} g de proteína (carne, pescado, huevos, lácteos, legumbres) y carbohidrato (arroz, patata, pan, fruta). Aquí va buena parte del carbohidrato del día.` },
      { when: 'Resto del día', what: 'Reparte el resto de la proteína en 3-5 tomas y cierra el carbohidrato de tu rango. Como entrenas temprano, el carbohidrato pesa más en el desayuno y la comida.' },
      { when: 'Cafeína', what: caffeine },
    ];
  }
  return [
    { when: 'Comida (3-4 h antes, ~13:00-14:00)', what: `Comida completa con carbohidrato (arroz, pasta, patata) y proteína. Es la comida que sostiene el entreno de las 17:00.` },
    { when: 'Justo antes (1-2 h antes, ~15:30-16:00)', what: `Si tienes hambre o entrenas fuerte, algo ligero de carbohidrato (fruta, tostada; hasta ~${carbBefore} g). Bebe ${drinkBefore} de agua en las 2-4 h previas.` },
    { when: 'Durante', what: during },
    { when: 'Después (en las 2 h siguientes, ~19:00)', what: `Cena con ~${proteinServing} g de proteína y carbohidrato (arroz, patata, pan). Como el siguiente entreno suele quedar a más de 8 h, no hace falta forzar la recarga.` },
    { when: 'Cafeína', what: `${caffeine} Con entreno a las 17:00, la última dosis efectiva es a media tarde.` },
  ];
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
      message: `Para valorar tu tendencia hacen falta al menos ${TREND_MIN_ENTRIES} pesajes repartidos en ${TREND_MIN_SPAN_DAYS} días o más (mejor por la mañana, en ayunas). Registra tu peso con el botón de la báscula.`,
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

// ---------- Contenido fijo ----------

/** Proteina y carbohidrato ≈ por racion de alimentos habituales (USDA FoodData Central, valores aproximados). */
export const FOOD_REFERENCE: { group: 'proteina' | 'carbohidrato'; item: string; amount: string }[] = [
  { group: 'proteina', item: 'Pechuga de pollo o pavo cocinada (100 g)', amount: '≈ 30 g de proteína' },
  { group: 'proteina', item: 'Atún al natural (1 lata, ~110 g escurrido)', amount: '≈ 25 g' },
  { group: 'proteina', item: 'Huevos (2 grandes)', amount: '≈ 12 g' },
  { group: 'proteina', item: 'Yogur griego natural (170 g)', amount: '≈ 17 g' },
  { group: 'proteina', item: 'Lentejas o garbanzos cocidos (100 g)', amount: '≈ 9 g (y ≈ 20 g de carbohidrato)' },
  { group: 'proteina', item: 'Proteína en polvo (1 cacito)', amount: '≈ 20-25 g' },
  { group: 'carbohidrato', item: 'Arroz blanco cocido (100 g)', amount: '≈ 28 g de carbohidrato' },
  { group: 'carbohidrato', item: 'Pasta cocida (100 g)', amount: '≈ 30 g' },
  { group: 'carbohidrato', item: 'Patata cocida (100 g)', amount: '≈ 20 g' },
  { group: 'carbohidrato', item: 'Avena en copos (40 g)', amount: '≈ 27 g' },
  { group: 'carbohidrato', item: 'Plátano mediano', amount: '≈ 25-27 g' },
];

export const VEGETABLES_ADVICE = {
  title: 'Si la verdura no es lo tuyo',
  intro:
    'No hay que forzarla, pero conviene saber qué aporta: fibra, potasio, vitaminas y antioxidantes que cuesta cubrir sin ella. La OMS recomienda al menos 400 g al día de fruta y verdura, y la fruta cuenta. Un multivitamínico no la sustituye.',
  ideas: [
    'Fruta como base: 2-3 piezas al día (con el desayuno, antes de entrenar, de postre) ya cubren buena parte de esos 400 g.',
    'Legumbres (lentejas, garbanzos, alubias): fibra y proteína a la vez, y no son verdura.',
    'Verdura sin que se note: tomate frito o triturado en salsas, verdura triturada en cremas y sopas, crema de calabaza, gazpacho.',
    'Batidos con espinacas o zanahoria y fruta: el sabor lo manda la fruta.',
    'Patata y boniato como fuente de carbohidrato con potasio (la OMS no los cuenta en los 400 g, pero suman nutrientes).',
  ],
};

export const SUPPLEMENTS: { name: string; dose: string; note: string }[] = [
  {
    name: 'Creatina monohidrato',
    dose: '3-5 g al día, todos los días (0,03 g/kg), a cualquier hora',
    note: 'El suplemento con más evidencia para fuerza y potencia repetida. La carga inicial no es necesaria (ISSN 2017). Puede subir 1-2 kg de agua en el peso, sin ser grasa: tenlo en cuenta al mirar tu tendencia.',
  },
  {
    name: 'Cafeína',
    dose: '3-6 mg/kg, unos 60 min antes (ISSN 2021)',
    note: 'Mejora el rendimiento; más dosis no suele aportar más y sí más efectos secundarios (nerviosismo, sueño). Con entreno a las 17:00, cuida el sueño: no la tomes en las 6 h previas a acostarte.',
  },
  {
    name: 'Proteína en polvo',
    dose: '1 cacito (~20-25 g de proteína)',
    note: 'Solo una comodidad para llegar a tu proteína del día, no una necesidad. Si la comida ya te da tu rango, no hace falta.',
  },
];

export const NUTRITION_DISCLAIMER =
  'Orientación general de nutrición deportiva basada en posicionamientos publicados, no una dieta ni un consejo médico. No calcula calorías ni fija un déficit: si tienes una condición médica, tomas medicación, estás embarazada o has tenido problemas con la alimentación, consúltalo con un dietista o médico antes de cambiar cómo comes. Señales de comer demasiado poco: cansancio que no se va, mal sueño, enfermar a menudo, bajada de rendimiento sostenida; si las notas, sube las cantidades y habla con un profesional.';
