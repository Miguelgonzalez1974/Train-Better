import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateSessionForDate, isCachedSessionStale, toHistoryEntry } from './generateSession';
import { doubleWodSlot, expectedStrengthSessionsPerWeek, getWeekdayIndex, isDoubleWodEnabled, setDoubleWodEnabled, toLocalIsoDate } from './periodization';
import { resolveWeekLocks } from './weekLocks';
import { dominantWodDomain } from './wodDomains';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getMovementById } from '../data/movements';
import { SESSION_GEN_VERSION, type DailySession, type SessionHistoryEntry } from '../data/athlete/types';

/**
 * Dia de doble WOD (como los martes/viernes de PushJerk): solo en el calendario de 6 dias, el
 * `trainingDayIndex` 4 (viernes), solo acondicionamiento — parte 1 corta del generador y parte 2 un WOD
 * real de la biblioteca que la complementa. Fase 1: motor y planificacion; la pantalla llega despues.
 */

interface Sample {
  week: string;
  date: Date;
  session: DailySession;
}

function sample(): Sample[] {
  const out: Sample[] = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    for (const d of consecutiveDates('2026-01-05', 168)) {
      const week = `${id}-${Math.floor((d.getTime() - new Date(2026, 0, 5).getTime()) / (7 * 86400000))}`;
      out.push({ week, date: d, session: generateSessionForDate(profile, [], d, profile.goals) });
    }
  }
  return out;
}

