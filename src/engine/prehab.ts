import type { PainArea, ReadinessCheck } from '../data/athlete/types';
import { SORE_ZONE_AREA, type SoreArea } from './morningCheckIn';

/**
 * Prehab en el calentamiento: si hay un aviso de molestia activo o agujetas marcadas en una zona, el calentamiento suma una
 * activación suave de esa zona (sin cargarla) antes de entrenar. Un entrenador no solo evita lo que duele: prepara la zona.
 */

export type PrehabGroup = 'rodilla' | 'hombro' | 'lumbar' | 'codo' | 'piernas';
export interface PrehabNeed {
  group: PrehabGroup;
  /** Por qué: una molestia activa (más importante) o agujetas marcadas esta mañana. */
  cause: 'molestia' | 'agujetas';
}

/** Cuántas zonas se preparan como máximo (el calentamiento no puede alargarse sin límite). */
export const PREHAB_MAX_GROUPS = 2;

export const PREHAB_GROUP_LABEL: Record<PrehabGroup, string> = {
  rodilla: 'rodilla',
  hombro: 'hombro',
  lumbar: 'zona lumbar y cadera',
  codo: 'codo y muñeca',
  piernas: 'piernas',
};

const PAIN_AREA_GROUP: Record<PainArea, PrehabGroup> = { hombro: 'hombro', 'cadera-lumbar': 'lumbar', rodilla: 'rodilla', 'codo-muneca': 'codo' };
const SORE_AREA_GROUP: Record<SoreArea, PrehabGroup> = { cuello: 'hombro', hombro: 'hombro', codo: 'codo', lumbar: 'lumbar', cadera: 'lumbar', muslo: 'piernas', gemelo: 'piernas' };

/** Etiqueta de los ejercicios de calentamiento de cada grupo en el catálogo de movimientos. */
export const prehabTag = (group: PrehabGroup) => `prehab-${group}`;

/** Las zonas a preparar hoy: primero las de molestias activas y luego las de agujetas, sin repetir y hasta `PREHAB_MAX_GROUPS`. */
export function prehabNeeds(painAreas: PainArea[], soreZones: ReadinessCheck['soreZones']): PrehabNeed[] {
  const out: PrehabNeed[] = [];
  const seen = new Set<PrehabGroup>();
  const add = (group: PrehabGroup, cause: PrehabNeed['cause']) => {
    if (seen.has(group) || out.length >= PREHAB_MAX_GROUPS) return;
    seen.add(group);
    out.push({ group, cause });
  };
  for (const area of painAreas) add(PAIN_AREA_GROUP[area], 'molestia');
  // Las agujetas fuertes antes que las leves.
  const sore = Object.entries(soreZones ?? {}).filter(([, level]) => level) as [keyof NonNullable<ReadinessCheck['soreZones']>, 1 | 2][];
  for (const [id] of [...sore].sort((a, b) => b[1] - a[1])) add(SORE_AREA_GROUP[SORE_ZONE_AREA[id]], 'agujetas');
  return out;
}

/** Lo que se le dice al atleta sobre por qué entra ese ejercicio. */
export function prehabNote(need: PrehabNeed): string {
  return need.cause === 'molestia'
    ? `Tienes un aviso de molestia en ${PREHAB_GROUP_LABEL[need.group]}: esta activación suave prepara la zona antes de entrenar. Sin dolor: si molesta, para.`
    : `Has marcado agujetas en ${PREHAB_GROUP_LABEL[need.group]}: esta activación suave suelta la zona antes de entrenar.`;
}
