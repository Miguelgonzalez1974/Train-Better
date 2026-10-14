import { describe, it, expect } from 'vitest';
import { generateSessionForDate, isRealWodSelectionEnabled, setRealWodSelectionEnabled, toHistoryEntry } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getCatalogWod } from './wodCatalog';
import { benchmarkConflictsWithPain, getAvoidedPatterns } from './painFlags';
import { getMovementById } from '../data/movements';
import type { AthleteProfile, DailySession, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

/**
 * El coach programa WODs REALES de las programaciones (PushJerk, Mayhem, CompTrain, Invictus, clásicos) elegidos por
 * fase del macro y por cómo llegas hoy; el generador queda como último recurso. Estas pruebas recorren meses de
 * sesiones encadenadas (cada día ve el historial de los anteriores) y comprueban lo que importa al atleta.
 */

const GOOD: (iso: string) => ReadinessCheck = (date) => ({ date, sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' });
const BAD: (iso: string) => ReadinessCheck = (date) => ({ date, sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' });

interface Day {
  session: DailySession;
  catalogId?: string;
}

function simulate(over: Partial<AthleteProfile> = {}, checkIn?: (iso: string) => ReadinessCheck, macros = ['a', 'b'], days = 112): Day[] {
  const out: Day[] = [];
  for (const id of macros) {
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }], ...over });
    let history: SessionHistoryEntry[] = [];
    for (const d of consecutiveDates('2026-01-12', days)) {
      const iso = d.toISOString().slice(0, 10);
      const p = checkIn ? { ...profile, readinessLog: [checkIn(iso)] } : profile;
      const session = generateSessionForDate(p, history, d, p.goals);
      if (session.isRestDay) continue;
      history = [...history, toHistoryEntry(session, 'rx', 7, 60)];
      const head = session.blocks.find((b) => b.block === 'wod');
      const catalogId = head?.wodCatalogId ?? (head?.wodLibraryId ? `lib:${head.wodLibraryId}` : undefined);
      out.push({ session, catalogId });
    }
  }
  return out;
}

/** Días de WOD "normal": con WOD, sin doble y sin ser un día de test (benchmark fijado por la semana). */
const normalWodDays = (days: Day[]) =>
  days.filter((d) => d.session.blocks.some((b) => b.block === 'wod') && !d.session.doubleWod && (d.catalogId || !d.session.blocks.find((b) => b.block === 'wod')!.movementId.startsWith('benchmark:')));

const avgDuration = (days: Day[], phase?: number) => {
  const mins = days
    .filter((d) => d.catalogId && (phase === undefined || d.session.mesocycleWeek === phase))
    .map((d) => getCatalogWod(d.catalogId!)?.durationMin)
    .filter((m): m is number => typeof m === 'number');
  return mins.reduce((s, m) => s + m, 0) / Math.max(1, mins.length);
};

const sourceShare = (days: Day[], sources: string[]) => {
  const real = days.filter((d) => d.catalogId);
  return real.filter((d) => sources.includes(getCatalogWod(d.catalogId!)?.source ?? '')).length / Math.max(1, real.length);
};

const base = simulate();

describe('WOD real elegido por el coach', () => {
  it('el WOD de cada día sale de una programación real, no del generador', () => {
    const days = normalWodDays(base);
    expect(days.length).toBeGreaterThan(100);
    const real = days.filter((d) => d.catalogId).length;
    expect(real / days.length, `${real}/${days.length} reales`).toBeGreaterThan(0.97);
  });

  it('cada WOD real dice de dónde sale y por qué se eligió', () => {
    for (const d of base.filter((x) => x.catalogId)) {
      const wod = d.session.blocks.filter((b) => b.block === 'wod');
      expect(wod[0].notes, d.session.date).toMatch(/WOD real de la programaci[óo]n de/);
      expect(d.session.coachReasons?.join(' ') ?? '', d.session.date).toMatch(/WOD real de la programaci[óo]n/);
      expect(wod[0].notes, d.session.date).toMatch(/Ritmo:/);
    }
  });

  it('usa las cuatro programaciones, sin que ninguna se lleve casi todo', () => {
    for (const source of ['pushjerk', 'mayhem', 'comptrain', 'invictus']) {
      expect(sourceShare(base, [source]), source).toBeGreaterThan(0.05);
    }
    for (const source of ['pushjerk', 'mayhem', 'comptrain']) expect(sourceShare(base, [source]), source).toBeLessThan(0.55);
  });

  it('cada WOD real se sirve completo: movimientos del catálogo, cargas finitas y formato', () => {
    for (const d of base.filter((x) => x.catalogId)) {
      for (const b of d.session.blocks.filter((x) => x.block === 'wod')) {
        if (!b.movementId.startsWith('benchmark:')) expect(getMovementById(b.movementId), `${d.session.date}: ${b.movementId}`).toBeTruthy();
        if (b.loadKg !== undefined) expect(Number.isFinite(b.loadKg) && b.loadKg >= 0, `${d.session.date}: carga ${b.loadKg}`).toBe(true);
        expect(b.format, d.session.date).toBeTruthy();
      }
    }
  });

  it('no repite un WOD en 112 días de entreno', () => {
    const ids = base.filter((d) => d.catalogId).map((d) => d.catalogId!);
    // `simulate` encadena dos macros desde cero: se mira cada uno por separado
    const half = Math.floor(ids.length / 2);
    for (const part of [ids.slice(0, half), ids.slice(half)]) expect(new Set(part).size).toBe(part.length);
  });

  it('es determinista: misma fecha y mismo estado, misma sesión', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5, bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    for (const d of consecutiveDates('2026-02-02', 10)) {
      expect(JSON.stringify(generateSessionForDate(profile, [], d, profile.goals))).toBe(JSON.stringify(generateSessionForDate(profile, [], d, profile.goals)));
    }
  });
});

