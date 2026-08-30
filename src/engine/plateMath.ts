/**
 * Calculadora de discos: dado el peso objetivo y la barra, que discos poner POR LADO. Juego estandar
 * de gimnasio de CrossFit (kg). Puro, sin estado — se prueba solo.
 */

export interface PlatePair {
  /** Peso de un disco, en kg. */
  kg: number;
  /** Cuantos de ese disco POR LADO. */
  count: number;
}

export interface BarLoad {
  targetKg: number;
  barKg: number;
  /** Peso realmente montable con el juego estandar (objetivo menos el sobrante que no cuadra). */
  achievableKg: number;
  /** objetivo - montable (0 si cuadra exacto; puede ser negativo si redondea por arriba, no pasa con el greedy). */
  leftoverKg: number;
  /** Discos por lado, de mayor a menor. */
  perSide: PlatePair[];
  /** El objetivo es menor que la barra vacia. */
  belowBar: boolean;
}

/** Discos habituales en un box (kg), de mayor a menor. */
export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Barras habituales (kg): 20 hombres / 15 mujeres. */
export const BAR_OPTIONS_KG = [20, 15];

export function computeBarLoad(targetKg: number, barKg = 20, plates: number[] = STANDARD_PLATES_KG): BarLoad {
  if (!Number.isFinite(targetKg) || targetKg <= barKg) {
    return {
      targetKg,
      barKg,
      achievableKg: barKg,
      leftoverKg: 0,
      perSide: [],
      belowBar: Number.isFinite(targetKg) && targetKg < barKg,
    };
  }

  let perSideKg = (targetKg - barKg) / 2;
  const perSide: PlatePair[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    let count = 0;
    while (perSideKg + 1e-9 >= p) {
      perSideKg -= p;
      count += 1;
    }
    if (count > 0) perSide.push({ kg: p, count });
  }

  const loadedPerSide = perSide.reduce((sum, x) => sum + x.kg * x.count, 0);
  const achievableKg = Math.round((barKg + loadedPerSide * 2) * 100) / 100;
  return {
    targetKg,
    barKg,
    achievableKg,
    leftoverKg: Math.round((targetKg - achievableKg) * 100) / 100,
    perSide,
    belowBar: false,
  };
}

/** Texto compacto tipo "20 + 15 + 2.5 / lado" para una fila. */
export function formatPerSide(load: BarLoad): string {
  if (load.belowBar) return 'menos que la barra';
  if (load.perSide.length === 0) return 'solo barra';
  return (
    load.perSide.flatMap((p) => Array.from({ length: p.count }, () => p.kg)).join(' + ') + ' / lado'
  );
}
