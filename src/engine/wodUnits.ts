/**
 * Unidades de los WODs de programaciones reales: las fuentes (Mayhem, CompTrain, Invictus, PushJerk…) escriben las cargas
 * Rx en libras, las alturas en pulgadas y las distancias en pies, yardas o millas. Aquí se pasan al sistema métrico
 * para mostrarlas — solo el TEXTO: los datos del catálogo no se tocan.
 *
 * Las conversiones siguen las equivalencias habituales del CrossFit (95/65 lb → 43/29 kg, 24/20 in → 60/50 cm,
 * 2/1,5 pood → 32/24 kg) y se redondean a cifras que se pueden cargar o medir.
 */

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE = `${NUM}(?:\\s*-\\s*${NUM})?`;
/** "95", "95/65", "175-245/105-155": una cifra, un par hombre/mujer o rangos. */
const PAIR = `${RANGE}(?:\\s*\\/\\s*${RANGE})?`;

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;
const FT_TO_M = 0.3048;
const YD_TO_M = 0.9144;
const MILE_TO_KM = 1.609344;
/** 1 pood = 16 kg (así se programa el kettlebell Rx: 1,5 pood = 24 kg, 2 pood = 32 kg). */
const POOD_KG = 16;

const toNumber = (s: string) => Number(s.replace(',', '.'));
const spanish = (n: number) => String(Number(n.toFixed(1))).replace('.', ',');

/** Convierte cada cifra de un grupo ("95/65", "175-245/105-155") con `f`, conservando separadores. */
function convertGroup(group: string, f: (n: number) => number): string {
  return group.replace(new RegExp(NUM, 'g'), (n) => spanish(f(toNumber(n))));
}

const kgFromLb = (lb: number) => {
  const kg = lb * LB_TO_KG;
  return kg < 8 ? Math.round(kg * 2) / 2 : Math.round(kg);
};
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const cmFromIn = (inches: number) => roundTo(inches * IN_TO_CM, 5);
const metersFromFeet = (ft: number) => {
  const m = ft * FT_TO_M;
  return m < 10 ? Math.round(m * 10) / 10 : m < 30 ? Math.round(m) : roundTo(m, 5);
};
const metersFromYards = (yd: number) => {
  const m = yd * YD_TO_M;
  return m < 30 ? Math.round(m) : roundTo(m, 5);
};
const kmFromMiles = (mi: number) => Math.round(mi * MILE_TO_KM * 10) / 10;

const RULES: { re: RegExp; convert: (n: number) => number; unit: string }[] = [
  { re: new RegExp(`(${PAIR})\\s*(?:lbs?|libras?)\\b`, 'gi'), convert: kgFromLb, unit: 'kg' },
  { re: new RegExp(`(${PAIR})\\s*pood\\b`, 'gi'), convert: (p) => p * POOD_KG, unit: 'kg' },
  // "in" también es una palabra inglesa ("3 in a row"): solo es pulgada si no va seguida de un artículo.
  { re: new RegExp(`(${PAIR})\\s*(?:inch(?:es)?|in)(?![\\w'])(?!\\s+(?:a|an|the|your|each|every)\\b)`, 'gi'), convert: cmFromIn, unit: 'cm' },
  { re: new RegExp(`(${PAIR})\\s*(?:ft|feet|pies|pie)\\b`, 'gi'), convert: metersFromFeet, unit: 'm' },
  { re: new RegExp(`(${NUM})'(?![\\w'])`, 'g'), convert: metersFromFeet, unit: 'm' },
  { re: new RegExp(`(${PAIR})\\s*(?:yards?|yardas?|yd)\\b`, 'gi'), convert: metersFromYards, unit: 'm' },
  { re: new RegExp(`(${NUM})\\s*(?:miles?|millas?)\\b`, 'gi'), convert: kmFromMiles, unit: 'km' },
];

/** El texto de un WOD con libras, pulgadas, pies, yardas y millas pasadas a kg, cm y m/km. Idempotente. */
export function localizeWodText(text: string): string {
  let out = text;
  for (const { re, convert, unit } of RULES) out = out.replace(re, (_m, group: string) => `${convertGroup(group, convert)} ${unit}`);
  return out;
}