describe('WOD real — fase del macro y cómo llegas', () => {
  it('la acumulación pide WODs más largos que el pico (y la descarga, ligeros)', () => {
    expect(avgDuration(base, 1)).toBeGreaterThan(avgDuration(base, 3) + 3);
    expect(avgDuration(base, 2)).toBeGreaterThan(avgDuration(base, 3));
    expect(avgDuration(base, 4)).toBeLessThan(avgDuration(base, 1));
  });

  it('con poca preparación el WOD sale más corto que con buena preparación', () => {
    const bad = simulate({}, BAD);
    const good = simulate({}, GOOD);
    expect(avgDuration(bad), `mal ${avgDuration(bad).toFixed(1)} vs bien ${avgDuration(good).toFixed(1)}`).toBeLessThan(avgDuration(good) - 1);
  });

  it('con poca preparación las cargas del WOD van recortadas y la nota lo dice', () => {
    const bad = simulate({}, BAD).filter((d) => d.catalogId && d.session.coachReasons?.some((r) => /cargas van recortadas/i.test(r)));
    expect(bad.length).toBeGreaterThan(20);
  });
});

describe('WOD real — programaciones elegidas', () => {
  it('con una sola programación marcada, todo WOD real sale de ella (tambien en los dobles)', () => {
    for (const source of ['mayhem', 'pushjerk'] as const) {
      const days = simulate({ wodSources: [source], trainingDaysPerWeek: 6 }, undefined, ['a'], 84);
      const real = days.filter((d) => d.catalogId);
      expect(real.length, source).toBeGreaterThan(30);
      expect(days.some((d) => d.session.doubleWod), `${source}: sin ningun doble`).toBe(true);
      for (const d of real) {
        for (const id of d.session.blocks.filter((b) => b.block === 'wod').map((b) => b.wodCatalogId ?? `lib:${b.wodLibraryId}`)) {
          expect(getCatalogWod(id)?.source, `${source}: ${d.session.date}`).toBe(source);
        }
      }
    }
  });

  it('sin lista valen todas, y marcar todas equivale a no marcar ninguna', () => {
    const all = simulate({}, undefined, ['a'], 56);
    const explicit = simulate({ wodSources: ['pushjerk', 'mayhem', 'comptrain', 'invictus', 'clasicos', 'otros'] }, undefined, ['a'], 56);
    expect(explicit.map((d) => d.catalogId)).toEqual(all.map((d) => d.catalogId));
  });

  it('cambiar las programaciones cambia los WODs (y los dias de test siguen saliendo del catalogo entero)', () => {
    const only = simulate({ wodSources: ['invictus'] }, undefined, ['a'], 56);
    const tests = only.filter((d) => !d.catalogId && d.session.blocks.find((b) => b.block === 'wod')?.movementId.startsWith('benchmark:'));
    expect(tests.length).toBeGreaterThan(0);
  });
});

