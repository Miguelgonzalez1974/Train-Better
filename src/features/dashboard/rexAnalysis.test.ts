import { describe, expect, it } from 'vitest';
import type { Goal } from '../../data/athlete/types';
import { makeProfile } from '../../engine/__fixtures';
import { addSubirPrGoal, analysisRexLine, openGoalMovements, type AnalysisRexInput } from './rexAnalysis';

const base: AnalysisRexInput = {
  tab: 'fuerza',
  headline: { tone: 'good', sentences: ['Tu fuerza sube: Back Squat va un 4 % por encima de lo previsto.', 'Todo equilibrado.'] },
  strengthRatio: 2.44,
  perLift: [
    { key: 'backSquat', label: 'Back Squat', tier: 'rapido' },
    { key: 'benchPress', label: 'Bench Press', tier: 'normal' },
  ],
  imbalances: [],
  weakLiftIds: [],
  confident: true,
  weeks: 12,
  minWeeks: 8,
  ledger: { resolved: 0, hits: 0, rows: [] },
  openGoalMovementIds: [],
};
const mk = (o: Partial<AnalysisRexInput> = {}): AnalysisRexInput => ({ ...base, ...o });

describe('Rex en el Análisis: Fuerza', () => {
  it('la conclusión con el total en veces tu peso, y sin objetivo si nada va mal', () => {
    const r = analysisRexLine(mk());
    expect(r).toMatchObject({ lead: 'Vas bien de fuerza.', tone: 'good', proposal: null });
    expect(r.text).toBe('Tu total es 2,4 veces tu peso. Tu fuerza sube: Back Squat va un 4 % por encima de lo previsto.');
  });

  it('un levantamiento estancado o a la baja se ofrece como objetivo', () => {
    const r = analysisRexLine(mk({ headline: { tone: 'warn', sentences: ['Bench Press lleva tiempo estancado: el coach le da más frecuencia.'] }, perLift: [{ key: 'benchPress', label: 'Bench Press', tier: 'lento' }] }));
    expect(r.lead).toBe('Ojo con tu fuerza.');
    expect(r.proposal).toEqual({ movementId: 'bench-press', label: 'Press banca', why: 'lleva tiempo estancado' });
    expect(analysisRexLine(mk({ perLift: [{ key: 'snatch', label: 'Snatch', tier: 'regresion' }] })).proposal).toMatchObject({ movementId: 'snatch', why: 'va a la baja' });
  });

  it('no propone lo que ya tiene objetivo ni lo que Objetivos no sabe crear', () => {
    const stuck = [{ key: 'benchPress', label: 'Bench Press', tier: 'lento' as const }];
    expect(analysisRexLine(mk({ perLift: stuck, openGoalMovementIds: ['bench-press'] })).proposal).toBeNull();
    expect(analysisRexLine(mk({ perLift: [{ key: 'frontSquat', label: 'Front Squat', tier: 'lento' }] })).proposal).toBeNull();
  });

  it('sin peso corporal no habla de veces el peso, y con pocos datos lo dice', () => {
    const r = analysisRexLine(mk({ strengthRatio: null, headline: { tone: 'neutral', sentences: ['Aún hay pocos datos de fuerza.'] } }));
    expect(r.lead).toBe('Aún hay pocos datos.');
    expect(r.text).toBe('Aún hay pocos datos de fuerza.');
  });
});