describe('dia de doble WOD (6 dias)', () => {
  let all: Sample[] = [];
  let doubles: Sample[] = [];

  beforeAll(() => {
    setDoubleWodEnabled(true);
    all = sample();
    doubles = all.filter((s) => s.session.doubleWod);
  });
  afterAll(() => setDoubleWodEnabled(false));

  it('hay dobles, como mucho uno por semana, siempre en viernes, y nunca en descarga', () => {
    expect(doubles.length, 'nunca salio un doble').toBeGreaterThan(30);
    const perWeek = new Map<string, number>();
    const bad: string[] = [];
    for (const s of doubles) {
      perWeek.set(s.week, (perWeek.get(s.week) ?? 0) + 1);
      if (getWeekdayIndex(s.date) !== 4) bad.push(`${s.session.date}: no es viernes`);
      if (s.session.mesocycleWeek === 4) bad.push(`${s.session.date}: en semana de descarga`);
      if (s.session.deloadReason) bad.push(`${s.session.date}: con motivo de descarga`);
    }
    expect(bad).toEqual([]);
    expect(Math.max(...perWeek.values())).toBe(1);
  });

  it('solo acondicionamiento: calentamiento, dos WODs, core opcional y vuelta a la calma; sin fuerza, oly, skill ni accesorios', () => {
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const kinds = new Set(s.blocks.map((b) => b.block));
      for (const forbidden of ['strength', 'oly', 'skill']) if (kinds.has(forbidden as never)) bad.push(`${s.date}: lleva ${forbidden}`);
      for (const needed of ['warmup', 'wod', 'cooldown']) if (!kinds.has(needed as never)) bad.push(`${s.date}: falta ${needed}`);
      // el unico "accesorio" permitido es el core del dia
      for (const b of s.blocks.filter((x) => x.block === 'accessory')) if (!/^Core/.test(b.format ?? '')) bad.push(`${s.date}: accesorio no core ${b.movementId}`);
    }
    expect(bad).toEqual([]);
  });

  it('dos partes bien formadas: parte 1 (1 entrada o mas) antes de la parte 2, formatos y titulos distintos, sin benchmark', () => {
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const wod = s.blocks.filter((b) => b.block === 'wod');
      const parts = wod.map((b) => b.wodPart);
      if (parts.some((p) => p === undefined)) bad.push(`${s.date}: entrada de WOD sin parte`);
      const firstTwo = parts.indexOf(2);
      if (firstTwo <= 0 || parts.slice(0, firstTwo).some((p) => p !== 1) || parts.slice(firstTwo).some((p) => p !== 2)) {
        bad.push(`${s.date}: partes desordenadas (${parts.join('')})`);
        continue;
      }
      const a = wod.filter((b) => b.wodPart === 1);
      const b = wod.filter((x) => x.wodPart === 2);
      if (wod.some((x) => x.movementId.startsWith('benchmark:'))) bad.push(`${s.date}: benchmark en doble`);
      if (a[0].format === b[0].format) bad.push(`${s.date}: mismo formato en las dos partes`);
      if (a[0].wodKind === 'library' || a[0].wodKind === 'chipper' || a[0].wodKind === 'cardioChipper') bad.push(`${s.date}: parte 1 no puede ser ${a[0].wodKind}`);
      if (!/parte 1 de 2/.test(a[0].title ?? '') || !/parte 2 de 2/.test(b[0].title ?? '')) bad.push(`${s.date}: titulos sin parte`);
    }
    expect(bad).toEqual([]);
  });

  it('la parte 2 es un WOD real que complementa a la parte 1: otro dominio y ningun patron ni movimiento compartido', () => {
    let library = 0;
    let complementary = 0;
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const a = s.blocks.filter((b) => b.wodPart === 1);
      const b = s.blocks.filter((x) => x.wodPart === 2);
      if (!b[0]?.wodLibraryId) continue;
      library++;
      if (b.length > 5) bad.push(`${s.date}: parte 2 de ${b.length} lineas`);
      const aIds = new Set(a.map((x) => x.movementId));
      if (b.some((x) => aIds.has(x.movementId))) bad.push(`${s.date}: movimiento repetido entre partes`);
      const pa = new Set(a.map((x) => getMovementById(x.movementId)?.pattern));
      const sharesPattern = b.some((x) => pa.has(getMovementById(x.movementId)?.pattern));
      const sameDomain = dominantWodDomain(a.map((x) => x.movementId)) === dominantWodDomain(b.map((x) => x.movementId));
      if (!sharesPattern && !sameDomain) complementary++;
    }
    expect(bad).toEqual([]);
    expect(library, 'la parte 2 casi siempre debe ser real').toBeGreaterThan(doubles.length * 0.9);
    expect(complementary / library, `${complementary}/${library} complementarios`).toBeGreaterThan(0.9);
  });

  it('las semanas con doble siguen cubriendo los 4 patrones de fuerza en sus 4 dias de fuerza', () => {
    const doubleWeeks = new Set(doubles.map((d) => d.week));
    const patterns = new Map<string, Set<string>>();
    const strengthDays = new Map<string, number>();
    for (const s of all) {
      if (!doubleWeeks.has(s.week)) continue;
      const st = s.session.blocks.find((b) => b.block === 'strength');
      if (!st) continue;
      strengthDays.set(s.week, (strengthDays.get(s.week) ?? 0) + 1);
      const p = getMovementById(st.movementId)?.pattern;
      if (p) (patterns.get(s.week) ?? patterns.set(s.week, new Set()).get(s.week)!).add(p);
    }
    for (const w of doubleWeeks) {
      expect(strengthDays.get(w), `${w}: dias de fuerza`).toBe(4);
      expect(patterns.get(w)?.size ?? 0, `${w}: patrones distintos`).toBeGreaterThanOrEqual(3);
    }
  });

  it('planificacion: con el doble activo, 6 dias = 4 sesiones de fuerza esperadas y el hueco solo existe fuera de descarga', () => {
    expect(isDoubleWodEnabled()).toBe(true);
    expect(expectedStrengthSessionsPerWeek(6)).toBe(4);
    expect(doubleWodSlot(6, 1)).toBe(4);
    expect(doubleWodSlot(6, 3)).toBe(4);
    expect(doubleWodSlot(6, 4)).toBe(-1);
    for (const n of [3, 4, 5] as const) expect(doubleWodSlot(n, 1)).toBe(-1);
  });
});

