import { describe, expect, it } from 'vitest';
import { makeProfile } from '../../engine/__fixtures';
import { normalizeAsk, parseAsk } from './rexAsk';
import { applyMark, currentMark, findMarkLift, markEstimateAnswer, markLiftByKey, markPickAnswer, markProposalAnswer, markSavedAnswer, markViewAnswer } from './rexMarks';

const FRIDAY = 5;
const lift = (key: string) => markLiftByKey(key)!;
const profile = makeProfile({ prs: { backSquat: 135, frontSquat: 110, benchPress: 90, deadlift: 180, strictPress: 55, clean: 100, snatch: 75, cleanAndJerk: 100 } });

describe('qué levantamiento se nombra', () => {
  it('lo concreto gana a lo general', () => {
    const f = (t: string) => findMarkLift(normalizeAsk(t))?.key;
    expect(f('mi power snatch')).toBe('powerSnatch');
    expect(f('mi snatch')).toBe('snatch');
    expect(f('clean and jerk')).toBe('cleanAndJerk');
    expect(f('C&J 110')).toBe('cleanAndJerk');
    expect(f('mi cargada')).toBe('clean');
    expect(f('front squat')).toBe('frontSquat');
    expect(f('la sentadilla')).toBe('backSquat');
    expect(f('press banca')).toBe('benchPress');
    expect(f('press militar')).toBe('strictPress');
    expect(f('peso muerto sumo')).toBe('sumoDeadlift');
    expect(f('he comido arroz')).toBeUndefined();
  });
});

describe('leer una marca escrita', () => {
  it('apuntar con kilos, aunque diga kg (no es el peso corporal)', () => {
    expect(parseAsk('mi back squat es 140 kg', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: 140, confirmed: false });
    expect(parseAsk('nuevo PR en banca 92,5', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: 92.5 });
    expect(parseAsk('Back Squat 140', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: 140 });
  });

  it('sin decir el levantamiento o sin los kilos, lo pregunta', () => {
    expect(parseAsk('apuntar marca', FRIDAY)).toEqual({ kind: 'marca-apuntar', lift: null, kg: null, confirmed: false });
    expect(parseAsk('apuntar marca de snatch', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: null });
  });

  it('el botón de confirmar lleva la marca ya confirmada', () => {
    expect(parseAsk('confirmo marca Back Squat 140', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: 140, confirmed: true });
    expect(parseAsk('confirmo marca Clean & Jerk 107.5', FRIDAY)).toMatchObject({ kind: 'marca-apuntar', kg: 107.5, confirmed: true });
  });

  it('ver una marca o todas', () => {
    expect(parseAsk('mis marcas', FRIDAY)).toEqual({ kind: 'marca-ver', lift: null });
    expect(parseAsk('mis records', FRIDAY)).toEqual({ kind: 'marca-ver', lift: null });
    expect(parseAsk('cuanto levanto en snatch', FRIDAY)).toMatchObject({ kind: 'marca-ver' });
    expect(parseAsk('cual es mi marca de sentadilla', FRIDAY)).toMatchObject({ kind: 'marca-ver' });
  });

  it('una serie con carga y repeticiones es una estimación, no una marca', () => {
    expect(parseAsk('hice 100 x 3 en sentadilla', FRIDAY)).toMatchObject({ kind: 'marca-estimar', loadKg: 100, reps: 3 });
    expect(parseAsk('banca 80 kg por 5', FRIDAY)).toMatchObject({ kind: 'marca-estimar', loadKg: 80, reps: 5 });
  });

  it('lo que no va de marcas sigue siendo lo que era', () => {
    expect(parseAsk('apunta 82,4 kg', FRIDAY)).toEqual({ kind: 'peso', kg: 82.4 });
    expect(parseAsk('quiero subir mi sentadilla', FRIDAY).kind).toBe('crear');
    expect(parseAsk('mañana toca sentadilla', FRIDAY).kind).toBe('dia');
    expect(parseAsk('me duele la rodilla en la sentadilla 100', FRIDAY).kind).toBe('dolor');
    expect(parseAsk('he comido 150 g de pollo', FRIDAY).kind).toBe('comida');
  });
});

describe('las respuestas de marcas', () => {
  it('ver una marca dice cuándo se apuntó y cuánto cambió', () => {
    const p = { ...profile, prLog: [{ date: '2026-09-03', key: 'backSquat', kg: 125 }, { date: '2026-10-03', key: 'backSquat', kg: 135 }] };
    const a = markViewAnswer(p, 'backSquat', 'analisis');
    expect(a.lead).toBe('Back Squat: 135 kg.');
    expect(a.text).toBe('Apuntada el 3 oct, +10 kg desde 125.');
    expect(markViewAnswer(profile, null, 'analisis').text).toMatch(/Back Squat 135 · Front Squat 110/);
    expect(markViewAnswer(makeProfile({ prs: { ...profile.prs, snatch: 0 } }), 'snatch', 'analisis').lead).toBe('Snatch: sin marca.');
  });

  it('antes de guardar enseña el cambio y pide confirmar', () => {
    const a = markProposalAnswer(profile, lift('backSquat'), 140, 'analisis');
    expect(a.text).toBe('135 → 140 kg (+5). ¿Lo apunto?');
    expect(a.actions[0]).toMatchObject({ label: 'Sí, apuntar', ask: 'confirmo marca Back Squat 140' });
    expect(markProposalAnswer(profile, lift('backSquat'), 135, 'analisis').lead).toBe('Ya la tienes.');
  });

  it('un salto de más del 15 % o una bajada se avisan antes', () => {
    expect(markProposalAnswer(profile, lift('backSquat'), 170, 'analisis').lead).toBe('Es un salto grande.');
    const down = markProposalAnswer(profile, lift('backSquat'), 120, 'analisis');
    expect(down.lead).toBe('Es menos que tu marca.');
    expect(down.actions[0].label).toBe('Sí, bajarla');
  });

  it('una serie da un 1RM estimado que no se guarda sin confirmar', () => {
    const a = markEstimateAnswer(profile, lift('backSquat'), 125, 3, 'analisis');
    expect(a.lead).toMatch(/1RM de unos 137,5 kg/);
    expect(a.actions[0].ask).toBe('confirmo marca Back Squat 137.5');
    expect(markEstimateAnswer(profile, lift('backSquat'), 100, 3, 'analisis').lead).toBe('No pasa tu marca.');
    expect(markEstimateAnswer(profile, lift('backSquat'), 60, 12, 'analisis').lead).toBe('Demasiadas repeticiones.');
    // Con una sola repetición no se estima: es la marca misma.
    expect(markEstimateAnswer(profile, lift('backSquat'), 140, 1, 'analisis').text).toBe('135 → 140 kg (+5). ¿Lo apunto?');
  });

  it('elegir levantamiento ofrece los ocho base y lo apuntado cuenta el cambio', () => {
    expect(markPickAnswer('analisis').actions).toHaveLength(8);
    expect(markSavedAnswer(135, lift('backSquat'), 140, 'analisis').text).toMatch(/135 → 140 kg \(\+5\)/);
  });

  it('aplicar la marca cambia la base o la variante', () => {
    expect(applyMark(profile, lift('backSquat'), 140).prs.backSquat).toBe(140);
    const v = applyMark(profile, lift('pushPress'), 80);
    expect(v.variantPrs?.pushPress).toBe(80);
    expect(currentMark(v, 'pushPress')).toBe(80);
    expect(currentMark(profile, 'pushPress')).toBe(0);
  });
});
