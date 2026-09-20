import { describe, it, expect } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { getWodDomain, WOD_BARBELL_LOAD_PERCENT, WOD_PRESCRIPTION } from './wodDomains';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { SessionBlockResult } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { getLibraryWod } from '../data/library/libraryWods';

/**
 * Los formatos especiales del WOD (triada de barra, escaleras con peaje, intervalo de carga creciente,
 * cardio chipper, escaleras compartidas...) se construyen en ramas distintas con sus propias reglas, y
 * cada una puede prometer en la etiqueta / la nota algo que el WOD no cumple ("tres movimientos de
 * barra" con uno solo, una "triada de barra" de mancuernas, una escalera de reps con un acarreo). Estos
 * tests recorren cientos de sesiones de varios macrociclos (cada uno con su semilla) y comprueban
 * invariantes por formato, no una salida concreta.
 */

interface GeneratedWod {
  date: string;
  kind: string;
  format: string;
  entries: SessionBlockResult[];
}

const MACRO_IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];

function collectWods(macroIds: string[], trainingDays: (4 | 5 | 6)[], days = 140): GeneratedWod[] {
  const out: GeneratedWod[] = [];
  for (const id of macroIds) {
    for (const n of trainingDays) {
      const profile = makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id })] });
      for (const d of consecutiveDates('2026-01-05', days)) {
        const s = generateSessionForDate(profile, [], d, profile.goals);
        const entries = s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:'));
        if (entries.length === 0) continue;
        out.push({ date: s.date, kind: entries[0].wodKind ?? 'none', format: entries[0].format ?? '', entries });
      }
    }
  }
  return out;
}

const allWods = collectWods(MACRO_IDS, [5, 6]);
// El jueves de recuperacion de los calendarios de 6 dias lleva su propio WOD (bike erg con cortes), que
// no sale del sorteo de formatos: se comprueba aparte.
const isRecovery = (w: GeneratedWod) => w.entries[0].title === 'Recuperación activa';
const wods = allWods.filter((w) => !isRecovery(w));
const recoveryWods = allWods.filter(isRecovery);
const of = (kind: string) => wods.filter((w) => w.kind === kind);
const where = (w: GeneratedWod) => `${w.date} ${w.kind} [${w.format}] ${w.entries.map((e) => e.movementId).join(',')}`;
const nums = (s: string | undefined) => (s ?? '').match(/\d+/g)?.map(Number) ?? [];
const isDistanceOrCal = (id: string) => /\d\s*(m\b|cal\b)|por lado/i.test(WOD_PRESCRIPTION[id] ?? '');

const LABEL: Record<string, RegExp> = {
  forTime: /^For Time \(\d+ rondas\)$/,
  amrap: /^AMRAP \d+ min$/,
  emom: /^EMOM \d+ min/,
  interval: /^Cada 3:00 x \d+ rondas$/,
  maxReps: /^Al máximo/,
  ladder: /^Escalera ascendente/,
  risingInterval: /^Cada 3:00 hasta el fallo/,
  risingLoadInterval: /^Cada 1:30 hasta el fallo/,
  barbellComplex: /Tríada de barra$/,
  descendingLadderFiller: /^\d+(-\d+)+ \+ peaje$/,
  ascendingLadderFiller: /^AMRAP \d+ min — escalera \+ peaje$/,
  cardioChipper: /^Cardio chipper/,
  sandwich: /^Sándwich — entrada \+ \d+ rondas \+ salida$/,
  library: /^(For Time|AMRAP|EMOM|Al máximo) — WOD real: /,
  chipper: /^Chipper/,
  descendingLadder: /For Time$/,
  ascendingLadder: /For Time$/,
};

