import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import type { AcwrZone } from './loadMetrics';
import { scoreCheck } from './readiness';

/**
 * Esfuerzo del día (0-100) y el rango que el coach recomienda para hoy — la idea de "Strain" y "recovery" de Whoop con
 * lo que SÍ tenemos: RPE x duración de cada sesión (sRPE, la misma carga que usa el ACWR) y la nota de preparación.
 * Es una estimación de carga percibida, no una medida fisiológica.
 */

/** Escala: 420 de sRPE (RPE 7 x 60 min) ≈ 50; 800 ≈ 73; 1200 ≈ 86. Curva que satura, como el esfuerzo real. */
const STRAIN_SCALE = 600;

export function strainFromSrpe(srpe: number): number {
  if (!(srpe > 0)) return 0;
  return Math.round(100 * (1 - Math.exp(-srpe / STRAIN_SCALE)));
}

export function dayStrain(entry: Pick<SessionHistoryEntry, 'rpe' | 'durationMin'> | undefined): number | null {
  return entry ? strainFromSrpe(entry.rpe * entry.durationMin) : null;
}

export interface StrainRange {
  low: number;
  high: number;
}

/** Zona de carga acumulada -> cuánto se desplaza el centro del rango: con poca carga cabe más, con mucha hay que frenar. */
const ZONE_SHIFT: Record<AcwrZone, number> = { baja: 5, optima: 0, moderada: -6, alta: -14 };
const RANGE_HALF_WIDTH = 10;

/**
 * Esfuerzo recomendado para hoy: el centro sube con la preparación (80 -> ~70, 30 -> ~48) y baja si la carga acumulada
 * va alta; el rango son ±10 puntos. Sin nota de preparación se asume un día normal (centro 55).
 */
export function recommendedStrain(readiness: number | null, zone: AcwrZone | null): StrainRange {
  const base = readiness === null ? 55 : 35 + 0.45 * readiness;
  const center = Math.min(85, Math.max(28, base + (zone ? ZONE_SHIFT[zone] : 0)));
  return { low: Math.round(center - RANGE_HALF_WIDTH), high: Math.round(center + RANGE_HALF_WIDTH) };
}

export type StrainStatus = 'sin-entrenar' | 'por-debajo' | 'dentro' | 'pasado';

export function strainStatus(strain: number | null, range: StrainRange): StrainStatus {
  if (strain === null) return 'sin-entrenar';
  if (strain < range.low) return 'por-debajo';
  if (strain > range.high) return 'pasado';
  return 'dentro';
}

export interface TrendDay {
  date: string;
  /** Esfuerzo del día (0-100), o null si no entrenaste. */
  strain: number | null;
  /** Preparación según el check-in de ese día (0-100), o null si no lo hiciste. */
  recovery: number | null;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Los últimos `days` días hasta hoy (incluido), del más antiguo al más reciente, con esfuerzo y preparación de cada uno. */
export function buildTrend(history: SessionHistoryEntry[], log: ReadinessCheck[] | undefined, todayIso: string, days: number): TrendDay[] {
  const entries = new Map(history.map((h) => [h.date, h]));
  const checks = new Map((log ?? []).map((c) => [c.date, c]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(todayIso, i - (days - 1));
    const check = checks.get(date);
    return {
      date,
      strain: dayStrain(entries.get(date)),
      recovery: check ? Math.round(((scoreCheck(check) + 4) / 8) * 100) : null,
    };
  });
}
