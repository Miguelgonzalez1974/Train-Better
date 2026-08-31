/**
 * RNG del motor de sesiones. Objetivo: que `generateSessionForDate` sea DETERMINISTA — mismo
 * perfil + misma fecha -> misma sesión, en cualquier dispositivo y en cada refresco. Antes usaba
 * `Math.random()` en ~28 puntos, así que PC y móvil (cachés locales distintas) mostraban entrenos
 * distintos para el mismo día.
 *
 * Mecánica: hay un RNG "activo" a nivel de módulo. Fuera de una generación es `Math.random`.
 * `generateSessionForDate` lo cambia por uno sembrado (mulberry32 sobre un hash de la clave) durante
 * su llamada — que es SÍNCRONA y no reentrante, así que el swap es seguro — y lo restaura al salir.
 * Todo el motor llama a `rng()` en vez de `Math.random()`.
 */

/** FNV-1a de 32 bits: string -> semilla. Debe coincidir con la copia en weekPlan.ts (planificador de microciclo). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG determinista pequeño. Debe coincidir con la copia en weekPlan.ts. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(key: string): () => number {
  return mulberry32(hashSeed(key));
}

let active: () => number = Math.random;

/** El RNG activo — `Math.random` fuera de una generación, uno sembrado durante `withSeededRng`. */
export function rng(): number {
  return active();
}

/** `Math.floor(rng() * n)` — índice aleatorio en [0, n). */
export function randInt(n: number): number {
  return Math.floor(rng() * n);
}

/** Elemento aleatorio de un array no vacío. */
export function randPick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}

/**
 * Ejecuta `fn` con el RNG del motor sembrado desde `key`, y lo restaura al terminar (incluso si
 * `fn` lanza). SÍNCRONO — no usar con funciones asíncronas.
 */
export function withSeededRng<T>(key: string, fn: () => T): T {
  const prev = active;
  active = seededRng(key);
  try {
    return fn();
  } finally {
    active = prev;
  }
}
