import { describe, it, expect } from 'vitest';
import {
  analyzeWeightTrend,
  CARBS_G_PER_KG,
  classifyNutritionDay,
  defaultTrainingSlot,
  FIST_CARB_G,
  FOOD_REFERENCE,
  formatServing,
  handGuide,
  mealTimingPlan,
  NUTRITION_SOURCES,
  nutritionForDay,
  nutritionGlance,
  PALM_PROTEIN_G,
  PROTEIN_G_PER_KG,
  round5,
  SUPPLEMENTS,
  type NutritionDayType,
  type TrainingSlot,
} from './nutritionPlan';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { BodyweightEntry, DailySession } from '../data/athlete/types';

const TYPES: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];

describe('cantidades por dia', () => {
  it('la proteina es la misma todos los dias y sale del rango publicado (por kilo de peso)', () => {
    for (const kg of [60, 82, 95]) {
      const first = nutritionForDay('descanso', kg);
      for (const t of TYPES) {
        const d = nutritionForDay(t, kg);
        expect(d.proteinG).toEqual(first.proteinG);
        expect(d.proteinG.min).toBe(round5(PROTEIN_G_PER_KG.min * kg));
        expect(d.proteinG.max).toBe(round5(PROTEIN_G_PER_KG.max * kg));
        // Por toma: 0.3 g/kg (ACSM), nunca mas que el total del dia.
        expect(d.proteinPerMealG).toBe(round5(0.3 * kg));
        expect(d.proteinPerMealG).toBeLessThan(d.proteinG.min);
      }
    }
    expect(PROTEIN_G_PER_KG).toEqual({ min: 1.8, max: 2.2 });
  });

  it('el carbohidrato sube con la carga del dia y nunca sale del rango ACSM ni baja de 3 g/kg', () => {
    const order: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];
    let prev = { min: 0, max: 0 };
    for (const t of order) {
      const c = CARBS_G_PER_KG[t];
      expect(c.min, t).toBeGreaterThanOrEqual(prev.min);
      expect(c.max, t).toBeGreaterThanOrEqual(prev.max);
      expect(c.min, t).toBeGreaterThanOrEqual(3);
      expect(c.max, t).toBeLessThanOrEqual(7); // ACSM: hasta 7 g/kg en carga moderada; el plan no usa los rangos de resistencia
      expect(c.max, t).toBeGreaterThan(c.min);
      prev = c;
    }
    expect(nutritionForDay('alto', 82).carbsG.max).toBeGreaterThan(nutritionForDay('normal', 82).carbsG.max);
  });

  it('los gramos son el peso por g/kg redondeado a multiplos de 5 (sin falsa precision)', () => {
    const d = nutritionForDay('normal', 82);
    expect(d.carbsG).toEqual({ min: 330, max: 410 });
    expect(d.proteinG).toEqual({ min: 150, max: 180 });
    for (const g of [d.carbsG.min, d.carbsG.max, d.proteinG.min, d.proteinG.max, d.proteinPerMealG]) expect(g % 5).toBe(0);
  });
});

describe('clasificacion del dia a partir de la sesion generada', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'n' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
  const sessions: DailySession[] = consecutiveDates('2026-01-05', 140).map((d) => generateSessionForDate(profile, [], d, profile.goals));

  it('sin sesion, descanso o sin bloques es descanso', () => {
    expect(classifyNutritionDay(null)).toBe('descanso');
    expect(classifyNutritionDay(undefined)).toBe('descanso');
    expect(classifyNutritionDay({ date: '2026-01-11', mesocycleWeek: 1, isRestDay: true, blocks: [] })).toBe('descanso');
  });

  it('un doble WOD es carga alta; la recuperacion activa y la descarga son ligeras; hay de todos los tipos', () => {
    const seen = new Set<NutritionDayType>();
    for (const s of sessions) {
      const t = classifyNutritionDay(s);
      seen.add(t);
      if (s.doubleWod) expect(t, s.date).toBe('alto');
      if (s.blocks.some((b) => b.block === 'wod' && b.title === 'Recuperación activa') && !s.doubleWod) expect(t, s.date).not.toBe('alto');
      if (s.isRestDay) expect(t, s.date).toBe('descanso');
      if (s.mesocycleWeek === 4 && !s.isRestDay && !s.doubleWod && s.dayIntensity !== 'alta') expect(t, s.date).toBe('ligero');
    }
    expect([...seen].sort()).toEqual([...TYPES].sort());
  });
});

