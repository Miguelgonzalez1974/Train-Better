import { describe, it, expect } from 'vitest';
import {
  answersFromCheck,
  checkFromCard,
  describeMorning,
  hasAnyAnswer,
  restingHrBaseline,
  soreRoleLevels,
  soreSummary,
  verdictFor,
} from './morningCheckIn';
import { applyPainFollowUps, PAIN_BETTER_DAYS } from './painFlags';
import { computeHrvPart } from './hrv';
import { getReadinessFactor, scoreCheck } from './readiness';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { PainFlag, ReadinessCheck, SessionBlockResult } from '../data/athlete/types';

const D = '2026-03-10';

describe('tarjeta de la mañana: de las respuestas al check-in de 4 ejes', () => {
  it('solo "Bien" equivale al check-in rápido de siempre: todo a favor', () => {
    const c = checkFromCard(D, { overall: 'bien' });
    expect([c.sleep, c.soreness, c.stress, c.motivation]).toEqual(['bien', 'ninguno', 'bajo', 'alta']);
    expect(getReadinessFactor(c).factor).toBeGreaterThan(1);
  });

  it('sin nada contestado los ejes quedan neutros, y hasAnyAnswer lo detecta', () => {
    expect(hasAnyAnswer({ overall: null })).toBe(false);
    expect(hasAnyAnswer({ overall: null, stress: 0 })).toBe(true);
    expect(hasAnyAnswer({ overall: null, soreZones: {} })).toBe(false);
    const c = checkFromCard(D, { overall: null, stress: 4 });
    expect([c.sleep, c.stress, c.motivation]).toEqual(['regular', 'alto', 'normal']);
  });

  it('el sueño sale de las horas y de la calidad, y manda la peor de las dos', () => {
    expect(checkFromCard(D, { overall: null, hours: 5.5 }).sleep).toBe('mal');
    expect(checkFromCard(D, { overall: null, hours: 6.5 }).sleep).toBe('regular');
    expect(checkFromCard(D, { overall: null, hours: 8 }).sleep).toBe('bien');
    expect(checkFromCard(D, { overall: null, quality: 2 }).sleep).toBe('mal');
    expect(checkFromCard(D, { overall: null, quality: 5 }).sleep).toBe('bien');
    expect(checkFromCard(D, { overall: null, hours: 8, quality: 2 }).sleep).toBe('mal');
  });

  it('las agujetas: una fuerte o tres zonas es "alto", una leve es "leve", y ninguna marcada es "ninguno"', () => {
    expect(checkFromCard(D, { overall: null, soreZones: { 'muslo-i': 2 } }).soreness).toBe('alto');
    expect(checkFromCard(D, { overall: null, soreZones: { 'muslo-i': 1, 'muslo-d': 1, lumbar: 1 } }).soreness).toBe('alto');
    expect(checkFromCard(D, { overall: null, soreZones: { 'hombro-d': 1 } }).soreness).toBe('leve');
    expect(checkFromCard(D, { overall: null, hours: 8 }).soreness).toBe('ninguno');
  });

  it('lo que contestas manda sobre el "Normal" de arriba y el resto sale de él', () => {
    const c = checkFromCard(D, { overall: 'normal', stress: 0, motivation: 4 });
    expect([c.stress, c.motivation, c.soreness, c.sleep]).toEqual(['bajo', 'alta', 'leve', 'regular']);
  });

  it('estrés y motivación agrupan sus 5 tramos', () => {
    const lows = checkFromCard(D, { overall: null, stress: 1, motivation: 1 });
    expect([lows.stress, lows.motivation]).toEqual(['bajo', 'baja']);
    const mids = checkFromCard(D, { overall: null, stress: 2, motivation: 2 });
    expect([mids.stress, mids.motivation]).toEqual(['medio', 'normal']);
    const highs = checkFromCard(D, { overall: null, stress: 3, motivation: 3 });
    expect([highs.stress, highs.motivation]).toEqual(['alto', 'alta']);
  });

  it('un día malo de verdad (poco sueño, agujetas fuertes y estrés alto) baja la carga', () => {
    const c = checkFromCard(D, { overall: null, hours: 5, soreZones: { 'muslo-i': 2 }, stress: 4 });
    expect(scoreCheck(c)).toBeLessThanOrEqual(-2);
    expect(getReadinessFactor(c).isLow).toBe(true);
  });

  it('guarda las respuestas y se pueden recuperar para corregir la tarjeta', () => {
    const answers = { overall: 'normal' as const, hours: 6.5, quality: 3, stress: 3, motivation: 1, soreZones: { 'hombro-d': 1 as const }, restingHr: 54 };
    const c = checkFromCard(D, answers);
    expect(answersFromCheck(c)).toEqual(answers);
    expect(answersFromCheck(undefined)).toEqual({ overall: null });
  });
});

