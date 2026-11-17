import { describe, expect, it } from 'vitest';
import { parseAsk } from './rexAsk';
import { forgotAnswer, painFollowAnswer, recallAnswer, rememberedAnswer } from './rexMemoryAsk';
import { addNote, describeNote, matchingNotes, removeNotes, timeLimitFor } from '../../engine/rexNotes';
import type { RexNote } from '../../data/athlete/types';

const parse = (t: string) => parseAsk(t, 3);

describe('apuntar lo que Rex debe recordar', () => {
  it('«los jueves solo tengo 45 minutos» es un recuerdo de tiempo de ese día', () => {
    expect(parse('Recuerda que los jueves solo tengo 45 minutos')).toEqual({ kind: 'recordar', note: { kind: 'tiempo', weekday: 4, minutes: 45 } });
    expect(parse('recuérdame que los martes tengo una hora')).toEqual({ kind: 'recordar', note: { kind: 'tiempo', weekday: 2, minutes: 60 } });
    expect(parse('ten en cuenta que los viernes solo puedo media hora')).toEqual({ kind: 'recordar', note: { kind: 'tiempo', weekday: 5, minutes: 30 } });
    expect(parse('recuerda que los sábados dispongo de 1,5 horas')).toEqual({ kind: 'recordar', note: { kind: 'tiempo', weekday: 6, minutes: 90 } });
  });

  it('cualquier otra cosa tras «recuerda que» es una nota libre, con la primera letra en mayúscula', () => {
    expect(parse('recuerda que mi muñeca izquierda es delicada')).toEqual({ kind: 'recordar', note: { kind: 'nota', text: 'Mi muñeca izquierda es delicada' } });
    // Un día sin minutos no es un recuerdo de tiempo.
    expect(parse('recuerda que los jueves entreno en casa')).toEqual({ kind: 'recordar', note: { kind: 'nota', text: 'Los jueves entreno en casa' } });
  });

  it('«apunta…» y «anota…» siguen siendo comida, peso y marcas: no se confunden con recordar', () => {
    expect(parse('apunta 82,4 kg').kind).toBe('peso');
    expect(parse('anota que he comido arroz').kind).toBe('comida');
    expect(parse('apunta mi back squat 140').kind).toBe('marca-apuntar');
  });
});

describe('contar y olvidar', () => {
  it('«qué recuerdas de mí» y parecidos', () => {
    for (const t of ['¿Qué recuerdas de mí?', 'qué sabes de mí', 'mis notas', 'lo que recuerdas']) expect(parse(t).kind, t).toBe('recuerdos');
  });

  it('olvidar todo, un día, un recuerdo por su id o una nota por lo que dice', () => {
    expect(parse('olvida todo')).toEqual({ kind: 'olvidar', by: 'todo' });
    expect(parse('olvida lo de los jueves')).toEqual({ kind: 'olvidar', by: { weekday: 4 } });
    expect(parse('olvida el recuerdo nabc12')).toEqual({ kind: 'olvidar', by: { id: 'nabc12' } });
    expect(parse('olvida que mi muñeca es delicada')).toEqual({ kind: 'olvidar', by: { text: 'mi muñeca es delicada' } });
    expect(parse('olvida').kind).toBe('recuerdos');
  });
});

describe('cómo sigue una molestia', () => {
  it('va mejor / sigue igual / ya pasó, con o sin zona', () => {
    expect(parse('el hombro va mejor')).toEqual({ kind: 'dolor-estado', zone: 'hombro', answer: 'mejor' });
    expect(parse('me duele menos la rodilla')).toEqual({ kind: 'dolor-estado', zone: 'rodilla', answer: 'mejor' });
    expect(parse('mi hombro sigue igual')).toEqual({ kind: 'dolor-estado', zone: 'hombro', answer: 'sigue' });
    expect(parse('me sigue doliendo la lumbar')).toEqual({ kind: 'dolor-estado', zone: 'cadera-lumbar', answer: 'sigue' });
    expect(parse('ya no me duele el hombro')).toEqual({ kind: 'dolor-estado', zone: 'hombro', answer: 'paso' });
    expect(parse('ya no me duele')).toEqual({ kind: 'dolor-estado', zone: null, answer: 'paso' });
    expect(parse('el codo ya está bien')).toEqual({ kind: 'dolor-estado', zone: 'codo-muneca', answer: 'paso' });
  });

  it('una molestia nueva («me duele el hombro») sigue siendo el imprevisto de siempre, no un seguimiento', () => {
    expect(parse('me duele el hombro')).toEqual({ kind: 'dolor', zone: 'hombro' });
    expect(parse('me duele algo').kind).toBe('dolor');
  });
});