describe('plan alrededor del entreno', () => {
  it('da los dos horarios con las cantidades calculadas para el peso, y el descanso no pide comida especial', () => {
    const m = mealTimingPlan('manana', 'normal', 80, false).map((s) => s.what).join(' ');
    const t = mealTimingPlan('tarde', 'normal', 80, false).map((s) => s.what).join(' ');
    // 1 g/kg de carbohidrato antes (80 kg -> 80 g) y 0.3 g/kg de proteina despues (80 kg -> 25 g), agua 5-7 ml/kg (400-560 ml, redondeado a 50 ml).
    for (const text of [m, t]) {
      expect(text).toContain('~80 g');
      expect(text).toContain('~25 g de proteína');
      expect(text).toContain('400-550 ml');
    }
    expect(m).not.toEqual(t);
    expect(mealTimingPlan('tarde', 'descanso', 80, false).map((s) => s.what).join(' ')).toMatch(/Sin entreno/);
  });

  it('en un dia doble no se come entre las dos partes; en uno normal no se promete carbohidrato durante', () => {
    const dbl = mealTimingPlan('tarde', 'alto', 80, true).find((s) => s.when === 'Durante')!.what;
    expect(dbl).toMatch(/Entre las dos partes/);
    const normal = mealTimingPlan('tarde', 'normal', 80, false).find((s) => s.when === 'Durante')!.what;
    expect(normal).toMatch(/no hace falta/);
  });
});

describe('horario por defecto', () => {
  it('el sabado entrena por la mañana y el resto de dias por la tarde', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(defaultTrainingSlot)).toEqual(['tarde', 'tarde', 'tarde', 'tarde', 'tarde', 'manana', 'tarde']);
  });
});

describe('resumen del dia', () => {
  it('da las mismas cantidades que el plan completo y una linea segun el dia y la hora', () => {
    for (const t of TYPES) {
      for (const slot of ['manana', 'tarde'] as TrainingSlot[]) {
        const g = nutritionGlance(t, slot, 82, false);
        expect(g.nutrition).toEqual(nutritionForDay(t, 82));
        expect(g.keyLine.length).toBeGreaterThan(20);
      }
    }
    expect(nutritionGlance('descanso', 'tarde', 82, false).keyLine).toMatch(/Sin entreno/);
    expect(nutritionGlance('normal', 'manana', 82, false).keyLine).toMatch(/mañana/);
    expect(nutritionGlance('normal', 'tarde', 82, false).keyLine).toMatch(/tarde/);
    expect(nutritionGlance('alto', 'tarde', 82, true).keyLine).toMatch(/solo agua/);
  });
});

describe('guia por manos', () => {
  it('las palmas y los puños del dia suman lo que pide el plan (±20 %), en cualquier peso, dia y horario', () => {
    for (const kg of [60, 82, 95]) {
      for (const t of TYPES) {
        for (const slot of ['manana', 'tarde'] as TrainingSlot[]) {
          const n = nutritionForDay(t, kg);
          const meals = handGuide(t, slot, kg);
          expect(meals).toHaveLength(4);
          const mid = (r: { lo: number; hi: number }) => (r.lo + r.hi) / 2;
          const protein = meals.reduce((s, m) => s + mid(m.palms), 0) * PALM_PROTEIN_G;
          const carbs = meals.reduce((s, m) => s + mid(m.fists), 0) * FIST_CARB_G;
          const pMid = (n.proteinG.min + n.proteinG.max) / 2;
          const cMid = (n.carbsG.min + n.carbsG.max) / 2;
          expect(Math.abs(protein - pMid) / pMid, `${kg} kg ${t} ${slot} proteina`).toBeLessThan(0.2);
          expect(Math.abs(carbs - cMid) / cMid, `${kg} kg ${t} ${slot} carbohidrato`).toBeLessThan(0.2);
        }
      }
    }
  });

  it('el dia de carga alta pide mas puños que el de descanso, y la toma de justo antes no lleva grasa', () => {
    const fists = (t: NutritionDayType) => handGuide(t, 'tarde', 82).reduce((s, m) => s + (m.fists.lo + m.fists.hi) / 2, 0);
    expect(fists('alto')).toBeGreaterThan(fists('normal'));
    expect(fists('normal')).toBeGreaterThan(fists('descanso'));
    expect(handGuide('normal', 'tarde', 82).find((m) => m.tag === '1-2 h antes')!.thumb).toBe(false);
    expect(handGuide('normal', 'manana', 82).find((m) => m.tag === '1-2 h antes')!.thumb).toBe(false);
  });

  it('formatServing escribe la racion en español', () => {
    expect(formatServing({ lo: 0.5, hi: 0.5 }, 'palma', 'palmas')).toBe('½ palma');
    expect(formatServing({ lo: 1, hi: 1 }, 'palma', 'palmas')).toBe('1 palma');
    expect(formatServing({ lo: 1, hi: 2 }, 'palma', 'palmas')).toBe('1-2 palmas');
    expect(formatServing({ lo: 3, hi: 3 }, 'puño', 'puños')).toBe('3 puños');
  });
});