describe('Rex en el Análisis: Equilibrio', () => {
  it('nombra las parejas que se desvían y propone el lado flojo', () => {
    const r = analysisRexLine(
      mk({
        tab: 'equilibrio',
        imbalances: [
          { label: 'Empuje / tirón', status: 'desbalance' },
          { label: 'Cuádriceps / femoral', status: 'equilibrado' },
        ],
        weakLiftIds: ['bench-press'],
      }),
    );
    expect(r).toMatchObject({ lead: 'Hay un desequilibrio.', tone: 'warn' });
    expect(r.text).toBe('Se desvía: empuje / tirón. El lado flojo es press banca.');
    expect(r.proposal).toEqual({ movementId: 'bench-press', label: 'Press banca', why: 'es el lado flojo de un desequilibrio' });
  });

  it('varios desequilibrios, todo bien y sin datos', () => {
    const two = analysisRexLine(mk({ tab: 'equilibrio', imbalances: [{ label: 'A', status: 'desbalance' }, { label: 'B', status: 'desbalance' }] }));
    expect(two.lead).toBe('Hay desequilibrios.');
    expect(two.text).toContain('Se desvían 2 parejas: a, b.');
    expect(analysisRexLine(mk({ tab: 'equilibrio', imbalances: [{ label: 'A', status: 'equilibrado' }] }))).toMatchObject({ lead: 'Todo equilibrado.', tone: 'good' });
    expect(analysisRexLine(mk({ tab: 'equilibrio', imbalances: [{ label: 'A', status: 'faltan-datos' }] }))).toMatchObject({ lead: 'Faltan datos.', tone: 'neutral' });
  });

  it('un lado flojo que ya tiene objetivo no se vuelve a proponer', () => {
    const r = analysisRexLine(mk({ tab: 'equilibrio', imbalances: [{ label: 'A', status: 'desbalance' }], weakLiftIds: ['bench-press'], openGoalMovementIds: ['bench-press'] }));
    expect(r.proposal).toBeNull();
  });
});

describe('Rex en el Análisis: Coach', () => {
  it('mientras aprende, cuántas semanas lleva', () => {
    expect(analysisRexLine(mk({ tab: 'coach', confident: false, weeks: 5 }))).toMatchObject({ lead: 'Aún te estoy conociendo.', text: 'Llevo 5 de 8 semanas de datos para ajustarte las cargas con confianza.' });
  });

  it('con pocos casos resueltos no mide, y con suficientes dice si acierta', () => {
    expect(analysisRexLine(mk({ tab: 'coach', ledger: { resolved: 3, hits: 3, rows: [] } })).lead).toBe('El coach te conoce.');
    const good = analysisRexLine(mk({ tab: 'coach', ledger: { resolved: 14, hits: 11, rows: [] } }));
    expect(good).toMatchObject({ lead: 'El coach acierta.', tone: 'good', text: '11 de 14 decisiones de carga salieron bien (79 %).' });
    const bad = analysisRexLine(mk({ tab: 'coach', ledger: { resolved: 10, hits: 5, rows: [{ label: 'Bajar carga con dos sesiones con fallos', verdict: 'dudosa' }] } }));
    expect(bad).toMatchObject({ lead: 'El coach duda.', tone: 'warn' });
    expect(bad.text).toContain('Lo que menos funciona: bajar carga con dos sesiones con fallos.');
    expect(good.proposal).toBeNull();
  });
});

describe('Rex en el Análisis: crear el objetivo', () => {
  it('«Subir PR» a 8 semanas con énfasis moderado, sin tocar el perfil recibido', () => {
    const profile = makeProfile({ goals: [] });
    const next = addSubirPrGoal(profile, 'bench-press', '2026-11-05');
    expect(profile.goals).toHaveLength(0);
    expect(next.goals).toHaveLength(1);
    expect(next.goals[0]).toMatchObject({ type: 'subir-pr', movementId: 'bench-press', targetDate: '2026-12-31', emphasis: 'moderado', createdAt: '2026-11-05' });
  });

  it('los objetivos con fecha por delante cuentan como abiertos', () => {
    const goals: Goal[] = [
      { id: 'a', type: 'subir-pr', movementId: 'deadlift', targetDate: '2026-12-01', emphasis: 'moderado', createdAt: '2026-10-01' },
      { id: 'b', type: 'subir-pr', movementId: 'snatch', targetDate: '2026-10-01', emphasis: 'moderado', createdAt: '2026-08-01' },
      { id: 'c', type: 'elevar-resistencia', targetDate: '2026-12-01', emphasis: 'moderado', createdAt: '2026-10-01' },
    ];
    expect(openGoalMovements({ goals }, '2026-11-05')).toEqual(['deadlift']);
  });
});
