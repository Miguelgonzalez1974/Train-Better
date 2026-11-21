import { describe, expect, it } from 'vitest';
import { OTHER_KINDS, otherDaySession, otherKindInfo, otherNote, otherTitle } from './otherActivity';

describe('otherActivity', () => {
  it('cada tipo tiene nombre y minutos razonables', () => {
    expect(OTHER_KINDS.map((k) => k.id)).toEqual(['clase', 'running', 'bici', 'fuerza', 'equipo', 'otro']);
    for (const k of OTHER_KINDS) {
      expect(k.title.length).toBeGreaterThan(2);
      expect(k.minutes).toBeGreaterThanOrEqual(30);
    }
    expect(otherKindInfo('running').minutes).toBe(45);
  });

  it('el nombre propio sustituye al del tipo y se limpia', () => {
    expect(otherTitle({ kind: 'clase' })).toBe('Clase de CrossFit');
    expect(otherTitle({ kind: 'bici', name: '  Spinning   de   tarde ' })).toBe('Spinning de tarde');
    expect(otherTitle({ kind: 'otro', name: '   ' })).toBe('Otra actividad');
  });

  it('la nota recoge el resultado si lo hay', () => {
    expect(otherNote({ kind: 'clase' })).toContain('sin detalle de bloques');
    expect(otherNote({ kind: 'clase', result: ' 12 rondas ' })).toBe('Registrado sin detalle de bloques. Resultado: 12 rondas.');
  });

  it('la sesión guardada es un día propio, sin bloques ni series y editado por el atleta', () => {
    const s = otherDaySession('2026-11-21', 2, { kind: 'running', result: '8 km' });
    expect(s).toMatchObject({ date: '2026-11-21', isRestDay: false, source: 'custom', swapLabel: 'Otra cosa', editedByAthlete: true, customTitle: 'Running' });
    expect(s.blocks).toEqual([]);
    expect(s.customNote).toContain('8 km');
  });
});
