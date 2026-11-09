import { describe, expect, it } from 'vitest';
import type { CompanionLogEntry } from '../data/athlete/types';
import { summarizeCompanionEntry } from './companionSummary';

const names: Record<string, string> = { 'back-squat': 'Back Squat', 'bench-press': 'Bench Press' };
const nameOf = (id: string) => names[id] ?? id;
const base: CompanionLogEntry = { id: 'p|0', programId: 'p', index: 0, date: '2026-11-09', outcome: 'hecha', label: 'Back Squat + Bench Press · volumen', rpe: 7, durationMin: 40 };

describe('lo que hiciste del programa de fuerza', () => {
  it('una línea por levantamiento, con esquema y peso, y las cifras de la sesión', () => {
    const s = summarizeCompanionEntry({ ...base, lifts: [{ movementId: 'back-squat', sets: 5, reps: '5', loadKg: 130 }, { movementId: 'bench-press', sets: 5, reps: '5', loadKg: 85 }] }, nameOf);
    expect(s).toEqual({ title: 'Back Squat + Bench Press · volumen', outcome: 'hecha', lines: ['Back Squat · 5×5 · 130 kg', 'Bench Press · 5×5 · 85 kg'], stats: 'RPE 7 · 40 min' });
  });

  it('el viernes dice si salió la marca de 5 repeticiones y con qué peso', () => {
    const s = summarizeCompanionEntry(
      { ...base, lifts: [{ movementId: 'back-squat', sets: 1, reps: '5', loadKg: 147.5, attempt: true, achieved: 147.5 }, { movementId: 'bench-press', sets: 1, reps: '5', loadKg: 97.5, attempt: true }] },
      nameOf,
    );
    expect(s.lines).toEqual(['Back Squat · marca de 5 · 147,5 kg ✓', 'Bench Press · marca de 5 a 97,5 kg · no salió']);
  });

  it('una sesión saltada no lleva detalle, y una antigua (sin levantamientos) enseña el primero', () => {
    expect(summarizeCompanionEntry({ ...base, outcome: 'saltada', label: 'Press banca' }, nameOf)).toEqual({ title: 'Press banca', outcome: 'saltada', lines: [], stats: null });
    const old = summarizeCompanionEntry({ ...base, movementId: 'back-squat', loadKg: 130, rpe: undefined, durationMin: undefined }, nameOf);
    expect(old.lines).toEqual(['Back Squat · 130 kg']);
    expect(old.stats).toBeNull();
  });
});
