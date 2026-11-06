import { describe, expect, it } from 'vitest';
import { MEAL_DRAFT_KEY, takeMealDraft } from './mealDraft';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    removeItem: (k: string) => {
      delete data[k];
    },
    data,
  };
}

describe('la frase de comida que pasa del lab de Rex a Nutrición', () => {
  it('se lee una vez y se borra', () => {
    const s = fakeStorage({ [MEAL_DRAFT_KEY]: 'he comido dos huevos' });
    expect(takeMealDraft(s)).toBe('he comido dos huevos');
    expect(takeMealDraft(s)).toBeNull();
  });

  it('sin frase, vacía o sin almacenamiento, no hay nada', () => {
    expect(takeMealDraft(fakeStorage())).toBeNull();
    expect(takeMealDraft(fakeStorage({ [MEAL_DRAFT_KEY]: '   ' }))).toBeNull();
    expect(takeMealDraft(null)).toBeNull();
    expect(takeMealDraft({ getItem: () => { throw new Error('bloqueado'); }, removeItem: () => {} })).toBeNull();
  });
});