describe('WOD generado — coherencia de cada formato', () => {
  it('la muestra es suficiente y todo WOD de macrociclo lleva su formato registrado', () => {
    expect(wods.length).toBeGreaterThan(400);
    expect(wods.filter((w) => w.kind === 'none').map(where)).toEqual([]);
  });

  it('todas las entradas de un WOD comparten formato, y la etiqueta corresponde al tipo de formato', () => {
    const bad: string[] = [];
    for (const w of wods) {
      if (new Set(w.entries.map((e) => e.format)).size !== 1) bad.push(`formatos mezclados: ${where(w)}`);
      const re = LABEL[w.kind];
      if (!re) bad.push(`tipo sin regla: ${w.kind}`);
      else if (!re.test(w.format)) bad.push(`etiqueta no corresponde: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('la nota "tres movimientos de barra" solo aparece en una triada de barra (y la triada siempre la lleva)', () => {
    const bad: string[] = [];
    for (const w of wods) {
      const promises = /tres movimientos de barra/i.test(w.entries[0].notes ?? '');
      if (promises !== (w.kind === 'barbellComplex')) bad.push(where(w));
    }
    expect(bad).toEqual([]);
  });

  it('triada de barra: 3 movimientos de barra distintos con carga, alternados con el mismo peaje', () => {
    const list = of('barbellComplex');
    expect(list.length, 'nunca salio una triada de barra').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      const e = w.entries;
      if (e.length !== 6) {
        bad.push(`no tiene 6 entradas: ${where(w)}`);
        continue;
      }
      const mains = [e[0], e[2], e[4]];
      const fillers = [e[1], e[3], e[5]];
      if (new Set(mains.map((m) => m.movementId)).size !== 3) bad.push(`mains repetidos: ${where(w)}`);
      for (const m of mains) {
        if (!(m.movementId in WOD_BARBELL_LOAD_PERCENT)) bad.push(`no es de barra: ${m.movementId} en ${where(w)}`);
        if (!(m.loadKg && m.loadKg > 0)) bad.push(`sin carga: ${m.movementId} en ${where(w)}`);
      }
      if (new Set(fillers.map((f) => f.movementId)).size !== 1) bad.push(`peaje distinto: ${where(w)}`);
      if (getWodDomain(fillers[0].movementId) !== 'monostructural') bad.push(`el peaje no es cardio: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('intervalo de carga creciente: 5 escalones, la carga de la barra sube en cada uno y el otro movimiento no cambia', () => {
    const list = of('risingLoadInterval');
    expect(list.length, 'nunca salio un intervalo de carga creciente').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      const e = w.entries;
      const barbell = e.filter((_, i) => i % 2 === 0);
      const fixed = e.filter((_, i) => i % 2 === 1);
      if (e.length !== 10) bad.push(`no tiene 10 entradas: ${where(w)}`);
      if (new Set(barbell.map((b) => b.movementId)).size !== 1 || !(barbell[0].movementId in WOD_BARBELL_LOAD_PERCENT)) {
        bad.push(`la barra no es una: ${where(w)}`);
      }
      for (let i = 1; i < barbell.length; i++) {
        if (!((barbell[i].loadKg ?? 0) > (barbell[i - 1].loadKg ?? 0))) bad.push(`la carga no sube en el escalon ${i}: ${where(w)}`);
      }
      if (new Set(fixed.map((f) => f.movementId)).size !== 1) bad.push(`el movimiento fijo cambia: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('escaleras con peaje: el principal sube o baja estrictamente y el peaje es siempre el mismo cardio', () => {
    const list = [...of('descendingLadderFiller'), ...of('ascendingLadderFiller')];
    expect(list.length, 'nunca salio una escalera con peaje').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      const main = w.entries.filter((_, i) => i % 2 === 0);
      const filler = w.entries.filter((_, i) => i % 2 === 1);
      const reps = main.map((m) => Number(m.reps));
      const strictly = (cmp: (a: number, b: number) => boolean) => reps.every((r, i) => i === 0 || cmp(reps[i - 1], r));
      const ok = w.kind === 'descendingLadderFiller' ? strictly((a, b) => a > b) : strictly((a, b) => a < b);
      if (!ok || reps.some((r) => !Number.isFinite(r))) bad.push(`escalon mal ordenado (${reps.join(',')}): ${where(w)}`);
      if (new Set(main.map((m) => m.movementId)).size !== 1) bad.push(`el principal cambia: ${where(w)}`);
      if (new Set(filler.map((f) => f.movementId)).size !== 1) bad.push(`el peaje cambia: ${where(w)}`);
      if (getWodDomain(filler[0].movementId) !== 'monostructural') bad.push(`el peaje no es cardio: ${where(w)}`);
      if (isDistanceOrCal(main[0].movementId)) bad.push(`escalera de reps con un movimiento de metros/calorias: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('escaleras compartidas: pareja con la misma escalera de reps, y ninguno de los dos se mide en metros o calorias', () => {
    const list = [...of('descendingLadder'), ...of('ascendingLadder')];
    expect(list.length, 'nunca salio una escalera compartida').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      if (w.entries.length !== 2) bad.push(`no es una pareja: ${where(w)}`);
      if (new Set(w.entries.map((e) => e.reps)).size !== 1) bad.push(`escaleras distintas: ${where(w)}`);
      for (const e of w.entries) {
        if (isDistanceOrCal(e.movementId)) bad.push(`${e.movementId} se mide en metros/calorias: ${where(w)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('cardio chipper: solo monoestructurales, cada uno con 3 tramos que bajan', () => {
    const list = of('cardioChipper');
    expect(list.length, 'nunca salio un cardio chipper').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      if (w.entries.length < 2) bad.push(`menos de 2 movimientos: ${where(w)}`);
      for (const e of w.entries) {
        const n = nums(e.reps);
        if (n.length !== 3 || !(n[0] > n[1] && n[1] > n[2])) bad.push(`tramos mal (${e.reps}): ${where(w)}`);
        if (getWodDomain(e.movementId) !== 'monostructural') bad.push(`${e.movementId} no es cardio: ${where(w)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('sandwich: mismo cardio en la entrada y la salida, y en medio una pareja de dos movimientos distintos con reps', () => {
    const list = of('sandwich');
    expect(list.length, 'nunca salio un sandwich').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      const e = w.entries;
      if (e.length !== 4) {
        bad.push(`no tiene 4 entradas: ${where(w)}`);
        continue;
      }
      if (e[0].movementId !== e[3].movementId || e[0].reps !== e[3].reps) bad.push(`entrada y salida distintas: ${where(w)}`);
      if (getWodDomain(e[0].movementId) !== 'monostructural') bad.push(`la entrada no es cardio: ${where(w)}`);
      if (new Set(e.map((x) => x.movementId)).size !== 3) bad.push(`la pareja repite movimiento o cardio: ${where(w)}`);
      for (const mid of [e[1], e[2]]) {
        if (isDistanceOrCal(mid.movementId)) bad.push(`ronda con metros/calorias (${mid.movementId}): ${where(w)}`);
        if (getWodDomain(mid.movementId) === 'monostructural') bad.push(`la ronda lleva cardio: ${where(w)}`);
      }
      if (!/\d+ (m|cal)$|^\d+$/.test(e[0].reps ?? '')) bad.push(`cantidad de entrada rara (${e[0].reps}): ${where(w)}`);
      if (!/Objetivo orientativo/.test(e[0].notes ?? '')) bad.push(`sin objetivo: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('WOD real de la biblioteca: coincide con su original (movimientos y cantidades), sin cargas Rx en lb, y se puntua como su formato', () => {
    const list = of('library');
    expect(list.length, 'nunca salio un WOD real').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of list) {
      const id = w.entries[0].wodLibraryId;
      const lib = id ? getLibraryWod(id) : undefined;
      if (!lib) {
        bad.push(`id de biblioteca desconocido (${id}): ${where(w)}`);
        continue;
      }
      if (w.entries.length !== lib.lines.length) bad.push(`numero de lineas distinto: ${where(w)}`);
      lib.lines.forEach(([mid, reps], i) => {
        if (w.entries[i]?.movementId !== mid || w.entries[i]?.reps !== reps) bad.push(`linea ${i} no coincide con el original: ${where(w)}`);
        if (!getMovementById(mid)) bad.push(`id inexistente ${mid}: ${where(w)}`);
      });
      if (!(w.entries[0].notes ?? '').includes(lib.original)) bad.push(`la nota no lleva el texto original: ${where(w)}`);
      if (new Set(w.entries.map((e) => e.wodLibraryId)).size !== 1) bad.push(`id de biblioteca mezclado: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('WOD real: no se repite dentro de la ventana de historial', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'w1' })] });
    let checked = 0;
    for (const d of consecutiveDates('2026-01-05', 200)) {
      const first = generateSessionForDate(profile, [], d, profile.goals).blocks.find((b) => b.block === 'wod')?.wodLibraryId;
      if (!first) continue;
      const history = [
        { date: '2025-12-30', mesocycleWeek: 1 as const, movementIds: [], rxOrScaled: 'rx' as const, rpe: 7, durationMin: 60, wodLibraryId: first },
      ];
      const again = generateSessionForDate(profile, history, d, profile.goals).blocks.find((b) => b.block === 'wod')?.wodLibraryId;
      // Con ese WOD ya en el historial, o sale otro WOD real o el motor cae a un formato generado — nunca el mismo.
      expect(again, `${d.toISOString()} repite ${first}`).not.toBe(first);
      checked++;
    }
    expect(checked, 'nunca salio un WOD real para comprobar').toBeGreaterThan(0);
  });

  it('chipper: 5 movimientos distintos', () => {
    const list = of('chipper');
    expect(list.length, 'nunca salio un chipper').toBeGreaterThan(0);
    for (const w of list) {
      expect(w.entries, where(w)).toHaveLength(5);
      expect(new Set(w.entries.map((e) => e.movementId)).size, where(w)).toBe(5);
    }
  });

  it('formatos de 3 movimientos (for time, AMRAP, EMOM, intervalo, escalera, al maximo): 3 distintos y existentes', () => {
    const bad: string[] = [];
    for (const kind of ['forTime', 'amrap', 'emom', 'interval', 'ladder', 'maxReps', 'risingInterval']) {
      const list = of(kind);
      if (list.length === 0) bad.push(`nunca salio ${kind}`);
      for (const w of list) {
        if (w.entries.length !== 3) bad.push(`no tiene 3 movimientos: ${where(w)}`);
        if (new Set(w.entries.map((e) => e.movementId)).size !== w.entries.length) bad.push(`repetidos: ${where(w)}`);
        for (const e of w.entries) if (!getMovementById(e.movementId)) bad.push(`id inexistente ${e.movementId}: ${where(w)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('recuperacion activa: 45 min de bike erg con 1-2 cortes de bajo impacto, sin barra ni comba de batalla, mismo formato en todas las entradas', () => {
    expect(recoveryWods.length, 'nunca salio un jueves de recuperacion').toBeGreaterThan(0);
    const allowedCuts = new Set([
      'row', 'ski-erg', 'farmers-carry', 'sandbag-carry', 'yoke-walk', 'suitcase-carry', 'sled-push', 'sled-drag', 'sled-row',
      'waiters-carry', 'overhead-carry', 'abmat-situp', 'v-up', 'l-sit', 'bear-crawl',
    ]);
    const bad: string[] = [];
    for (const w of recoveryWods) {
      const [bike, ...cuts] = w.entries;
      if (bike.movementId !== 'air-bike') bad.push(`no empieza en bike erg: ${where(w)}`);
      if (!/45 min/.test(bike.reps ?? '')) bad.push(`no son 45 min: ${where(w)}`);
      if (cuts.length < 1 || cuts.length > 2) bad.push(`numero de cortes ${cuts.length}: ${where(w)}`);
      if (new Set(w.entries.map((e) => e.format)).size !== 1) bad.push(`formatos mezclados: ${where(w)}`);
      for (const c of cuts) {
        if (!allowedCuts.has(c.movementId)) bad.push(`corte no permitido ${c.movementId}: ${where(w)}`);
        if (c.loadKg) bad.push(`corte con carga de barra ${c.movementId}: ${where(w)}`);
      }
      if (!/Cada (2000|2200|2500)m/.test(bike.notes ?? '')) bad.push(`checkpoint de metros raro: ${where(w)}`);
    }
    expect(bad).toEqual([]);
  });

  it('WOD de mantenimiento (sin macrociclo): sin cargas de PR ni barra, y las escaleras con peaje son de reps y estrictas', () => {
    const bad: string[] = [];
    let ladders = 0;
    let total = 0;
    for (const n of [4, 5] as const) {
      const profile = makeProfile({ trainingDaysPerWeek: n, macrocycles: [] });
      for (const d of consecutiveDates('2026-03-02', 200)) {
        const s = generateSessionForDate(profile, [], d, profile.goals);
        const entries = s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:'));
        if (entries.length === 0 || entries[0].title === 'Recuperación activa') continue;
        total++;
        const tag = `${s.date} [${entries[0].format}] ${entries.map((e) => e.movementId).join(',')}`;
        for (const e of entries) {
          if (e.loadKg) bad.push(`carga en mantenimiento (${e.movementId}): ${tag}`);
          if (e.movementId in WOD_BARBELL_LOAD_PERCENT) bad.push(`barra en mantenimiento (${e.movementId}): ${tag}`);
        }
        if (/peaje/.test(entries[0].format ?? '')) {
          ladders++;
          const main = entries.filter((_, i) => i % 2 === 0);
          const reps = main.map((m) => Number(m.reps));
          const desc = reps.every((r, i) => i === 0 || reps[i - 1] > r);
          const asc = reps.every((r, i) => i === 0 || reps[i - 1] < r);
          if (!(desc || asc)) bad.push(`escalon sin orden (${reps.join(',')}): ${tag}`);
          if (isDistanceOrCal(main[0].movementId)) bad.push(`escalera de reps con metros/calorias: ${tag}`);
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(ladders, 'nunca salio una escalera con peaje en mantenimiento').toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('todos los formatos aparecen en la muestra (ninguno esta muerto)', () => {
    const missing = Object.keys(LABEL).filter((k) => of(k).length === 0);
    expect(missing).toEqual([]);
  });
});
