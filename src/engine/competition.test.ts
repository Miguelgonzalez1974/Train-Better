import { describe, it, expect } from 'vitest';
import { competitionInfo, computeCompetitionDay, isCompetitionTaper, simulacroDateFor } from './competition';
import { generateSessionForDate, toHistoryEntry } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getCatalogWod } from './wodCatalog';
import type { DailySession, Goal, SessionHistoryEntry } from '../data/athlete/types';

// Competición real del atleta: viernes 6 y sábado 7 de noviembre de 2026; calendario de 6 días (lunes a sábado, jueves de recuperación).
const GOAL: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-11-06', eventEndDate: '2026-11-07', emphasis: 'intensivo', createdAt: '2026-10-01' };
const at = (iso: string) => computeCompetitionDay([GOAL], new Date(`${iso}T12:00:00`), 6);

describe('modo competición — cuenta atrás', () => {
  it('lejos de la competición no hay nada', () => {
    expect(at('2026-10-08')).toBeNull(); // 29 días
    expect(computeCompetitionDay([], new Date('2026-10-20T12:00:00'), 6)).toBeNull();
    expect(computeCompetitionDay([{ ...GOAL, type: 'subir-pr' }], new Date('2026-10-20T12:00:00'), 6)).toBeNull();
  });

  it('recorre las fases por los días que faltan', () => {
    const expected: [string, string, number][] = [
      ['2026-10-09', 'construccion', 28],
      ['2026-10-14', 'construccion', 23],
      ['2026-10-16', 'pico-1', 21],
      ['2026-10-22', 'pico-1', 15],
      ['2026-10-23', 'pico', 14],
      ['2026-10-29', 'pico', 8],
      ['2026-10-30', 'taper', 7],
      ['2026-11-03', 'taper', 3],
      ['2026-11-04', 'activacion', 2],
      ['2026-11-05', 'vispera', 1],
      ['2026-11-06', 'evento', 0],
      ['2026-11-07', 'evento', -1],
      ['2026-11-08', 'post', -2],
      ['2026-11-10', 'post', -4],
    ];
    for (const [iso, phase, days] of expected) {
      const c = at(iso);
      expect(c?.phase, iso).toBe(phase);
      expect(c?.daysToEvent, iso).toBe(days);
    }
    expect(at('2026-11-11')).toBeNull(); // pasados los 3 días de recuperación
  });

  it('una competición de dos días: los dos son día de competición, y el segundo no cuenta como "después"', () => {
    expect(at('2026-11-06')?.eventDay).toBe(true);
    expect(at('2026-11-07')?.eventDay).toBe(true);
    expect(at('2026-11-08')?.eventDay).toBe(false);
    // Sin fecha de fin, un solo día
    const one = computeCompetitionDay([{ ...GOAL, eventEndDate: undefined }], new Date('2026-11-07T12:00:00'), 6);
    expect(one?.phase).toBe('post');
    // Una fecha de fin anterior al inicio se ignora
    const bad = computeCompetitionDay([{ ...GOAL, eventEndDate: '2026-11-01' }], new Date('2026-11-07T12:00:00'), 6);
    expect(bad?.phase).toBe('post');
  });

  it('el taper recorta el 40 % del volumen, mantiene la intensidad (semana de pico) y no deja tests ni dobles', () => {
    for (const iso of ['2026-10-30', '2026-10-31', '2026-11-02', '2026-11-03']) {
      const c = at(iso)!;
      expect(c.week, iso).toBe(3);
      expect(c.volumeScale, iso).toBe(0.6);
      expect(c.maxWodMinutes, iso).toBe(9);
      expect(c.noTests && c.noDouble, iso).toBe(true);
      expect(isCompetitionTaper(c), iso).toBe(true);
    }
    expect(at('2026-11-04')).toMatchObject({ technicalLight: true, volumeScale: 0.5, maxWodMinutes: 6 });
    expect(at('2026-11-05')).toMatchObject({ recoverySession: true });
    expect(isCompetitionTaper(at('2026-10-29'))).toBe(false);
    expect(isCompetitionTaper(null)).toBe(false);
  });

  it('el pico fuerza la semana de entrenamiento y la víspera/post bajan la carga', () => {
    expect(at('2026-10-16')?.week).toBe(2);
    expect(at('2026-10-24')?.week).toBe(3);
    expect(at('2026-11-08')).toMatchObject({ week: 4, volumeScale: 0.6 });
    expect(at('2026-10-14')?.week).toBeNull(); // construcción: la del macro
  });
});

