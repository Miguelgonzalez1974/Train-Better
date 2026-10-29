/**
 * Informe de cobertura del catálogo de WODs reales (PushJerk, Mayhem, CompTrain, Invictus, clásicos).
 * Uso: `npm run wods:report`. Solo lee: no cambia nada del coach. Ver `src/engine/wodCatalog.ts` y, para el perfil de esfuerzo\n * (duración esperada, energía, esfuerzo y carga mecánica de cada WOD), `src/engine/wodProfile.ts`.
 */
import { DURATION_BUCKETS, WOD_SOURCES, getWodCatalog, summarizeCatalog, volumeEstimateAccuracy } from '../src/engine/wodCatalog';
import { ENERGY_LABEL, durationModelAccuracy, getWodProfile } from '../src/engine/wodProfile';

const catalog = getWodCatalog();
const c = summarizeCatalog(catalog);
const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)} %`);
const pad = (s: string | number, n: number) => String(s).padStart(n);

console.log('\nCATÁLOGO DE WODs REALES');
console.log(`Total: ${c.total} · programables: ${c.usable} (${pct(c.usable, c.total)}) · con duración declarada por la fuente: ${c.declaredDuration} (${pct(c.declaredDuration, c.usable)})`);

console.log('\nPor fuente');
for (const s of WOD_SOURCES) console.log(`  ${s.padEnd(10)} ${pad(c.bySource[s].usable, 5)} / ${pad(c.bySource[s].total, 5)}  (${pct(c.bySource[s].usable, c.bySource[s].total)})`);

console.log('\nPor qué se excluyen (un WOD puede tener varios motivos)');
for (const [k, v] of Object.entries(c.exclusions)) console.log(`  ${k.padEnd(26)} ${pad(v, 5)}`);

console.log('\nProgramables por sistema energético x dominio que manda (lo que necesita el planificador)');
console.log(`  ${'sistema'.padEnd(14)} ${pad('barra', 8)} ${pad('gimnást.', 8)} ${pad('cardio', 8)}`);
for (const [energy, row] of Object.entries(c.energyByDomain)) {
  console.log(`  ${energy.padEnd(14)} ${pad(row.weighted, 8)} ${pad(row.gymnastics, 8)} ${pad(row.monostructural, 8)}`);
}

console.log('\nDuración (min) de los programables');
for (const b of DURATION_BUCKETS) console.log(`  ${b.padEnd(8)} ${pad(c.durationBuckets[b], 5)}`);

const acc = volumeEstimateAccuracy();
console.log(`\nLigeros (≤15 min, sin barra con carga ni gimnásticos exigentes): ${c.light}`);
console.log(`Estimación de duración por volumen frente a la declarada (n=${acc.n}): mediana ${acc.medianRatio.toFixed(2)}x · dentro de ±30 %: ${Math.round(acc.within30 * 100)} %`);

console.log('\nProgramables que quedan con una molestia activa');
for (const [area, n] of Object.entries(c.painSurvivors)) console.log(`  ${area.padEnd(14)} ${pad(n, 5)}  (${pct(n, c.usable)})`);

console.log(`\nPosibles duplicados biblioteca/benchmark: ${c.possibleDuplicates}`);
console.log('\nElementos de texto libre que más WODs dejan fuera');
for (const [name, n] of c.topUnresolved) console.log(`  ${String(n).padStart(3)}  ${name}`);
console.log('');

// ---------------------------------------------------------------------------------------------
// Perfil de esfuerzo (fases A y B): duración esperada, energía, esfuerzo y carga mecánica de cada WOD
// ---------------------------------------------------------------------------------------------
const usable = catalog.filter((w) => w.usable);
const profiles = usable.map((w) => ({ w, p: getWodProfile(w.id)! }));
const tally = <T extends string>(xs: T[]): [T, number][] => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())].sort((a, b) => b[1] - a[1]);
const line = (rows: [string, number][], total: number) => rows.map(([k, n]) => `${k} ${n} (${pct(n, total)})`).join(' · ');

console.log('\n\nPERFIL DE ESFUERZO DE LOS WODs PROGRAMABLES (fases A y B: solo datos, el coach aún no lo usa)');
const newAcc = durationModelAccuracy();
console.log(`\nDuración "for time" frente a la declarada por la fuente (n=${newAcc.n}, mismos WODs que la medida antigua)`);
console.log(`  estimación antigua por volumen : mediana ${acc.medianRatio.toFixed(2)}x · dentro de ±30 %: ${Math.round(acc.within30 * 100)} %`);
console.log(`  modelo por movimiento (nuevo)   : mediana ${newAcc.medianRatio.toFixed(2)}x · dentro de ±30 %: ${Math.round(newAcc.within30 * 100)} %`);
console.log(`\nDe dónde sale la duración : ${line(tally(profiles.map(({ p }) => p.durationSource)), profiles.length)}`);
console.log(`Confianza del perfil      : ${line(tally(profiles.map(({ p }) => p.confidence)), profiles.length)}`);
console.log(`Estructura leída          : ${line(tally(profiles.map(({ p }) => p.structure)), profiles.length)}`);
console.log(`\nSistema energético ANTES (solo duración): ${line(tally(profiles.map(({ w }) => w.energy ?? 'sin-dato')), profiles.length)}`);
console.log(`Sistema energético AHORA                : ${line(tally(profiles.map(({ p }) => (p.energy ? ENERGY_LABEL[p.energy] : 'sin-dato'))), profiles.length)}`);
console.log(`Carga mecánica            : ${line(tally(profiles.map(({ p }) => p.load.label)), profiles.length)}`);
const strains = profiles.map(({ p }) => p.strain).filter((s): s is number => s !== null).sort((a, b) => a - b);
const q = (f: number) => strains[Math.min(strains.length - 1, Math.floor(strains.length * f))];
console.log(`Esfuerzo del WOD (0-100)  : p10 ${q(0.1)} · mediana ${q(0.5)} · p90 ${q(0.9)}  (la escala de la app: RPE x minutos)`);

const REFERENCE = ['fran', 'grace', 'isabel', 'diane', 'elizabeth', 'jackie', 'annie', 'helen', 'karen', 'cindy', 'angie', 'nancy', 'dt', 'jack', 'jason', 'michael', 'roy', 'daniel', 'badger', 'kelly', 'barbara', 'linda', 'christine', 'poncho', 'the-chief', 'fight-gone-bad', 'bear-complex', 'zachary-tellier', 'murph', 'glen', 'chelsea', 'mikkos-triangle', 'open-26-2'];
console.log('\nWODs de referencia (para revisar con tu criterio: ¿cuadran duración, energía y carga?)');
console.log(`  ${'WOD'.padEnd(17)} ${pad('min', 4)}  ${'fuente'.padEnd(9)} ${'conf.'.padEnd(5)} ${'energía'.padEnd(11)} ${pad('RPE', 4)} ${pad('esf.', 4)}  carga (puntos · barra kg · impacto · agarre · hombro · técnica)`);
for (const id of REFERENCE) {
  const p = getWodProfile(`bm:${id}`);
  if (!p) continue;
  const l = p.load;
  console.log(`  ${id.padEnd(17)} ${pad(p.expectedMin ?? '—', 4)}  ${p.durationSource.padEnd(9)} ${p.confidence.padEnd(5)} ${(p.energy ? ENERGY_LABEL[p.energy] : '—').padEnd(11)} ${pad(p.expectedRpe ?? '—', 4)} ${pad(p.strain ?? '—', 4)}  ${pad(l.score, 3)} ${l.label.padEnd(8)} ${pad(l.tonnageKg, 6)} ${pad(l.impact, 4)} ${pad(l.grip, 4)} ${pad(l.overhead, 4)}  T${l.skill}`);
}console.log('');