describe('tendencia del peso', () => {
  const TODAY = '2026-03-01';
  /** Peso que cambia `pctPerWeek` % por semana (positivo = pierde), un pesaje cada 3 dias durante 4 semanas. */
  const series = (start: number, pctPerWeek: number): BodyweightEntry[] => {
    const out: BodyweightEntry[] = [];
    for (let back = 27; back >= 0; back -= 3) {
      const d = new Date(`${TODAY}T12:00:00`);
      d.setDate(d.getDate() - back);
      const weeks = (27 - back) / 7;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ date: iso, kg: Math.round(start * (1 - (pctPerWeek / 100) * weeks) * 100) / 100 });
    }
    return out;
  };

  it('sin pesajes suficientes no opina y explica que hace falta', () => {
    expect(analyzeWeightTrend([], TODAY).status).toBe('sin-datos');
    expect(analyzeWeightTrend([{ date: '2026-02-28', kg: 82 }, { date: '2026-03-01', kg: 82 }], TODAY).status).toBe('sin-datos');
    // 3 pesajes pero en 5 dias: insuficiente.
    const short = [{ date: '2026-02-24', kg: 82 }, { date: '2026-02-27', kg: 81.9 }, { date: '2026-03-01', kg: 81.8 }];
    expect(analyzeWeightTrend(short, TODAY).status).toBe('sin-datos');
    expect(analyzeWeightTrend([], TODAY).message).toMatch(/pesajes/);
  });

  it('clasifica el ritmo con los umbrales publicados: >1 rapido, 0.5-1 en objetivo, 0-0.5 lento, sin perdida', () => {
    const t = (pct: number) => analyzeWeightTrend(series(82, pct), TODAY);
    expect(t(1.5).status).toBe('rapido');
    expect(t(0.7).status).toBe('en-objetivo');
    expect(t(0.25).status).toBe('lento');
    expect(t(0).status).toBe('sin-perdida');
    expect(t(-0.4).status).toBe('sin-perdida');
    expect(t(0.7).lossPctPerWeek).toBeCloseTo(0.7, 1);
    expect(t(1.5).lossPctPerWeek).toBeCloseTo(1.5, 1);
    expect(t(1.5).message).toMatch(/sube algo el carbohidrato/);
    expect(t(0.7).message).toMatch(/Mantén/);
  });

  it('con la carga alta o la recuperacion tensa no se aprieta: manda sobre lento y sin perdida, pero NO sobre perder demasiado deprisa', () => {
    const strain = { highStrain: true };
    expect(analyzeWeightTrend(series(82, 0), TODAY, strain).message).toMatch(/no es momento de apretar/);
    expect(analyzeWeightTrend(series(82, 0.25), TODAY, strain).message).toMatch(/no es momento de apretar/);
    expect(analyzeWeightTrend(series(82, 1.5), TODAY, strain).status).toBe('rapido');
    // El estado sigue siendo el real aunque el mensaje sea de cautela.
    expect(analyzeWeightTrend(series(82, 0), TODAY, strain).status).toBe('sin-perdida');
  });

  it('ignora pesajes fuera de la ventana de 4 semanas y los futuros', () => {
    const old: BodyweightEntry[] = [{ date: '2025-10-01', kg: 100 }, { date: '2025-10-10', kg: 99 }, { date: '2025-10-20', kg: 98 }];
    expect(analyzeWeightTrend(old, TODAY).status).toBe('sin-datos');
    const withFuture = [...series(82, 0.7), { date: '2026-06-01', kg: 60 }];
    expect(analyzeWeightTrend(withFuture, TODAY).status).toBe('en-objetivo');
  });
});

describe('contenido fijo', () => {
  it('cita sus fuentes y los suplementos llevan dosis y nota', () => {
    for (const key of ['acsm', 'issn-protein', 'morton', 'helms', 'garthe', 'issn-creatine', 'issn-caffeine', 'drake', 'who', 'usda']) {
      expect(NUTRITION_SOURCES.some((s) => s.key === key), key).toBe(true);
    }
    for (const s of SUPPLEMENTS) {
      expect(s.dose.length, s.name).toBeGreaterThan(5);
      expect(s.note.length, s.name).toBeGreaterThan(20);
    }
    expect(SUPPLEMENTS.map((s) => s.name)).toEqual(['Creatina monohidrato', 'Cafeína', 'Proteína en polvo']);
    expect(FOOD_REFERENCE.filter((f) => f.group === 'proteina').length).toBeGreaterThanOrEqual(5);
    expect(FOOD_REFERENCE.filter((f) => f.group === 'carbohidrato').length).toBeGreaterThanOrEqual(5);
  });
});
