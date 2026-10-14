import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateSessionForDate, isCachedSessionStale, toHistoryEntry } from './generateSession';
import { doubleWodSlot, expectedStrengthSessionsPerWeek, getWeekdayIndex, isDoubleWodEnabled, setDoubleWodEnabled, toLocalIsoDate } from './periodization';
import { resolveWeekLocks } from './weekLocks';
import { getCatalogWod } from './wodCatalog';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getMovementById } from '../data/movements';
import { SESSION_GEN_VERSION, type DailySession, type SessionBlockResult, type SessionHistoryEntry } from '../data/athlete/types';

/**
 * Dia de doble WOD (como los martes/viernes de PushJerk): solo en el calendario de 6 dias, el
 * `trainingDayIndex` 4 (viernes), solo acondicionamiento — las dos piezas son WODs reales de las programaciones
 * (la 1 corta e intensa, la 2 la complementa); el generador solo entra de respaldo. Antes: parte 1 corta del generador y parte 2 un WOD
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

// Estado con el que arranca el motor (encendido): cada bloque de tests fija el que necesita y lo restaura.
const INITIAL = isDoubleWodEnabled();

describe('dia de doble WOD (6 dias)', () => {
  let all: Sample[] = [];
  let doubles: Sample[] = [];

  beforeAll(() => {
    setDoubleWodEnabled(true);
    all = sample();
    doubles = all.filter((s) => s.session.doubleWod);
  });
  afterAll(() => setDoubleWodEnabled(INITIAL));

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

  it('solo acondicionamiento + oly al cierre: calentamiento, dos WODs, oly, core opcional y vuelta a la calma; sin fuerza, skill ni accesorios', () => {
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const kinds = new Set(s.blocks.map((b) => b.block));
      for (const forbidden of ['strength', 'skill']) if (kinds.has(forbidden as never)) bad.push(`${s.date}: lleva ${forbidden}`);
      for (const needed of ['warmup', 'wod', 'oly', 'cooldown']) if (!kinds.has(needed as never)) bad.push(`${s.date}: falta ${needed}`);
      // el unico "accesorio" permitido es el core del dia
      for (const b of s.blocks.filter((x) => x.block === 'accessory')) if (!/^Core/.test(b.format ?? '')) bad.push(`${s.date}: accesorio no core ${b.movementId}`);
    }
    expect(bad).toEqual([]);
  });

  it('el oly del viernes es simetrico: Squat Snatch + un accesorio de snatch, Clean & Jerk + un accesorio de clean, con carga', () => {
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const working = s.blocks.filter((b) => b.block === 'oly' && !b.subgroup);
      const snatchWorking = working.filter((b) => b.movementId.includes('snatch'));
      const cleanWorking = working.filter((b) => b.movementId.includes('clean') || b.movementId.includes('jerk'));
      if (snatchWorking.length !== 2) bad.push(`${s.date}: snatch trae ${snatchWorking.length} entradas, no 2`);
      if (cleanWorking.length !== 2) bad.push(`${s.date}: clean trae ${cleanWorking.length} entradas, no 2`);
      if (!snatchWorking.some((b) => b.movementId === 'snatch')) bad.push(`${s.date}: falta el Squat Snatch`);
      if (!cleanWorking.some((b) => b.movementId === 'clean-and-jerk')) bad.push(`${s.date}: falta el Clean & Jerk`);
      for (const b of working) if (!b.loadKg) bad.push(`${s.date}: ${b.movementId} sin carga`);
    }
    expect(bad).toEqual([]);
  });

  /** El WOD real de una parte (de la biblioteca o de una programación servida como tarjeta). */
  const realOf = (blocks: SessionBlockResult[]) => {
    const head = blocks[0];
    const id = head?.wodCatalogId ?? (head?.wodLibraryId ? `lib:${head.wodLibraryId}` : undefined);
    return id ? getCatalogWod(id) : undefined;
  };

  it('dos partes bien formadas: parte 1 antes de la parte 2, las dos de programaciones reales y distintas, sin benchmark de test', () => {
    const bad: string[] = [];
    let real = 0;
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
      // Un benchmark de dia de test nunca; una programacion real servida como tarjeta (`wodCatalogId`) si.
      if (wod.some((x) => x.movementId.startsWith('benchmark:') && !x.wodCatalogId)) bad.push(`${s.date}: benchmark de test en doble`);
      const wa = realOf(a);
      const wb = realOf(b);
      if (wa && wb) {
        real++;
        if (wa.id === wb.id) bad.push(`${s.date}: la misma pieza dos veces`);
        if (wa.format === 'chipper') bad.push(`${s.date}: la parte 1 no puede ser un chipper`);
        if (a.some((x) => x.wodKind !== 'library')) bad.push(`${s.date}: parte 1 real sin su marca`);
      }
      if (!/^Parte 1 de 2/.test(a[0].notes ?? '') || !/^Parte 2 de 2/.test(b[0].notes ?? '')) bad.push(`${s.date}: notas sin la parte`);
      // La pantalla ya rotula "Parte N de 2": ni el titulo ni la nota lo repiten dentro.
      if (/parte \d de 2/i.test(`${a[0].title ?? ''} ${b[0].title ?? ''}`)) bad.push(`${s.date}: la parte va dentro del titulo`);
    }
    expect(bad).toEqual([]);
    expect(real / doubles.length, `${real}/${doubles.length} dobles con las dos piezas reales`).toBeGreaterThan(0.95);
  });

  it('la parte 1 es corta e intensa y la parte 2 la complementa: otro dominio, ningun movimiento compartido y pocos patrones compartidos', () => {
    let pairs = 0;
    let otherDomain = 0;
    let sharedPatterns = 0;
    let otherFormat = 0;
    let minutesA = 0;
    let minutesB = 0;
    const bad: string[] = [];
    for (const { session: s } of doubles) {
      const a = realOf(s.blocks.filter((x) => x.wodPart === 1));
      const b = realOf(s.blocks.filter((x) => x.wodPart === 2));
      if (!a || !b) continue;
      pairs++;
      if (a.movementIds.some((id) => b.movementIds.includes(id))) bad.push(`${s.date}: movimiento repetido entre partes (${a.name} / ${b.name})`);
      if (a.leadDomain !== b.leadDomain) otherDomain++;
      const pa = new Set(a.movementIds.map((id) => getMovementById(id)?.pattern));
      if (b.movementIds.some((id) => pa.has(getMovementById(id)?.pattern))) sharedPatterns++;
      if (a.format !== b.format) otherFormat++;
      minutesA += a.durationMin ?? 0;
      minutesB += b.durationMin ?? 0;
      if ((a.durationMin ?? 99) > 14) bad.push(`${s.date}: la parte 1 dura ${a.durationMin} min (${a.name})`);
    }
    expect(bad).toEqual([]);
    expect(pairs).toBeGreaterThan(20);
    expect(otherDomain / pairs, 'otro dominio').toBeGreaterThan(0.7);
    expect(sharedPatterns / pairs, 'patrones compartidos').toBeLessThan(0.3);
    expect(otherFormat / pairs, 'otro formato').toBeGreaterThan(0.6);
    expect(minutesA / pairs, 'la parte 1 es la corta').toBeLessThan(minutesB / pairs);
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

  it('planificacion: el doble solo lo mete el coach en Intensificacion (2a mitad) y Pico; nunca en Acumulacion ni descarga', () => {
    expect(isDoubleWodEnabled()).toBe(true);
    expect(expectedStrengthSessionsPerWeek(6)).toBe(5);
    const prog = (phaseIndex: 1 | 2 | 3 | 4, weekInPhase = 1, phaseLengthWeeks = 1) => ({ phaseIndex, weekInPhase, phaseLengthWeeks });
    expect(doubleWodSlot(6, prog(1))).toBe(-1);
    expect(doubleWodSlot(6, prog(2))).toBe(4); // fases de 1 semana: toda la Intensificacion
    expect(doubleWodSlot(6, prog(3))).toBe(4);
    expect(doubleWodSlot(6, prog(4))).toBe(-1);
    // Con fases largas, solo la segunda mitad de la Intensificacion
    expect(doubleWodSlot(6, prog(2, 1, 4))).toBe(-1);
    expect(doubleWodSlot(6, prog(2, 2, 4))).toBe(-1);
    expect(doubleWodSlot(6, prog(2, 3, 4))).toBe(4);
    expect(doubleWodSlot(6, prog(2, 4, 4))).toBe(4);
    expect(doubleWodSlot(6, prog(3, 1, 4))).toBe(4);
    for (const n of [3, 4, 5] as const) expect(doubleWodSlot(n, prog(3))).toBe(-1);
  });

  it('las semanas de Acumulacion y descarga no llevan doble: el viernes es de peso muerto', () => {
    const doubleWeeks = new Set(doubles.map((d) => d.week));
    let checked = 0;
    for (const s of all) {
      if (getWeekdayIndex(s.date) !== 4 || s.session.mesocycleWeek === 0) continue;
      if (s.session.mesocycleWeek === 1 || s.session.mesocycleWeek === 4) {
        expect(doubleWeeks.has(s.week), `${s.session.date}: doble en fase ${s.session.mesocycleWeek}`).toBe(false);
        const st = s.session.blocks.find((b) => b.block === 'strength');
        if (s.session.mesocycleWeek === 1 && st) {
          expect(getMovementById(st.movementId)?.pattern, s.session.date).toBe('hinge');
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
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
  // Un atleta que ya entrena: 4 semanas previas de 5 sesiones a la semana (RPE 7, 60 min).
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
  afterAll(() => setDoubleWodEnabled(INITIAL));

  it('al planificar la semana, el viernes se bloquea como doble (sin fuerza, pero con oly) y el resto como dias normales', () => {
    const locks = plannedProfile().weeklyLocks ?? {};
    expect(locks[iso(FRI)]?.doubleWod).toBe(true);
    expect(locks[iso(FRI)]?.strengthMovementId).toBeUndefined();
    expect(locks[iso(FRI)]?.olyMovementId).toBeTruthy();
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
      expect(s.blocks.some((b) => b.block === 'strength'), `${h.length} sesiones previas`).toBe(false);
      expect(s.blocks.some((b) => b.block === 'oly'), `${h.length} sesiones previas`).toBe(true);
    }
  });

  it('un viernes planificado como normal por un motor que ya conocia el doble (bloqueo decidido) no pasa a doble despues, y la cache doble queda vieja', () => {
    const p = baseProfile();
    const decidedNormal = {
      ...p,
      weeklyLocks: { [iso(FRI)]: { strengthMovementId: 'back-squat', doubleDecided: true, split: true, plannedOn: iso(MON) } },
    };
    const lock = decidedNormal.weeklyLocks[iso(FRI)];
    const s = generateSessionForDate(decidedNormal, chronic(), FRI, goalsOf(p));
    expect(s.doubleWod).toBeUndefined();
    expect(s.doubleWodSkipped).toBeUndefined();
    expect(s.blocks.some((b) => b.block === 'strength')).toBe(true);
    const cachedDouble: DailySession = { ...generateSessionForDate(baseProfile(), chronic(), FRI, goalsOf(p)), genVersion: SESSION_GEN_VERSION };
    expect(cachedDouble.doubleWod).toBe(true);
    expect(isCachedSessionStale(cachedDouble, lock)).toBe(true);
  });

  it('un bloqueo anterior al doble (sin marca "decidido") no decide la estructura: el viernes se resuelve con el estado de hoy y la cache no lo toma por desacuerdo', () => {
    // Semana bloqueada por una version que aun no conocia el doble: planificada con el interruptor apagado.
    setDoubleWodEnabled(false);
    const p = baseProfile();
    const legacy = resolveWeekLocks(p, chronic(), goalsOf(p), iso(MON), MON);
    setDoubleWodEnabled(true);
    const lock = legacy.weeklyLocks?.[iso(FRI)];
    expect(lock?.strengthMovementId, 'el viernes viejo llevaba fuerza').toBeTruthy();
    expect(lock?.doubleDecided).toBeUndefined();
    const s = generateSessionForDate(legacy, chronic(), FRI, goalsOf(p));
    expect(s.doubleWod).toBe(true);
    expect(isCachedSessionStale({ ...s, genVersion: SESSION_GEN_VERSION }, lock)).toBe(false);
    // Los demas dias de esa semana conservan su fuerza bloqueada.
    for (const d of [days[0], TUE, WED, SAT]) expect(legacy.weeklyLocks?.[iso(d)]?.strengthMovementId, iso(d)).toBeTruthy();
  });

  it('el plan no depende de la carga simulada: con historial vacio (sin base cronica) el viernes tambien se planifica como doble, y el veto por estado real llega el dia de verdad', () => {
    const p = baseProfile();
    const planned = resolveWeekLocks(p, [], goalsOf(p), iso(MON), MON);
    expect(planned.weeklyLocks?.[iso(FRI)]?.doubleWod).toBe(true);
    expect(planned.weeklyLocks?.[iso(FRI)]?.doubleDecided).toBe(true);
    // Ese viernes, con una semana real de sobrecarga (RPE 9 seguido), se vetea igual.
    const past = (offset: number) => {
      const d = new Date(FRI);
      d.setDate(d.getDate() - offset);
      return entry(iso(d), 9, 60);
    };
    const hard = [28, 26, 24, 22, 20, 18, 16, 14, 12].map((o) => ({ ...past(o), rpe: 8, durationMin: 90 })).concat([past(6), past(3), past(1)]);
    const s = generateSessionForDate(planned, hard, FRI, goalsOf(p));
    expect(s.doubleWod).toBeUndefined();
    expect(s.doubleWodSkipped).toBe(true);
  });

  it('en una descarga forzada la semana no lleva hueco de doble en el microciclo: los 5 dias reparten fuerza como en cualquier descarga', () => {
    const p = baseProfile();
    const past = (offset: number, rpe: number, durationMin: number) => {
      const d = new Date(FRI);
      d.setDate(d.getDate() - offset);
      return entry(iso(d), rpe, durationMin);
    };
    const hard = [28, 26, 24, 22, 20, 18, 16, 14, 12].map((o) => past(o, 8, 90)).concat([past(6, 9, 60), past(3, 9, 60), past(1, 9, 60)]);
    const s = generateSessionForDate(p, hard, FRI, goalsOf(p));
    expect(s.mesocycleWeek).toBe(4);
    expect(s.doubleWod).toBeUndefined();
    expect(s.blocks.some((b) => b.block === 'strength')).toBe(true);
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
    // Aqui solo interesa aislar el chequeo de la bandera doubleWod (el de fuerza/oly bloqueados ya
    // tiene su propio test): se quitan esos bloques para que un movimiento de otro dia (sabado) no
    // dispare un desacuerdo de bloqueo que no es lo que este test comprueba.
    const normalBlocks = normal.blocks.filter((b) => b.block !== 'strength' && b.block !== 'oly');
    expect(isCachedSessionStale({ ...asNormal, blocks: normalBlocks } as DailySession, lock)).toBe(true);
    expect(isCachedSessionStale({ ...asNormal, blocks: normalBlocks, doubleWodSkipped: true } as DailySession, lock)).toBe(false);
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

describe('interruptor del doble WOD', () => {
  it('el motor arranca con el doble encendido', () => {
    expect(INITIAL).toBe(true);
  });
});

describe('doble WOD apagado', () => {
  beforeAll(() => setDoubleWodEnabled(false));
  afterAll(() => setDoubleWodEnabled(INITIAL));

  it('no genera ningun doble y la planificacion no cambia', () => {
    expect(isDoubleWodEnabled()).toBe(false);
    expect(expectedStrengthSessionsPerWeek(6)).toBe(5);
    expect(doubleWodSlot(6, { phaseIndex: 3, weekInPhase: 1, phaseLengthWeeks: 1 })).toBe(-1);
    const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id: 'a' })] });
    for (const d of consecutiveDates('2026-01-05', 84)) {
      expect(generateSessionForDate(profile, [], d, profile.goals).doubleWod, d.toISOString()).toBeUndefined();
    }
  });
});
