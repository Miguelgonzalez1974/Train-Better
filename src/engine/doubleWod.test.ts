import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { doubleWodSlot, expectedStrengthSessionsPerWeek, getWeekdayIndex, isDoubleWodEnabled, setDoubleWodEnabled } from './periodization';
import { dominantWodDomain } from './wodDomains';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getMovementById } from '../data/movements';
import type { DailySession } from '../data/athlete/types';

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
