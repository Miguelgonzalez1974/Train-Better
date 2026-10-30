/** Lo comido en el día frente a lo que toca: proteína e hidratos, en gramos. */
export interface NutritionSummary {
  protein: { done: number; target: number };
  carbs: { done: number; target: number };
}

/** Cuánto llevas del día, de 0 a 100: la media de lo cubierto de proteína y de hidratos (cada uno con tope en su objetivo). */
export function nutritionPct(n: NutritionSummary): number {
  const cover = (x: { done: number; target: number }) => Math.min(1, x.done / Math.max(1, x.target));
  return Math.round(((cover(n.protein) + cover(n.carbs)) / 2) * 100);
}