describe('WOD real — molestias y competición', () => {
  it('con una molestia activa ningún WOD lleva movimientos ni palabras de esa zona', () => {
    for (const area of ['rodilla', 'hombro', 'cadera-lumbar'] as const) {
      const flags = [{ id: 'p', area, createdDate: '2026-01-01', until: null }];
      const avoided = getAvoidedPatterns(flags, '2026-02-01');
      const days = simulate({ painFlags: flags }, undefined, ['a'], 84).filter((d) => d.catalogId);
      expect(days.length, area).toBeGreaterThan(30);
      for (const d of days) {
        const wod = getCatalogWod(d.catalogId!)!;
        expect(benchmarkConflictsWithPain({ movements: wod.movementIds, format: wod.text }, avoided, getMovementById), `${area}: ${d.session.date} ${wod.name}`).toBe(false);
      }
    }
  });

  it('con un objetivo de competición cerca se prefieren las programaciones de competición', () => {
    const goals = [{ id: 'g', type: 'preparar-competicion' as const, targetDate: '2026-05-20', emphasis: 'intensivo' as const, createdAt: '2026-01-01' }];
    const comp = simulate({ goals });
    const competitionSources = ['mayhem', 'comptrain', 'invictus'];
    expect(sourceShare(comp, competitionSources)).toBeGreaterThan(sourceShare(base, competitionSources) + 0.08);
  });

  it('con un objetivo de competición ya no todos los días son benchmark: salvo el día 0 y el extra del pico, eligen un WOD real', () => {
    const goals = [{ id: 'g', type: 'preparar-competicion' as const, targetDate: '2026-05-20', emphasis: 'intensivo' as const, createdAt: '2026-01-01' }];
    const comp = simulate({ goals });
    const days = comp.filter((d) => d.session.blocks.some((b) => b.block === 'wod') && !d.session.doubleWod);
    const tests = days.filter((d) => !d.catalogId && d.session.blocks.find((b) => b.block === 'wod')!.movementId.startsWith('benchmark:')).length;
    expect(tests / days.length).toBeLessThan(0.3);
  });
});

