import { describe, expect, it } from 'vitest';
import type { Goal, StrengthProgram } from '../../data/athlete/types';
import { makeMacro, makeProfile as fixtureProfile } from '../../engine/__fixtures';
import { buildOpenItems } from './openItems';

const TODAY = '2026-11-04';

/** El perfil de pruebas trae un macrociclo de ejemplo: aquí parte sin ninguno para que cada caso ponga solo lo suyo. */
const makeProfile = (o: Parameters<typeof fixtureProfile>[0] = {}) => fixtureProfile({ macrocycles: [], ...o });

const goal = (extra: Partial<Goal>): Goal => ({
  id: 'g1',
  type: 'subir-pr',
  movementId: 'back-squat',
  targetDate: '2027-01-13',
  emphasis: 'moderado',
  createdAt: '2026-10-01',
  ...extra,
});

const program = (extra: Partial<StrengthProgram> = {}): StrengthProgram => ({
  id: 'p1',
  startDate: '2026-10-28',
  endDate: '2026-12-22',
  method: '531',
  lifts: [],
  ...extra,
});

describe('lo que tengo abierto', () => {
  it('sin nada guardado no hay nada abierto ni aviso', () => {
    const g = buildOpenItems(makeProfile({}), [], TODAY);
    expect(g.total).toBe(0);
    expect(g.pauseNote).toBeNull();
    expect([g.objetivos, g.fondo, g.viene, g.terminados].every((x) => x.length === 0)).toBe(true);
  });

  describe('objetivos', () => {
    it('un objetivo con levantamiento a tiempo va al día, con su barra y la raya de lo esperable', () => {
      const [item] = buildOpenItems(makeProfile({ goals: [goal({})] }), [], TODAY).objetivos;
      expect(item.title).toMatch(/Subir PR/);
      expect(item.chip).toEqual({ text: 'Va al día', tone: 'good' });
      expect(item.pct).toBe(33);
      expect(item.tick).toBe(33);
      expect(item.sub).toMatch(/vence el 13 ene/);
      expect(item.actions).toEqual(['editar', 'terminar']);
      expect(item.facts[0]).toMatch(/60-75 %/);
    });

    it('con el énfasis intensivo cuenta el 90-95 % de los días', () => {
      expect(buildOpenItems(makeProfile({ goals: [goal({ emphasis: 'intensivo' })] }), [], TODAY).objetivos[0].facts[0]).toMatch(/90-95 %/);
    });

    it('pasada la mitad del plazo sin ningún test, el motor lo trata como atrasado y lo dice: falta un test', () => {
      const [item] = buildOpenItems(makeProfile({ goals: [goal({ createdAt: '2026-08-01', targetDate: '2026-12-01' })] }), [], TODAY).objetivos;
      expect(item.chip).toEqual({ text: 'Falta un test', tone: 'warn' });
      expect(item.facts.join(' ')).toMatch(/haz un test/);
      expect(item.facts.join(' ')).toMatch(/90 % o más/);
    });

    it('una competición cuenta los días, sin barra de avance', () => {
      const [item] = buildOpenItems(makeProfile({ goals: [goal({ type: 'preparar-competicion', movementId: undefined, targetDate: '2026-11-06', eventEndDate: '2026-11-07' })] }), [], TODAY).objetivos;
      expect(item.chip).toEqual({ text: 'Faltan 2 d', tone: 'accent' });
      expect(item.pct).toBeNull();
      expect(item.sub).toMatch(/del 6 nov al 7 nov/);
    });

    it('un objetivo sin levantamiento (resistencia) va "en marcha" y no lleva la raya', () => {
      const [item] = buildOpenItems(makeProfile({ goals: [goal({ type: 'elevar-resistencia', movementId: undefined })] }), [], TODAY).objetivos;
      expect(item.chip).toEqual({ text: 'En marcha', tone: 'good' });
      expect(item.tick).toBeNull();
    });

    it('uno vencido va a terminados y solo se puede terminar', () => {
      const g = buildOpenItems(makeProfile({ goals: [goal({ targetDate: '2026-10-20' })] }), [], TODAY);
      expect(g.objetivos).toHaveLength(0);
      expect(g.total).toBe(0);
      expect(g.terminados[0].actions).toEqual(['terminar']);
      expect(g.terminados[0].chip.text).toBe('Vencido');
    });

    it('van ordenados por fecha: el más cercano primero', () => {
      const g = buildOpenItems(makeProfile({ goals: [goal({ id: 'lejos', targetDate: '2027-03-01' }), goal({ id: 'cerca', targetDate: '2026-12-01' })] }), [], TODAY);
      expect(g.objetivos.map((i) => i.refId)).toEqual(['cerca', 'lejos']);
    });
  });

  describe('plan de fondo', () => {
    const macro = makeMacro({ id: 'otono', label: 'Macrociclo otoño', startDate: '2026-09-23', endDate: '2026-12-16' });

    it('el macrociclo activo sale en marcha, con su semana, su fase y su avance', () => {
      const [item] = buildOpenItems(makeProfile({ macrocycles: [macro] }), [], TODAY).fondo;
      expect(item.kind).toBe('macro');
      expect(item.chip).toEqual({ text: 'En marcha', tone: 'good' });
      expect(item.sub).toMatch(/semana 7 de 12/);
      expect(item.sub).toMatch(/hasta el 16 dic/);
      expect(item.pct).toBe(58);
      expect(item.actions).toEqual(['editar', 'plan', 'eliminar']);
    });

    it('los macrociclos futuros esperan en "lo que viene" y los pasados van a terminados', () => {
      const future = makeMacro({ id: 'invierno', label: 'Invierno', startDate: '2026-12-16', endDate: '2027-03-10' });
      const past = makeMacro({ id: 'verano', label: 'Verano', startDate: '2026-04-01', endDate: '2026-08-01' });
      const g = buildOpenItems(makeProfile({ macrocycles: [macro, future, past] }), [], TODAY);
      expect(g.viene.map((i) => i.refId)).toEqual(['invierno']);
      expect(g.viene[0].chip.text).toBe('Programado');
      expect(g.terminados.map((i) => i.refId)).toEqual(['verano']);
      expect(g.total).toBe(2);
    });

    it('si dos macrociclos se pisan, solo el que usa el motor cuenta como activo', () => {
      const other = makeMacro({ id: 'otro', label: 'Otro', startDate: '2026-10-01', endDate: '2026-12-01' });
      const g = buildOpenItems(makeProfile({ macrocycles: [macro, other] }), [], TODAY);
      expect(g.fondo).toHaveLength(1);
      expect(g.viene.map((i) => i.refId)).toContain('otro');
    });

    it('con un programa de fuerza activo, manda él: el macrociclo y los objetivos quedan en pausa y sale el aviso', () => {
      const g = buildOpenItems(makeProfile({ macrocycles: [macro], goals: [goal({})], strengthPrograms: [program()] }), [], TODAY);
      expect(g.fondo.map((i) => i.kind)).toEqual(['programa', 'macro']);
      expect(g.fondo[0].chip).toEqual({ text: 'Manda ahora', tone: 'accent' });
      expect(g.fondo[0].sub).toMatch(/semana 2 de 8/);
      expect(g.fondo[1].chip.text).toBe('En pausa');
      expect(g.fondo[1].dim).toBe(true);
      expect(g.objetivos[0].chip.text).toBe('En pausa');
      expect(g.objetivos[0].facts[0]).toMatch(/22 dic/);
      expect(g.pauseNote).toMatch(/22 dic/);
    });

    it('un programa solo sin nada que pausar no saca el aviso', () => {
      expect(buildOpenItems(makeProfile({ strengthPrograms: [program()] }), [], TODAY).pauseNote).toBeNull();
    });

    it('un programa futuro espera, y uno ya acabado va a terminados', () => {
      const g = buildOpenItems(makeProfile({ strengthPrograms: [program({ id: 'futuro', startDate: '2027-01-05', endDate: '2027-03-01' }), program({ id: 'viejo', startDate: '2026-08-01', endDate: '2026-09-30' })] }), [], TODAY);
      expect(g.viene.map((i) => i.refId)).toEqual(['futuro']);
      expect(g.terminados.map((i) => i.refId)).toEqual(['viejo']);
    });

    it('la rampa vigente sale con sus semanas; una ya agotada va a terminados', () => {
      const live = buildOpenItems(makeProfile({ intensityRamp: { startDate: '2026-11-01', strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 } }), [], TODAY);
      expect(live.fondo[0].kind).toBe('rampa');
      expect(live.fondo[0].sub).toMatch(/fuerza semana 1\/4/);
      expect(live.fondo[0].pct).toBe(0);
      const done = buildOpenItems(makeProfile({ intensityRamp: { startDate: '2026-09-01', strengthWeeks: 2, olyWeeks: 2, wodWeeks: 1 } }), [], TODAY);
      expect(done.fondo).toHaveLength(0);
      expect(done.terminados[0].actions).toEqual(['quitar']);
    });
  });

  it('el total cuenta lo abierto de todos los bloques y no lo terminado', () => {
    const g = buildOpenItems(
      makeProfile({
        goals: [goal({}), goal({ id: 'viejo', targetDate: '2026-10-10' })],
        macrocycles: [makeMacro({ id: 'm', label: 'M', startDate: '2026-09-23', endDate: '2026-12-16' })],
        intensityRamp: { startDate: '2026-11-01', strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 },
      }),
      [],
      TODAY,
    );
    expect(g.total).toBe(3);
    expect(g.terminados).toHaveLength(1);
  });
});
