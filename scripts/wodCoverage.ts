/**
 * Informe de cobertura del catálogo de WODs reales (PushJerk, Mayhem, CompTrain, Invictus, clásicos).
 * Uso: `npm run wods:report`. Solo lee: no cambia nada del coach. Ver `src/engine/wodCatalog.ts`.
 */
import { DURATION_BUCKETS, WOD_SOURCES, getWodCatalog, summarizeCatalog, volumeEstimateAccuracy } from '../src/engine/wodCatalog';

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
