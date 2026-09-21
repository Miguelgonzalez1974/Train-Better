import { describe, it, expect } from 'vitest';
import { generateSessionForDate, isCachedSessionStale } from './generateSession';
import { PAIN_AREA_PATTERNS } from './painFlags';
import { painStamp } from '../data/athlete/historyStamp';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { SESSION_GEN_VERSION, type DailySession, type PainFlag } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';

/**
 * Aviso de molestia en la rodilla: el coach no debe programar NADA que cargue la rodilla — ni la comba, ni
 * correr, ni saltos, ni sentadillas — en ningun bloque (WOD generado, WOD de referencia, calentamiento,
 * accesorio, core...). Antes la comba y la carrera eran patron "monostructural", que ningun aviso evitaba, y
 * un WOD de referencia se servia entero sin mirar el aviso.
 */

const KNEE: PainFlag = { id: 'p1', area: 'rodilla', createdDate: '2025-12-20', until: null };
const AVOIDED = new Set<MovementPattern>(PAIN_AREA_PATTERNS.rodilla);
// Deliberadamente conservador y independiente de la logica del motor: si el texto del WOD lo menciona, choca.
const KNEE_WORDS = /double[- ]?under|single[- ]?under|\brun\b|running|sprint|jump|burpee|squat|thruster|wall[- ]?ball|lunge|step[- ]?up|shuttle/i;

function sessions(painFlags: PainFlag[], days: (4 | 5 | 6)[] = [5, 6]): DailySession[] {
  const out: DailySession[] = [];
  for (const n of days) {
    for (const id of ['a', 'b', 'c']) {
      const profile = makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id })], painFlags, bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
      for (const d of consecutiveDates('2026-01-05', 112)) out.push(generateSessionForDate(profile, [], d, profile.goals));
    }
  }
  return out;
}

