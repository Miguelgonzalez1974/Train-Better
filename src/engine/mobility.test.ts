import { describe, expect, it } from 'vitest';
import { MOBILITY_LIBRARY, MOBILITY_ZONES, mobilityVideoUrl } from '../data/mobility';
import type { AthleteProfile, MobilityLogEntry } from '../data/athlete/types';
import { mergeProfile } from '../data/athlete/mergeProfile';
import { makeProfile } from './__fixtures';
import {
  allowedWithPain,
  buildRoutine,
  expandPhases,
  painZones,
  ratingDue,
  ratingTrend,
  routineSeconds,
  sessionPatterns,
  suggestMobilityZones,
  weeklyMobilityMinutes,
  withMobilityDone,
  withMobilityFocus,
  withMobilityRating,
} from './mobility';

const entry = (o: Partial<MobilityLogEntry> = {}): MobilityLogEntry => ({ id: 'm1', date: '2026-11-03', purpose: 'recuperar', zones: ['caderas'], minutes: 8, exercises: 5, ...o });

describe('movilidad: la biblioteca', () => {
  it('cada zona tiene ejercicios de todos los tipos que usan los propósitos, y los ids no se repiten', () => {
    expect(new Set(MOBILITY_LIBRARY.map((e) => e.id)).size).toBe(MOBILITY_LIBRARY.length);
    for (const zone of MOBILITY_ZONES) {
      const own = MOBILITY_LIBRARY.filter((e) => e.zones[0] === zone);
      expect(own.length, zone).toBeGreaterThanOrEqual(3);
      // Se puede calentar (dinámico o activación) y estirar (estático o rodillo) en toda zona.
      expect(own.some((e) => e.kind === 'dinamico' || e.kind === 'activacion'), `${zone} calentar`).toBe(true);
      expect(own.some((e) => e.kind === 'estatico' || e.kind === 'liberacion'), `${zone} estirar`).toBe(true);
    }
  });

  it('todos tienen cómo se hace, tiempo razonable y enlace de vídeo', () => {
    for (const e of MOBILITY_LIBRARY) {
      expect(e.how.length, e.id).toBeGreaterThan(20);
      expect(e.seconds, e.id).toBeGreaterThanOrEqual(25);
      expect(e.seconds, e.id).toBeLessThanOrEqual(60);
      expect(mobilityVideoUrl(e)).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    }
    expect(mobilityVideoUrl({ name: '90/90 de cadera' })).toContain(encodeURIComponent('90/90 de cadera'));
  });
});

describe('movilidad: qué zonas trabajar', () => {
  it('la sesión de hoy manda cuando no hay nada más', () => {
    const s = suggestMobilityZones({ patterns: ['squat'] });
    expect(s.map((z) => z.zone)).toEqual(['caderas', 'tobillos']);
    expect(s[0].why).toBe('hoy hay sentadillas');
  });

  it('las agujetas y las zonas prioritarias pesan más que la sesión', () => {
    const s = suggestMobilityZones({ patterns: ['squat'], soreZones: { 'muslo-d': 2 }, focus: ['hombros'] });
    expect(s.map((z) => z.zone)).toEqual(['cuadriceps', 'hombros', 'caderas']);
    expect(s[0].why).toBe('agujetas en muslo der.');
    expect(s[1].why).toBe('es una de tus zonas prioritarias');
  });

  it('suma motivos y no pasa de tres zonas', () => {
    const s = suggestMobilityZones({ patterns: ['olyLift', 'squat', 'horizontalPush'], focus: ['caderas'] });
    expect(s).toHaveLength(3);
    expect(s[0].zone).toBe('caderas');
    expect(s[0].why).toBe('es una de tus zonas prioritarias y hoy hay halterofilia');
  });

  it('los patrones salen de los bloques de trabajo, no del calentamiento', () => {
    expect(sessionPatterns(null)).toEqual([]);
    const patterns = sessionPatterns({ blocks: [{ block: 'strength', movementId: 'back-squat' }, { block: 'warmup', movementId: 'hip-halo' }] });
    expect(patterns).toContain('squat');
    expect(patterns).not.toContain('mobility');
  });
});