describe('doble WOD y bloqueo semanal (fase 2)', () => {
  // Semana 2 del macro fixture (lunes 12 ene): la primera semana va siempre completa y nunca es doble.
  const MON = new Date(2026, 0, 12);
  const days = consecutiveDates('2026-01-12', 7);
  const [, TUE, WED, THU, FRI, SAT] = days;
  const iso = toLocalIsoDate;
  const goalsOf = (p: ReturnType<typeof makeProfile>) => p.goals;
  const baseProfile = () => makeProfile({ trainingDaysPerWeek: 6, bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
  const entry = (date: string, rpe = 7, durationMin = 60): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });
  // Un atleta que ya entrena: 4 semanas previas de 5 sesiones a la semana (RPE 7, 60 min). Sin base cronica,
  // las 4 sesiones "simuladas" de lunes a jueves disparan un ACWR alto y la semana se planifica en descarga.
  const chronic = (): SessionHistoryEntry[] => {
    const out: SessionHistoryEntry[] = [];
    for (let back = 28; back >= 1; back--) {
      const d = new Date(MON);
      d.setDate(d.getDate() - back);
      if (getWeekdayIndex(d) === 3 || getWeekdayIndex(d) === 6) continue;
      out.push({ ...entry(iso(d)), mesocycleWeek: 1 });
    }
    return out;
  };
  const plannedProfile = () => {
    const p = baseProfile();
    return resolveWeekLocks(p, chronic(), goalsOf(p), iso(MON), MON);
  };

  beforeAll(() => setDoubleWodEnabled(true));
  afterAll(() => setDoubleWodEnabled(false));

  it('al planificar la semana, el viernes se bloquea como doble (sin fuerza ni oly) y el resto como dias normales', () => {
    const locks = plannedProfile().weeklyLocks ?? {};
    expect(locks[iso(FRI)]?.doubleWod).toBe(true);
    expect(locks[iso(FRI)]?.strengthMovementId).toBeUndefined();
    expect(locks[iso(FRI)]?.olyMovementId).toBeUndefined();
    for (const d of [days[0], TUE, WED, SAT]) {
      expect(locks[iso(d)]?.doubleWod, iso(d)).toBeUndefined();
      expect(locks[iso(d)]?.strengthMovementId, iso(d)).toBeTruthy();
    }
    expect(Object.values(locks).filter((l) => l.doubleWod).length).toBe(1);
  });

  it('el viernes bloqueado sale doble tambien con historial distinto (entrenando de lunes a jueves): la estructura no cambia', () => {
    const p = plannedProfile();
    const histories: SessionHistoryEntry[][] = [
      chronic(),
      [...chronic(), entry(iso(days[0]))],
      [...chronic(), entry(iso(days[0])), entry(iso(TUE), 8), entry(iso(WED), 7)],
      [...chronic(), entry(iso(days[0])), entry(iso(TUE)), entry(iso(WED)), entry(iso(THU), 6, 45)],
    ];
    for (const h of histories) {
      const s = generateSessionForDate(p, h, FRI, goalsOf(p));
      expect(s.doubleWod, `${h.length} sesiones previas`).toBe(true);
      expect(s.blocks.some((b) => b.block === 'strength' || b.block === 'oly')).toBe(false);
    }
  });

  it('un viernes planificado como normal (semana bloqueada con el doble apagado) no pasa a doble despues', () => {
    setDoubleWodEnabled(false);
    const p = baseProfile();
    const oldPlan = resolveWeekLocks(p, chronic(), goalsOf(p), iso(MON), MON);
    setDoubleWodEnabled(true);
    expect(oldPlan.weeklyLocks?.[iso(FRI)]?.doubleWod).toBeUndefined();
    const s = generateSessionForDate(oldPlan, chronic(), FRI, goalsOf(p));
    expect(s.doubleWod).toBeUndefined();
    expect(s.doubleWodSkipped).toBeUndefined();
    expect(s.blocks.some((b) => b.block === 'strength')).toBe(true);
    // Y una sesion doble cacheada antes de esa planificacion se considera vieja: la cache no contradice al bloqueo.
    const cachedDouble: DailySession = { ...generateSessionForDate(baseProfile(), chronic(), FRI, goalsOf(p)), genVersion: SESSION_GEN_VERSION };
    expect(cachedDouble.doubleWod).toBe(true);
    expect(isCachedSessionStale(cachedDouble, oldPlan.weeklyLocks?.[iso(FRI)])).toBe(true);
  });

  it('veto de seguridad: planificado como doble pero con sobrecarga hoy (descarga) sale normal, marcado como omitido, y no cuenta como desacuerdo con el bloqueo', () => {
    const p = plannedProfile();
    const past = (offset: number, rpe = 9, durationMin = 60) => {
      const d = new Date(FRI);
      d.setDate(d.getDate() - offset);
      return entry(iso(d), rpe, durationMin);
    };
    const base = [28, 26, 24, 22, 20, 18, 16, 14, 12].map((o) => past(o, 8, 90));
    const hard = [...base, past(6), past(3), past(1)];
    // El bloqueo se planifico con la base normal; el veto llega despues, con la sobrecarga real.
    const s = generateSessionForDate(p, hard, FRI, goalsOf(p));
    expect(s.deloadReason).toBeTruthy();
    expect(s.doubleWod).toBeUndefined();
    expect(s.doubleWodSkipped).toBe(true);
    expect(s.blocks.some((b) => b.block === 'strength')).toBe(true);
    const lock = p.weeklyLocks?.[iso(FRI)];
    expect(isCachedSessionStale({ ...s, genVersion: SESSION_GEN_VERSION }, lock)).toBe(false);
  });

  it('cache vs bloqueo: un dia normal sin veto cacheado sobre un bloqueo doble esta viejo; uno doble bajo un bloqueo doble, no', () => {
    const p = plannedProfile();
    const lock = p.weeklyLocks?.[iso(FRI)];
    const double: DailySession = { ...generateSessionForDate(p, chronic(), FRI, goalsOf(p)), genVersion: SESSION_GEN_VERSION };
    expect(double.doubleWod).toBe(true);
    expect(isCachedSessionStale(double, lock)).toBe(false);
    const { doubleWod: _d, ...asNormal } = double;
    const normal = { ...generateSessionForDate(baseProfile(), [], SAT, goalsOf(p)), date: iso(FRI), genVersion: SESSION_GEN_VERSION };
    expect(isCachedSessionStale({ ...asNormal, blocks: normal.blocks } as DailySession, lock)).toBe(true);
    expect(isCachedSessionStale({ ...asNormal, blocks: normal.blocks, doubleWodSkipped: true } as DailySession, lock)).toBe(false);
  });

  it('tras un dia perdido la semana se re-planifica y el viernes sigue siendo doble', () => {
    const planned = plannedProfile();
    const monday = generateSessionForDate(planned, chronic(), days[0], goalsOf(planned));
    const history = [...chronic(), toHistoryEntry(monday, 'rx', 7, 60)];
    // El martes se pierde; hoy es miercoles.
    const replanned = resolveWeekLocks(planned, history, goalsOf(planned), iso(WED), WED);
    expect(replanned.weeklyLocks?.[iso(FRI)]?.doubleWod).toBe(true);
    expect(replanned.weeklyLocks?.[iso(FRI)]?.plannedOn).toBe(iso(WED));
    const s = generateSessionForDate(replanned, history, FRI, goalsOf(planned));
    expect(s.doubleWod).toBe(true);
    expect(Object.values(replanned.weeklyLocks ?? {}).filter((l) => l.doubleWod && (l.plannedOn ?? '') >= iso(WED)).length).toBe(1);
  });

  it('con el doble apagado el bloqueo de esa semana no marca ningun dia como doble', () => {
    setDoubleWodEnabled(false);
    const locks = plannedProfile().weeklyLocks ?? {};
    setDoubleWodEnabled(true);
    expect(Object.values(locks).some((l) => l.doubleWod)).toBe(false);
  });
});

describe('doble WOD apagado (estado por defecto)', () => {
  it('no genera ningun doble y la planificacion no cambia', () => {
    expect(isDoubleWodEnabled()).toBe(false);
    expect(expectedStrengthSessionsPerWeek(6)).toBe(5);
    expect(doubleWodSlot(6, 1)).toBe(-1);
    const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'a' })] });
    for (const d of consecutiveDates('2026-01-05', 84)) {
      expect(generateSessionForDate(profile, [], d, profile.goals).doubleWod, d.toISOString()).toBeUndefined();
    }
  });
});