describe('pulso en reposo', () => {
  const log = (vals: [string, number][]): ReadinessCheck[] => vals.map(([date, restingHr]) => ({ date, sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta', restingHr }));

  it('la media de las últimas dos semanas sin contar hoy, y solo con 3 o más mediciones', () => {
    expect(restingHrBaseline(log([['2026-03-08', 52], ['2026-03-09', 54]]), D)).toBeNull();
    expect(restingHrBaseline(log([['2026-03-07', 52], ['2026-03-08', 54], ['2026-03-09', 56]]), D)).toBe(54);
    expect(restingHrBaseline(log([['2026-03-07', 52], ['2026-03-08', 54], ['2026-03-09', 56], [D, 90]]), D)).toBe(54);
    expect(restingHrBaseline(log([['2026-02-01', 70], ['2026-02-02', 70], ['2026-02-03', 70]]), D)).toBeNull();
  });
});

describe('agujetas por zona', () => {
  it('cada músculo pesa sobre los roles del accesorio que carga, con el nivel más alto', () => {
    expect(soreRoleLevels({ 'hombro-d': 1, 'codo-i': 2 })).toEqual({ hPush: 2, vPush: 2, hPull: 2, vPull: 2 });
    expect(soreRoleLevels({ 'gemelo-i': 1 })).toEqual({ plyo: 1, unilateralLeg: 1 });
    expect(soreRoleLevels({ 'muslo-i': 1, 'cadera-d': 2 })).toEqual({ unilateralLeg: 2, plyo: 2, posterior: 2 });
    expect(soreRoleLevels(undefined)).toEqual({});
  });

  it('agrupa los avisos por el trabajo que recortan', () => {
    expect(soreSummary({ 'muslo-i': 1, 'muslo-d': 2, 'hombro-d': 1 })).toEqual([
      { text: 'piernas', level: 2 },
      { text: 'empuje y tirón', level: 1 },
    ]);
  });
});

describe('agujetas y accesorio de hoy', () => {
  // Con 6 días a la semana hay días de accesorio con piernas; con 5, de empuje y tirón (los roles salen del plan de superseries).
  const mk = (n: 5 | 6) => makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id: 'sore' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
  const dates = consecutiveDates('2026-01-05', 140);
  const accessory = (blocks: SessionBlockResult[]) => blocks.filter((b) => b.block === 'accessory' && b.accessoryRole);
  const LEGS = ['unilateralLeg', 'plyo', 'posterior'];
  const UPPER = ['hPush', 'vPush', 'hPull', 'vPull'];
  const gen = (profile: ReturnType<typeof mk>, soreZones: ReadinessCheck['soreZones'] | 'none', d: Date) => {
    if (soreZones === 'none') return generateSessionForDate(profile, [], d, profile.goals);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const check: ReadinessCheck = { date: iso, sleep: 'bien', soreness: 'leve', stress: 'bajo', motivation: 'alta', soreZones };
    return generateSessionForDate({ ...profile, readinessLog: [check] }, [], d, profile.goals);
  };

  it('con agujetas fuertes en las piernas el accesorio cambia el trabajo de piernas por otro', () => {
    const profile = mk(6);
    let withLegs = 0;
    for (const d of dates) {
      const base = accessory(gen(profile, 'none', d).blocks);
      if (!base.some((b) => LEGS.includes(b.accessoryRole!))) continue;
      withLegs += 1;
      const sore = accessory(gen(profile, { 'muslo-i': 2, 'muslo-d': 2 }, d).blocks);
      expect(sore.length, `${d.toDateString()} sigue con accesorio`).toBeGreaterThan(0);
      expect(sore.filter((b) => LEGS.includes(b.accessoryRole!)).map((b) => b.movementId)).toEqual([]);
    }
    expect(withLegs).toBeGreaterThan(5);
  });

  it('con agujetas fuertes en el hombro el accesorio cambia empujes y tirones por piernas', () => {
    const profile = mk(5);
    let withUpper = 0;
    for (const d of dates) {
      const base = accessory(gen(profile, 'none', d).blocks);
      if (!base.some((b) => UPPER.includes(b.accessoryRole!))) continue;
      withUpper += 1;
      const sore = accessory(gen(profile, { 'hombro-d': 2 }, d).blocks);
      expect(sore.filter((b) => UPPER.includes(b.accessoryRole!)).map((b) => b.movementId)).toEqual([]);
    }
    expect(withUpper).toBeGreaterThan(5);
  });

  it('con agujetas leves en las piernas ese trabajo sale con una serie menos (sin bajar de 2)', () => {
    const profile = mk(6);
    let compared = 0;
    for (const d of dates) {
      const base = accessory(gen(profile, 'none', d).blocks);
      const sore = accessory(gen(profile, { 'muslo-i': 1 }, d).blocks);
      for (const b of sore.filter((x) => LEGS.includes(x.accessoryRole!))) {
        expect(b.sets).toBeGreaterThanOrEqual(2);
        const same = base.find((x) => x.movementId === b.movementId && x.accessoryRole === b.accessoryRole);
        if (!same) continue;
        compared += 1;
        expect(b.sets).toBe(Math.max(2, same.sets! - 1));
      }
    }
    expect(compared).toBeGreaterThan(5);
  });

  it('sin agujetas marcadas el accesorio no cambia', () => {
    const profile = mk(6);
    for (const d of dates.slice(0, 60)) {
      const base = gen(profile, 'none', d).blocks.filter((b) => b.block === 'accessory');
      const same = gen(profile, undefined, d).blocks.filter((b) => b.block === 'accessory');
      expect(same.map((b) => [b.movementId, b.sets])).toEqual(base.map((b) => [b.movementId, b.sets]));
    }
  });
});

describe('seguimiento de los avisos de molestia', () => {
  const knee: PainFlag = { id: 'k', area: 'rodilla', createdDate: '2026-03-01', until: null };
  const shoulder: PainFlag = { id: 's', area: 'hombro', createdDate: '2026-03-01', until: '2026-03-30' };

  it('"ya pasó" lo quita hoy, "va mejor" lo deja caducar en unos días y "sigue" no toca nada', () => {
    const out = applyPainFollowUps([knee, shoulder], { k: 'paso', s: 'mejor' }, D);
    expect(out[0].clearedDate).toBe(D);
    expect(out[1].until).toBe('2026-03-13');
    expect(PAIN_BETTER_DAYS).toBe(3);
    expect(applyPainFollowUps([knee, shoulder], { k: 'sigue' }, D)).toEqual([knee, shoulder]);
  });

  it('"va mejor" no alarga un aviso que ya caducaba antes', () => {
    const soon: PainFlag = { id: 'x', area: 'codo-muneca', createdDate: '2026-03-08', until: '2026-03-11' };
    expect(applyPainFollowUps([soon], { x: 'mejor' }, D)[0].until).toBe('2026-03-11');
  });
});

describe('cómo llegas a entrenar, en una frase', () => {
  it('sale del nivel de la preparación y baja un escalón con una HRV o un pulso en contra', () => {
    expect(verdictFor({ level: 'alta', day: 'training', hrvLow: false })).toEqual({ text: 'Llegas bien: buen día para apretar', tone: 'good' });
    expect(verdictFor({ level: 'normal', day: 'training', hrvLow: false })?.tone).toBe('mid');
    expect(verdictFor({ level: 'normal', day: 'training', hrvLow: true })?.tone).toBe('bad');
    expect(verdictFor({ level: 'baja', day: 'training', hrvLow: false })?.text).toContain('Llegas justo');
    // con la preparación alta, una HRV baja suelta no la hunde
    expect(verdictFor({ level: 'alta', day: 'training', hrvLow: true })?.tone).toBe('good');
  });

  it('en descanso habla de recuperar, y sin nota o tras entrenar no dice nada', () => {
    expect(verdictFor({ level: 'baja', day: 'rest', hrvLow: false })?.text).toContain('necesitas recuperar');
    expect(verdictFor({ level: 'alta', day: 'rest', hrvLow: false })?.text).toBe('Vas muy bien de recuperación');
    expect(verdictFor({ level: null, day: 'training', hrvLow: false })).toBeNull();
    expect(verdictFor({ level: 'alta', day: 'trained', hrvLow: false })).toBeNull();
  });
});

describe('qué cambia hoy y qué solo se apunta', () => {
  const base: ReadinessCheck = { date: D, sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' };
  const knee: PainFlag = { id: 'k', area: 'rodilla', createdDate: '2026-03-01', until: null };
  const input = { check: base, day: 'training' as const, hasAccessory: true, factor: 1, flags: [], hrv: computeHrvPart([], D) };
  const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

  it('el factor del check-in sube, baja o mantiene la carga', () => {
    expect(texts(describeMorning({ ...input, factor: 1.04 }).changes)).toEqual(['Subo la intensidad un 4 %, el último tramo de la sesión']);
    expect(texts(describeMorning({ ...input, factor: 0.92 }).changes)).toEqual(['Reduzco la carga de hoy un 8 %']);
    expect(texts(describeMorning({ ...input, factor: 1 }).changes)).toEqual(['Mantengo la carga prevista']);
  });

  it('un día de descanso no promete carga y las agujetas solo cuentan para la preparación', () => {
    const r = describeMorning({ ...input, day: 'rest', check: { ...base, soreZones: { 'muslo-i': 2 } } });
    expect(texts(r.changes)).toEqual(['Hoy no hay sesión: lo que cuentas ajusta tu preparación de mañana']);
    expect(texts(r.notes)).toContain('Agujetas de piernas: cuentan para tu preparación');
  });

  it('las agujetas recortan el accesorio solo si hoy lo hay', () => {
    const check = { ...base, soreZones: { 'muslo-i': 1 as const, 'hombro-d': 2 as const } };
    const withAcc = describeMorning({ ...input, check });
    expect(texts(withAcc.changes)).toContain('Una serie menos de piernas en el accesorio');
    expect(texts(withAcc.changes)).toContain('Cambio empuje y tirón por otro trabajo en el accesorio');
    const noAcc = describeMorning({ ...input, check, hasAccessory: false });
    expect(texts(noAcc.changes).some((t) => t.includes('accesorio'))).toBe(false);
    expect(texts(noAcc.notes)).toContain('Agujetas de piernas: cuentan para tu preparación');
  });

  it('cada respuesta a un aviso de molestia dice lo que hace el motor, y lo que sigue activo se vuelve a preguntar mañana', () => {
    const sigue = describeMorning({ ...input, flags: [{ flag: knee, answer: 'sigue' }] });
    expect(texts(sigue.changes)).toContain('Sigo evitando sentadillas, zancadas, saltos e impacto (rodilla)');
    expect(texts(sigue.notes)).toContain('Mañana te preguntaré otra vez por rodilla');
    const mejor = describeMorning({ ...input, flags: [{ flag: knee, answer: 'mejor' }] });
    expect(texts(mejor.changes)[1]).toContain('Rodilla mejor');
    const paso = describeMorning({ ...input, flags: [{ flag: knee, answer: 'paso' }] });
    expect(texts(paso.changes)).toContain('Quito el aviso de rodilla: la carga vuelve poco a poco');
    expect(texts(paso.notes).some((t) => t.startsWith('Mañana'))).toBe(false);
  });

  it('el descanso de ayer cuenta como un cambio cuando suma a la nota, y no sale si no suma', () => {
    const r = describeMorning({ ...input, rest: { credit: 4, streak: 6, restDays: 1 } });
    expect(texts(r.changes)).toContain('Descansaste ayer tras 6 días seguidos: suma 4 puntos a tu preparación');
    const two = describeMorning({ ...input, rest: { credit: 1, streak: 5, restDays: 2 } });
    expect(texts(two.changes)).toContain('Llevas 2 días de descanso tras 5 días seguidos: suma 1 punto a tu preparación');
    expect(texts(describeMorning({ ...input, rest: { credit: 0, streak: 1, restDays: 1 } }).changes).some((t) => t.includes('Descansaste'))).toBe(false);
  });

  it('el sueño corto solo se apunta, y no inventa nada si no hay nada', () => {
    const r = describeMorning({ ...input, check: { ...base, sleepHours: 6.5 } });
    expect(texts(r.notes)).toEqual(['Sueño corto (6 h 30): lo apunto para aprender cuánto te afecta']);
    const quiet = describeMorning({ ...input, day: 'trained' });
    expect(texts(quiet.changes)).toEqual([]);
    expect(texts(quiet.notes)).toEqual(['Nada más cambia hoy']);
  });

  describe('HRV y pulso', () => {
    const prior = (hrv: number, hr: number, days: number): ReadinessCheck[] =>
      Array.from({ length: days }, (_, i) => {
        const d = new Date('2026-03-09T12:00:00');
        d.setDate(d.getDate() - i);
        // ±12 ms de variación día a día: un rango de unos 55–74 ms, que una sola medición baja no arrastra por sí sola
        return { ...base, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hrv: hrv + (i % 2 === 0 ? 12 : -12), restingHr: hr };
      });
    const describeWith = (log: ReadinessCheck[], check: ReadinessCheck) => describeMorning({ ...input, check, hrv: computeHrvPart([...log, check], D) });

    it('sin rango solo se apunta y dice cuántas mediciones llevas', () => {
      const check = { ...base, hrv: 64, restingHr: 67 };
      const r = describeWith(prior(64, 60, 3), check);
      expect(texts(r.notes)).toContain('HRV 64 ms apuntada: llevas 4 de 14 mediciones para calcular tu rango normal');
      // El pulso tiene su propia media (3 mediciones) y resta aunque la HRV aún no tenga rango.
      expect(texts(r.changes)).toContain('Pulso 67 ppm, 7 por encima de tu media (60): resta 2 puntos a tu preparación');
    });

    it('con el pulso como tu media solo se apunta', () => {
      const r = describeWith(prior(64, 55, 3), { ...base, restingHr: 56 });
      expect(texts(r.notes)).toContain('Pulso 56 ppm, como tu media (55)');
    });

    it('con rango, una HRV dentro de él no cambia nada, y una por debajo resta y cuenta como señal en contra de la carga', () => {
      const log = prior(64, 55, 20);
      const ok = describeWith(log, { ...base, hrv: 64, restingHr: 55, hrvVs: 'normal' });
      expect(texts(ok.notes).some((t) => t.startsWith('HRV 64 ms, dentro de tu rango'))).toBe(true);
      expect(texts(ok.changes).some((t) => t.includes('HRV'))).toBe(false);
      const low = describeWith(log, { ...base, hrv: 40, restingHr: 55, hrvVs: 'bajo' });
      expect(texts(low.changes).some((t) => /^Tu HRV de hoy \(40 ms, por debajo de tu rango \(\d+–\d+\)\): resta 3 puntos a tu preparación$/.test(t))).toBe(true);
      expect(texts(low.changes)).toContain('Una HRV baja cuenta como una señal en contra para la carga de hoy');
    });

    it('un pulso alto frente a tu media resta puntos', () => {
      const r = describeWith(prior(64, 55, 20), { ...base, hrv: 64, restingHr: 62 });
      expect(texts(r.changes)).toContain('Pulso 62 ppm, 7 por encima de tu media (55): resta 2 puntos a tu preparación');
    });
  });
});