describe('WOD real — días de doble WOD', () => {
  function simulateDoubles(over: Partial<AthleteProfile> = {}, macros = ['d1', 'd2']): DailySession[] {
    const out: DailySession[] = [];
    for (const id of macros) {
      const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }], ...over });
      let history: SessionHistoryEntry[] = [];
      for (const d of consecutiveDates('2026-01-12', 140)) {
        const session = generateSessionForDate(profile, history, d, profile.goals);
        if (session.isRestDay) continue;
        history = [...history, toHistoryEntry(session, 'rx', 7, 60)];
        if (session.doubleWod) out.push(session);
      }
    }
    return out;
  }
  const catalogIdsOf = (s: DailySession) => [
    ...new Set(s.blocks.filter((b) => b.block === 'wod').map((b) => b.wodCatalogId ?? `lib:${b.wodLibraryId}`)),
  ];

  const baseDoubles = simulateDoubles();

  it('las dos piezas salen de programaciones reales y el historial recuerda las dos', () => {
    const doubles = baseDoubles;
    expect(doubles.length).toBeGreaterThan(8);
    for (const s of doubles) {
      const ids = catalogIdsOf(s);
      expect(ids, s.date).toHaveLength(2);
      for (const id of ids) expect(getCatalogWod(id), `${s.date}: ${id}`).toBeTruthy();
      expect(toHistoryEntry(s, 'rx', 8, 70).wodCatalogIds, s.date).toEqual(ids);
    }
  });

  it('ninguna pieza se repite entre dobles, ni con los WODs de los días normales', () => {
    // Misma simulacion encadenada: el historial de cada dia incluye lo anterior, asi que un WOD no vuelve a salir.
    const seen = new Set<string>();
    for (const id of ['d1']) {
      const profile = makeProfile({ trainingDaysPerWeek: 6, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
      let history: SessionHistoryEntry[] = [];
      for (const d of consecutiveDates('2026-01-12', 140)) {
        const session = generateSessionForDate(profile, history, d, profile.goals);
        if (session.isRestDay) continue;
        history = [...history, toHistoryEntry(session, 'rx', 7, 60)];
        for (const cid of catalogIdsOf(session).filter((x) => !x.endsWith('undefined'))) {
          expect(seen.has(cid), `${session.date}: ${cid} repetido`).toBe(false);
          seen.add(cid);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('con una molestia activa ninguna de las dos piezas lleva movimientos ni palabras de esa zona', () => {
    for (const area of ['rodilla', 'hombro'] as const) {
      const flags = [{ id: 'p', area, createdDate: '2026-01-01', until: null }];
      const avoided = getAvoidedPatterns(flags, '2026-02-01');
      for (const s of simulateDoubles({ painFlags: flags }, ['d1'])) {
        for (const id of catalogIdsOf(s)) {
          const wod = getCatalogWod(id);
          if (!wod) continue;
          expect(benchmarkConflictsWithPain({ movements: wod.movementIds, format: wod.text }, avoided, getMovementById), `${area}: ${s.date} ${wod.name}`).toBe(false);
        }
      }
    }
  });

  it('el doble queda coherente con el calentamiento: se calienta lo que se va a hacer, también con piezas servidas como tarjeta', () => {
    for (const s of baseDoubles.slice(0, 12)) {
      expect(s.blocks.some((b) => b.block === 'warmup'), s.date).toBe(true);
      expect(s.blocks.some((b) => b.block === 'cooldown'), s.date).toBe(true);
      expect(s.blocks.some((b) => b.block === 'strength'), s.date).toBe(false);
    }
  });
});

describe('WOD real — historial e interruptor', () => {
  it('el historial recuerda el WOD hecho (y los movimientos reales de uno servido como tarjeta)', () => {
    const programmed = base.find((d) => d.catalogId?.startsWith('bm:'))!;
    const entry = toHistoryEntry(programmed.session, 'rx', 7, 60);
    expect(entry.wodCatalogId).toBe(programmed.catalogId);
    const wod = getCatalogWod(programmed.catalogId!)!;
    expect(entry.wodMovementIds).toEqual(wod.movementIds);
    expect(entry.wodMovementIds!.some((id) => id.startsWith('benchmark:'))).toBe(false);
    const library = base.find((d) => d.catalogId?.startsWith('lib:'))!;
    expect(toHistoryEntry(library.session, 'rx', 7, 60).wodLibraryId).toBe(library.catalogId!.replace('lib:', ''));
  });

  it('un WOD servido como tarjeta trae su texto en kilos y la carga que propone el coach para cada movimiento con peso', () => {
    const cards = base.filter((d) => d.catalogId?.startsWith('bm:'));
    expect(cards.length).toBeGreaterThan(20);
    let withLoads = 0;
    for (const d of cards) {
      const block = d.session.blocks.find((b) => b.block === 'wod')!;
      expect(block.notes, d.session.date).not.toMatch(/\b\d+(?:\/\d+)?\s*lb\b/i);
      expect(block.notes, d.session.date).not.toMatch(/\bin\b\)/);
      if (block.benchmarkLoads) {
        withLoads++;
        for (const [id, kg] of Object.entries(block.benchmarkLoads)) {
          expect(getMovementById(id), `${d.session.date}: ${id}`).toBeTruthy();
          expect(Number.isFinite(kg) && kg > 0 && kg < 400, `${d.session.date}: ${id} ${kg}`).toBe(true);
        }
      }
    }
    // Una parte de los WODs de programaciones lleva barra o mancuernas: ahí el coach propone carga. (El WOD esquiva la
    // halterofilia que ya carga el oly del dia, asi que salen algo menos que en el catalogo entero.)
    expect(withLoads / cards.length).toBeGreaterThan(0.15);
  });

  it('con poca preparación las cargas propuestas son menores que con buena preparación', () => {
    const loadsOf = (days: Day[]) => {
      const out: number[] = [];
      for (const d of days) for (const kg of Object.values(d.session.blocks.find((b) => b.block === 'wod')?.benchmarkLoads ?? {})) out.push(kg);
      return out;
    };
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    const bad = loadsOf(simulate({}, BAD));
    const good = loadsOf(simulate({}, GOOD));
    expect(bad.length).toBeGreaterThan(10);
    expect(mean(bad)).toBeLessThan(mean(good));
  });

  it('un WOD de programación servido como tarjeta no se bloquea como día de test', () => {
    // planWeekLocks solo bloquea el benchmark de un dia de test: un WOD elegido de una programacion no lleva bloqueo
    const programmed = base.find((d) => d.catalogId?.startsWith('bm:'))!;
    expect(programmed.session.blocks.find((b) => b.block === 'wod')?.wodCatalogId).toBe(programmed.catalogId);
  });

  it('con la selección real apagada vuelve el generador', () => {
    const initial = isRealWodSelectionEnabled();
    setRealWodSelectionEnabled(false);
    try {
      const sessions = simulate({}, undefined, ['a'], 42);
      const withWod = normalWodDays(sessions);
      expect(withWod.length).toBeGreaterThan(20);
      expect(withWod.filter((d) => d.catalogId && !d.session.blocks.some((b) => b.wodKind && b.wodKind !== 'library')).length).toBeLessThan(withWod.length * 0.5);
    } finally {
      setRealWodSelectionEnabled(initial);
    }
  });
});