describe('las notas', () => {
  const T = Date.UTC(2026, 10, 17, 12);

  it('un recuerdo de tiempo por día: el nuevo sustituye al anterior; las notas iguales no se repiten', () => {
    let notes: RexNote[] = [];
    notes = addNote(notes, { kind: 'tiempo', weekday: 4, minutes: 45 }, T).notes;
    notes = addNote(notes, { kind: 'tiempo', weekday: 2, minutes: 60 }, T).notes;
    notes = addNote(notes, { kind: 'tiempo', weekday: 4, minutes: 30 }, T + 1000).notes;
    expect(notes.filter((n) => n.kind === 'tiempo')).toHaveLength(2);
    expect(timeLimitFor(notes, 4)).toBe(30);
    expect(timeLimitFor(notes, 2)).toBe(60);
    expect(timeLimitFor(notes, 1)).toBeNull();
    const first = addNote(notes, { kind: 'nota', text: 'Mi muñeca es delicada' }, T);
    const again = addNote(first.notes, { kind: 'nota', text: ' mi muñeca  es delicada ' }, T);
    expect(again.notes).toHaveLength(first.notes.length);
    expect(again.note.id).toBe(first.note.id);
  });

  it('los minutos se mantienen en un rango razonable', () => {
    expect(timeLimitFor(addNote([], { kind: 'tiempo', weekday: 1, minutes: 3 }, T).notes, 1)).toBe(10);
    expect(timeLimitFor(addNote([], { kind: 'tiempo', weekday: 1, minutes: 999 }, T).notes, 1)).toBe(240);
  });

  it('olvidar por día, por id, por texto o todo', () => {
    let notes: RexNote[] = [];
    notes = addNote(notes, { kind: 'tiempo', weekday: 4, minutes: 45 }, T).notes;
    const n = addNote(notes, { kind: 'nota', text: 'Mi muñeca es delicada' }, T);
    notes = n.notes;
    expect(matchingNotes(notes, { weekday: 4 })).toHaveLength(1);
    expect(removeNotes(notes, { id: n.note.id }).notes).toHaveLength(1);
    expect(removeNotes(notes, { text: 'muñeca es delicada' }).removed).toHaveLength(1);
    expect(removeNotes(notes, { text: 'xx' }).removed).toHaveLength(0);
    expect(removeNotes(notes, 'todo').notes).toEqual([]);
    expect(removeNotes(notes, { weekday: 4 }).notes.map((x) => x.kind)).toEqual(['nota']);
  });

  it('se describen en una frase corta', () => {
    const notes = addNote(addNote([], { kind: 'tiempo', weekday: 4, minutes: 45 }, T).notes, { kind: 'nota', text: 'Mi muñeca es delicada' }, T).notes;
    expect(notes.map(describeNote)).toEqual(['Los jueves: 45 min', 'Mi muñeca es delicada']);
  });
});

describe('las respuestas de la memoria', () => {
  const T = Date.UTC(2026, 10, 17, 12);
  const notes = addNote(addNote([], { kind: 'tiempo', weekday: 4, minutes: 45 }, T).notes, { kind: 'nota', text: 'Mi muñeca es delicada' }, T).notes;

  it('apuntar dice qué hará Rex y se puede deshacer con una frase que Rex entiende', () => {
    const a = rememberedAnswer(notes[0]);
    expect(a.text).toContain('Los jueves');
    expect(a.text).toContain('nunca la cambio sin que me lo confirmes');
    const undo = a.actions.find((x) => x.label === 'Deshacer');
    expect(parseAsk(undo!.ask!, 3)).toEqual({ kind: 'olvidar', by: { weekday: 4 } });
    const note = rememberedAnswer(notes[1]);
    expect(parseAsk(note.actions[0].ask!, 3)).toEqual({ kind: 'olvidar', by: { id: notes[1].id } });
  });

  it('«qué recuerdas» lista todo y cada botón de olvidar es una frase que Rex entiende', () => {
    const a = recallAnswer(notes);
    expect(a.text).toContain('Los jueves: 45 min');
    expect(a.text).toContain('Mi muñeca es delicada');
    for (const act of a.actions) expect(parseAsk(act.ask!, 3).kind, act.label).toBe('olvidar');
    expect(recallAnswer([]).text).toContain('recuerda que');
  });

  it('olvidar sin encontrar nada lo dice', () => {
    expect(forgotAnswer([], 'todo').lead).toBe('No encuentro eso.');
    expect(forgotAnswer([notes[0]], { weekday: 4 }).text).toContain('Los jueves: 45 min');
  });

  it('seguimiento de una molestia: cada respuesta dice qué pasa con la carga', () => {
    expect(painFollowAnswer('paso', ['hombro']).text).toContain('progresiva');
    expect(painFollowAnswer('mejor', ['hombro', 'rodilla']).text).toContain('hombro y rodilla');
    expect(painFollowAnswer('sigue', ['rodilla']).tone).toBe('mid');
  });
});