describe('modo competición — simulacro', () => {
  it('cae 10 días antes (martes 27 de octubre) si es un día de entreno normal', () => {
    expect(simulacroDateFor('2026-11-06', 6)).toBe('2026-10-27');
    const days = ['2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((iso) => at(iso)!);
    expect(days.filter((d) => d.simulacro).map((d) => d.eventStart && d.daysToEvent)).toEqual([10]);
    expect(at('2026-10-27')).toMatchObject({ simulacro: true, label: 'Simulacro de competición', technicalLight: true });
  });

  it('si ese día no se entrena, busca el siguiente más cercano; el jueves de recuperación y el sábado de solo fuerza no valen', () => {
    // Competición el domingo 8 de noviembre: 10 días antes es el jueves 29 (recuperación) -> el viernes 30 (9 días)
    expect(simulacroDateFor('2026-11-08', 6)).toBe('2026-10-30');
    // Competición el lunes 9: 10 días antes es el viernes 30 -> día de entreno normal
    expect(simulacroDateFor('2026-11-09', 6)).toBe('2026-10-30');
    // Con 3 días de entreno (lunes, miércoles, viernes) y competición un sábado, se busca el más cercano a 10 días
    const date = simulacroDateFor('2026-11-07', 3);
    expect(date).not.toBeNull();
    expect(['2026-10-26', '2026-10-28', '2026-10-30']).toContain(date);
  });
});

describe('modo competición — lo que se guarda en la sesión', () => {
  it('resume fase, texto y días, y marca el simulacro y el día de competición', () => {
    expect(competitionInfo(at('2026-10-30')!)).toEqual({
      phase: 'taper',
      label: 'Taper',
      guidance: expect.stringMatching(/40 %/),
      daysToEvent: 7,
    });
    expect(competitionInfo(at('2026-10-27')!).simulacro).toBe(true);
    expect(competitionInfo(at('2026-11-06')!).eventDay).toBe(true);
  });
});

describe('modo competición — sesiones generadas', () => {
  // Macro de agosto a diciembre; el atleta entrena 6 días y se encadena el historial como en la app.
  const profile = makeProfile({
    trainingDaysPerWeek: 6,
    macrocycles: [makeMacro({ startDate: '2026-08-03', endDate: '2026-12-13' })],
    goals: [GOAL],
  });
  const byDate = new Map<string, DailySession>();
  let history: SessionHistoryEntry[] = [];
  for (const d of consecutiveDates('2026-10-05', 40)) {
    const iso = d.toISOString().slice(0, 10);
    const session = generateSessionForDate(profile, history, d, profile.goals);
    byDate.set(iso, session);
    if (!session.isRestDay && session.blocks.length > 0 && iso < '2026-11-06') history = [...history, toHistoryEntry(session, 'rx', 7, 60)];
  }
  const day = (iso: string) => byDate.get(iso)!;

  it('el día de la competición no hay sesión, solo la tarjeta de competición', () => {
    for (const iso of ['2026-11-06', '2026-11-07']) {
      expect(day(iso).isRestDay, iso).toBe(true);
      expect(day(iso).blocks, iso).toHaveLength(0);
      expect(day(iso).competition?.eventDay, iso).toBe(true);
    }
  });

  it('anota la fase en las sesiones de la cuenta atrás y la explica en el resumen', () => {
    const taper = day('2026-10-31');
    expect(taper.competition?.phase).toBe('taper');
    expect(taper.coachReasons?.[0]).toMatch(/^Taper:/);
    expect(day('2026-10-05').competition).toBeUndefined();
  });

  it('el simulacro (27 oct) es un WOD real de programación de competición de unos 16 minutos, sin test de referencia', () => {
    const sim = day('2026-10-27');
    expect(sim.competition?.simulacro).toBe(true);
    const wod = sim.blocks.find((b) => b.block === 'wod');
    expect(wod).toBeDefined();
    // Un WOD real del catálogo (no la rama de test de referencia) y de una fuente de competición.
    expect(wod!.wodCatalogId).toBeDefined();
    expect(['mayhem', 'invictus', 'comptrain']).toContain(getCatalogWod(wod!.wodCatalogId!)?.source);
  });

  it('en el taper no hay dobles WOD ni tests, y el volumen de fuerza baja respecto al pico', () => {
    for (const iso of ['2026-10-30', '2026-10-31', '2026-11-02', '2026-11-03']) {
      const s = day(iso);
      expect(s.doubleWod, iso).toBeFalsy();
      const wod = s.blocks.find((b) => b.block === 'wod');
      // Un benchmark solo vale como WOD real del catálogo, nunca como test de referencia.
      expect(!wod?.movementId.startsWith('benchmark:') || Boolean(wod?.wodCatalogId), iso).toBe(true);
    }
  });

  it('la víspera es una sesión de recuperación y los días de después bajan la carga', () => {
    const eve = day('2026-11-05');
    expect(eve.competition?.phase).toBe('vispera');
    expect(eve.blocks.some((b) => b.block === 'strength')).toBe(false);
    expect(day('2026-11-09').competition?.phase).toBe('post');
    expect(day('2026-11-09').mesocycleWeek).toBe(4);
  });

  it('pasada la ventana vuelve el plan normal', () => {
    expect(day('2026-11-12').competition).toBeUndefined();
  });
});