describe('aviso de molestia en la rodilla', () => {
  const withPain = sessions([KNEE]);
  const baseline = sessions([]);

  it('el patron "impact" (correr, comba, lanzadera) lo evita el aviso de rodilla, y la comba y el run ya no son "monostructural"', () => {
    expect(AVOIDED.has('impact')).toBe(true);
    for (const id of ['double-under', 'single-under', 'run', 'shuttle-run', 'double-under-practice', 'jumping-jacks', 'high-knees']) {
      expect(getMovementById(id)?.pattern, id).toBe('impact');
    }
    // Los burpees llevan salto: patron "jump". Remo, bici y ski no cargan la rodilla con impacto.
    for (const id of ['burpee', 'bar-facing-burpee', 'lateral-burpee', 'burpee-box-jump-over']) expect(getMovementById(id)?.pattern, id).toBe('jump');
    for (const id of ['row', 'air-bike', 'ski-erg']) expect(AVOIDED.has(getMovementById(id)!.pattern), id).toBe(false);
  });

  it('sin aviso la comba y la carrera SI salen (la prueba no es vacia)', () => {
    const ids = new Set(baseline.flatMap((s) => s.blocks.filter((b) => b.block === 'wod').map((b) => b.movementId)));
    expect(ids.has('double-under') || ids.has('single-under')).toBe(true);
    expect(ids.has('run')).toBe(true);
  });

  it('ningun bloque de ninguna sesion lleva un movimiento que la rodilla evita (WOD, calentamiento, accesorio, core, skill, fuerza, oly)', () => {
    const bad: string[] = [];
    for (const s of withPain) {
      for (const b of s.blocks) {
        if (b.movementId.startsWith('benchmark:')) continue;
        const p = getMovementById(b.movementId)?.pattern;
        if (p && AVOIDED.has(p)) bad.push(`${s.date} [${b.block}] ${b.movementId} (${p})`);
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it('un WOD de referencia con un aviso activo no lleva nada de rodilla ni en sus ids ni en el texto de su formato', () => {
    let served = 0;
    const bad: string[] = [];
    for (const s of withPain) {
      for (const b of s.blocks.filter((x) => x.block === 'wod' && x.movementId.startsWith('benchmark:'))) {
        served++;
        const w = benchmarkWorkouts.find((x) => x.id === b.movementId.replace('benchmark:', ''))!;
        const idsBad = w.movements.some((m) => {
          const p = getMovementById(m)?.pattern;
          return p !== undefined && AVOIDED.has(p);
        });
        if (idsBad || KNEE_WORDS.test(`${w.format} ${w.movements.join(' ')}`)) bad.push(`${s.date}: ${w.name} — ${w.format.slice(0, 70)}`);
      }
    }
    expect(served, 'ningun benchmark servido con el aviso: el test no comprueba nada').toBeGreaterThan(10);
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('el motor explica el aviso: cuando esta activo lo dice en el resumen del dia, y no cuando no lo esta', () => {
    // (El jueves de recuperacion activa no lleva resumen del coach: no se cuenta.)
    const trained = withPain.filter((s) => !s.isRestDay && s.blocks.some((b) => b.block === 'wod' && b.title !== 'Recuperación activa'));
    expect(trained.length).toBeGreaterThan(100);
    expect(trained.every((s) => (s.coachReasons ?? []).some((r) => /aviso de molestia activo \(rodilla\)/.test(r)))).toBe(true);
    expect(baseline.some((s) => (s.coachReasons ?? []).some((r) => /aviso de molestia/.test(r)))).toBe(false);
  });
});

describe('la cache se regenera cuando cambia un aviso de molestia (no solo la sesion de hoy)', () => {
  const day = consecutiveDates('2026-01-14', 1)[0];
  const stamped = (painFlags: PainFlag[]): DailySession => {
    const p = makeProfile({ trainingDaysPerWeek: 6, painFlags });
    return { ...generateSessionForDate(p, [], day, p.goals), genVersion: SESSION_GEN_VERSION, genPainStamp: painStamp(painFlags, '2026-01-14') };
  };

  it('painStamp cambia al marcar, quitar o caducar un aviso, y refleja la reintroduccion progresiva', () => {
    expect(painStamp([], '2026-01-14')).toBe('|');
    expect(painStamp([KNEE], '2026-01-14')).toBe('rodilla|');
    // Caducado hace 5 dias -> en reintroduccion; hace 30 -> ya no cuenta.
    expect(painStamp([{ ...KNEE, until: '2026-01-09' }], '2026-01-14')).toBe('|rodilla');
    expect(painStamp([{ ...KNEE, until: '2025-12-10' }], '2026-01-14')).toBe('|');
    // Quitado a mano hoy: deja de estar activo pero entra en reintroduccion.
    expect(painStamp([{ ...KNEE, clearedDate: '2026-01-14' }], '2026-01-14')).toBe('|rodilla');
    // Por fecha: un aviso que caduca el dia 16 afecta al 14 pero no al 20.
    const short = [{ ...KNEE, until: '2026-01-16' }];
    expect(painStamp(short, '2026-01-14')).toBe('rodilla|');
    expect(painStamp(short, '2026-01-20')).toBe('|rodilla');
  });

  it('una sesion cacheada antes del aviso queda vieja (tambien la de un dia futuro) y la generada con el aviso no; quitarlo la vuelve a dejar vieja', () => {
    const before = stamped([]);
    expect(isCachedSessionStale(before, undefined, undefined, [])).toBe(false);
    expect(isCachedSessionStale(before, undefined, undefined, [KNEE])).toBe(true);
    const hurt = stamped([KNEE]);
    expect(isCachedSessionStale(hurt, undefined, undefined, [KNEE])).toBe(false);
    expect(isCachedSessionStale(hurt, undefined, undefined, [{ ...KNEE, clearedDate: '2026-01-14' }])).toBe(true);
    expect(isCachedSessionStale(hurt, undefined, undefined, [])).toBe(true);
  });

  it('sin avisos pasados a la funcion, o sin huella (cacheada antigua), no cambia nada; editada a mano nunca se regenera', () => {
    const before = stamped([]);
    expect(isCachedSessionStale(before)).toBe(false);
    const { genPainStamp: _omit, ...noStamp } = before;
    expect(isCachedSessionStale(noStamp as DailySession, undefined, undefined, [KNEE])).toBe(false);
    expect(isCachedSessionStale({ ...before, editedByAthlete: true }, undefined, undefined, [KNEE])).toBe(false);
  });
});

describe('WOD de referencia bloqueado que choca con el aviso', () => {
  // Un benchmark que lleve comba y que un dia de test bloqueado serviria tal cual.
  const duBenchmark = benchmarkWorkouts.find((w) => w.category !== 'custom' && /double[- ]?under/i.test(w.format) && w.movements.includes('double-under'))!;
  const MON = consecutiveDates('2026-01-12', 1)[0]; // dia 0 de la semana: dia de benchmark
  const lock = { wodBenchmarkId: duBenchmark.id, plannedOn: '2026-01-12' };
  const iso = '2026-01-12';

  it('sin aviso se sirve el benchmark bloqueado; con el aviso se sirve otra cosa, marcada, y la cache no lo toma por desacuerdo', () => {
    expect(duBenchmark, 'no hay benchmark con comba en el catalogo').toBeTruthy();
    const base = makeProfile({ trainingDaysPerWeek: 6, weeklyLocks: { [iso]: lock } });
    const free = generateSessionForDate(base, [], MON, base.goals);
    expect(free.blocks.find((b) => b.block === 'wod')?.movementId).toBe(`benchmark:${duBenchmark.id}`);
    expect(free.wodLockSkipped).toBeUndefined();

    const hurt = makeProfile({ trainingDaysPerWeek: 6, weeklyLocks: { [iso]: lock }, painFlags: [KNEE] });
    const s = generateSessionForDate(hurt, [], MON, hurt.goals);
    expect(s.blocks.find((b) => b.block === 'wod')?.movementId).not.toBe(`benchmark:${duBenchmark.id}`);
    expect(s.wodLockSkipped).toBe(true);
    expect(isCachedSessionStale({ ...s, genVersion: SESSION_GEN_VERSION }, lock)).toBe(false);
    // Y la sesion que si contradice el bloqueo sin aviso sigue considerandose vieja.
    const other = { ...s, wodLockSkipped: undefined, genVersion: SESSION_GEN_VERSION };
    expect(isCachedSessionStale(other, lock)).toBe(true);
  });
});