describe('movilidad: la rutina', () => {
  const base = { zones: ['caderas', 'hombros'] as const, painAreas: [] as never[] };

  it('se ajusta al tiempo y reparte entre las zonas', () => {
    for (const minutes of [5, 10, 15]) {
      const r = buildRoutine({ purpose: 'movilidad', zones: [...base.zones], minutes, painAreas: [] });
      expect(routineSeconds(r), `${minutes} min`).toBeLessThanOrEqual(minutes * 60 + 20);
      expect(routineSeconds(r), `${minutes} min`).toBeGreaterThan(minutes * 60 * 0.6);
      expect(new Set(r.map((it) => it.exercise.zones[0])).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('más tiempo, más ejercicios, sin repetir', () => {
    const five = buildRoutine({ purpose: 'movilidad', zones: ['caderas', 'hombros'], minutes: 5, painAreas: [] });
    const fifteen = buildRoutine({ purpose: 'movilidad', zones: ['caderas', 'hombros'], minutes: 15, painAreas: [] });
    expect(fifteen.length).toBeGreaterThan(five.length);
    expect(new Set(fifteen.map((it) => it.exercise.id)).size).toBe(fifteen.length);
  });

  it('calentar solo lleva dinámico y activación; estirar, rodillo y estático', () => {
    const warm = buildRoutine({ purpose: 'calentar', zones: ['caderas', 'toracica'], minutes: 10, painAreas: [] });
    expect(warm.every((it) => it.exercise.kind === 'dinamico' || it.exercise.kind === 'activacion')).toBe(true);
    // Activación primero.
    expect(warm[0].exercise.kind).toBe('activacion');
    const cool = buildRoutine({ purpose: 'recuperar', zones: ['isquios', 'tobillos'], minutes: 10, painAreas: [] });
    expect(cool.every((it) => it.exercise.kind === 'estatico' || it.exercise.kind === 'liberacion')).toBe(true);
    expect(cool[0].exercise.kind).toBe('liberacion');
  });

  it('con un aviso de molestia no pone nada que cargue esa zona y, en esa zona, solo lo suave', () => {
    const r = buildRoutine({ purpose: 'movilidad', zones: ['cuadriceps', 'tobillos', 'hombros'], minutes: 15, painAreas: ['rodilla'] });
    expect(r.length).toBeGreaterThan(0);
    for (const it of r) {
      expect(it.exercise.loads ?? []).not.toContain('rodilla');
      if (it.exercise.zones.some((z) => z === 'cuadriceps' || z === 'tobillos')) expect(it.exercise.gentle, it.exercise.id).toBe(true);
    }
    expect(painZones(['hombro'])).toEqual(new Set(['hombros', 'toracica']));
    const cosaca = MOBILITY_LIBRARY.find((e) => e.id === 'cadera-cosaca')!;
    expect(allowedWithPain(cosaca, ['rodilla'])).toBe(false);
    expect(allowedWithPain(cosaca, ['hombro'])).toBe(true);
  });

  it('varía de un día a otro con la semilla, y es estable con la misma', () => {
    const a = buildRoutine({ purpose: 'movilidad', zones: ['caderas'], minutes: 5, painAreas: [], seed: 0 }).map((it) => it.exercise.id);
    const b = buildRoutine({ purpose: 'movilidad', zones: ['caderas'], minutes: 5, painAreas: [], seed: 1 }).map((it) => it.exercise.id);
    expect(a).not.toEqual(b);
    expect(buildRoutine({ purpose: 'movilidad', zones: ['caderas'], minutes: 5, painAreas: [], seed: 0 }).map((it) => it.exercise.id)).toEqual(a);
  });

  it('sin zonas, o con todas las zonas vetadas, no inventa: lista vacía', () => {
    expect(buildRoutine({ purpose: 'movilidad', zones: [], minutes: 10, painAreas: [] })).toEqual([]);
  });

  it('la guía: un ejercicio de dos lados son dos fases seguidas', () => {
    const items = buildRoutine({ purpose: 'recuperar', zones: ['isquios'], minutes: 5, painAreas: [] });
    const phases = expandPhases(items);
    expect(phases.length).toBe(items.reduce((n, it) => n + it.sides, 0));
    const two = phases.findIndex((p) => p.sides === 2 && p.side === 1);
    if (two >= 0) expect(phases[two + 1]).toMatchObject({ side: 2, index: phases[two].index });
  });
});

describe('movilidad: registro, zonas prioritarias y valoraciones', () => {
  const profile = (o: Partial<AthleteProfile> = {}) => makeProfile({ mobilityLog: [], mobilityFocus: undefined, mobilityRatings: [], ...o });

  it('apunta una rutina sin mutar y cuenta los minutos de la semana (lunes a domingo)', () => {
    const p = profile();
    const done = withMobilityDone(withMobilityDone(p, entry({ id: 'a', date: '2026-11-02', minutes: 8 })), entry({ id: 'b', date: '2026-11-04', minutes: 12 }));
    expect(p.mobilityLog).toEqual([]);
    expect(weeklyMobilityMinutes(done, '2026-11-05')).toBe(20);
    // La semana anterior no cuenta.
    expect(weeklyMobilityMinutes(withMobilityDone(p, entry({ id: 'c', date: '2026-11-01', minutes: 9 })), '2026-11-05')).toBe(0);
    // Apuntar el mismo id lo sustituye.
    expect(withMobilityDone(done, entry({ id: 'a', date: '2026-11-02', minutes: 5 })).mobilityLog).toHaveLength(2);
  });

  it('guarda las zonas prioritarias sin repetidas, y una lista vacía las quita', () => {
    const p = withMobilityFocus(profile(), ['caderas', 'caderas', 'hombros']);
    expect(p.mobilityFocus).toEqual(['caderas', 'hombros']);
    expect(withMobilityFocus(p, []).mobilityFocus).toBeUndefined();
  });

  it('pregunta por una zona prioritaria el día después de trabajarla, y solo hasta que se valora', () => {
    let p = withMobilityFocus(profile(), ['caderas']);
    expect(ratingDue(p, '2026-11-05')).toBeNull();
    p = withMobilityDone(p, entry({ date: '2026-11-04', zones: ['caderas'] }));
    expect(ratingDue(p, '2026-11-04')).toBeNull();
    expect(ratingDue(p, '2026-11-05')).toBe('caderas');
    p = withMobilityRating(p, { date: '2026-11-05', zone: 'caderas', value: 3 });
    expect(ratingDue(p, '2026-11-05')).toBeNull();
    // Se vuelve a trabajar → vuelve a tocar valorar.
    p = withMobilityDone(p, entry({ id: 'm2', date: '2026-11-06', zones: ['caderas'] }));
    expect(ratingDue(p, '2026-11-07')).toBe('caderas');
    // Una zona que no es prioritaria nunca se pregunta.
    expect(ratingDue(withMobilityDone(profile(), entry({ date: '2026-11-04' })), '2026-11-05')).toBeNull();
  });

  it('la tendencia compara las dos últimas valoraciones', () => {
    let p = profile();
    expect(ratingTrend(p, 'caderas')).toBeNull();
    p = withMobilityRating(p, { date: '2026-10-20', zone: 'caderas', value: 2 });
    expect(ratingTrend(p, 'caderas')).toEqual({ last: 2, previous: null, direction: null });
    p = withMobilityRating(p, { date: '2026-11-05', zone: 'caderas', value: 4 });
    expect(ratingTrend(p, 'caderas')).toEqual({ last: 4, previous: 2, direction: 'mejora' });
    // La misma zona y día se sustituye.
    expect(withMobilityRating(p, { date: '2026-11-05', zone: 'caderas', value: 1 }).mobilityRatings).toHaveLength(2);
  });
});

describe('movilidad: sincronización', () => {
  it('une las rutinas y valoraciones de los dos dispositivos, y las zonas prioritarias del local ganan', () => {
    const remote = makeProfile({ onboardedAt: '2026-01-01', mobilityLog: [entry({ id: 'a' })], mobilityFocus: ['hombros'], mobilityRatings: [{ date: '2026-11-03', zone: 'caderas', value: 2 }] });
    const local = makeProfile({ onboardedAt: '2026-01-01', mobilityLog: [entry({ id: 'b', date: '2026-11-04' })], mobilityFocus: ['caderas'], mobilityRatings: [{ date: '2026-11-04', zone: 'caderas', value: 3 }] });
    const merged = mergeProfile(remote, local);
    expect(merged.mobilityLog?.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(merged.mobilityRatings).toHaveLength(2);
    expect(merged.mobilityFocus).toEqual(['caderas']);
    // Sin nada de movilidad en ninguno, no inventa campos.
    const none = mergeProfile(makeProfile({ onboardedAt: '2026-01-01' }), makeProfile({ onboardedAt: '2026-01-01' }));
    expect(none.mobilityLog).toBeUndefined();
    expect(none.mobilityFocus).toBeUndefined();
  });
});
