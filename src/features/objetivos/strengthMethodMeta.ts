import { Repeat, Repeat2, TrendingUp, Waves, Split, ListOrdered, Activity, Medal, Rocket, type LucideIcon } from 'lucide-react';
import type { StrengthMethod } from '../../data/athlete/types';

export interface StrengthMethodMeta {
  label: string;
  blurb: string;
  Icon: LucideIcon;
}

export const STRENGTH_METHOD_META: Record<StrengthMethod, StrengthMethodMeta> = {
  '531': {
    label: '5/3/1',
    blurb: 'Ondas de 4 semanas sobre tu training max — progresión lenta y sostenible.',
    Icon: Repeat,
  },
  lineal: {
    label: 'Lineal',
    blurb: 'Sube intensidad y baja volumen semana a semana — ideal si vuelves de un parón.',
    Icon: TrendingUp,
  },
  ondulante: {
    label: 'Ondulante',
    blurb: 'El mismo levantamiento varias veces por semana, cambiando el estímulo cada vez.',
    Icon: Waves,
  },
  conjugado: {
    label: 'Conjugado',
    blurb: 'Esfuerzo máximo con variante rotativa + esfuerzo dinámico a velocidad, alternando tren superior e inferior.',
    Icon: Split,
  },
  ruso: {
    label: 'Ruso / Sheiko',
    blurb: 'Frecuencia alta, volumen alto, intensidad moderada — nunca al fallo, prioriza la técnica repetida.',
    Icon: Repeat2,
  },
  texas: {
    label: 'Texas Method',
    blurb: 'Un día de volumen, uno de recuperación y uno de intensidad — busca un número nuevo cada semana.',
    Icon: ListOrdered,
  },
  juggernaut: {
    label: 'Juggernaut Invertido',
    blurb: 'Ondas de 4 semanas que suben de intensidad y bajan de volumen — 4 ondas seguidas, cada una más dura que la anterior.',
    Icon: Activity,
  },
  haltero: {
    label: 'Ciclo Halterofilia (14 semanas)',
    blurb: 'Snatch, clean & jerk, tirones y sentadilla con escalera ascendente cada día — ciclo real de competición, termina en 3 intentos de 1RM.',
    Icon: Medal,
  },
  temporada: {
    label: 'Bloque de Temporada (8 semanas)',
    blurb: 'Test real de tus levantamientos, 5 semanas de olas ascendentes, descarga y un retest idéntico al de apertura — ideal para arrancar una temporada con una comparación real de antes/después.',
    Icon: Rocket,
  },
};

export const STRENGTH_METHODS: StrengthMethod[] = ['531', 'lineal', 'ondulante', 'conjugado', 'ruso', 'texas', 'juggernaut', 'haltero', 'temporada'];

/**
 * Un color propio por metodo — de un vistazo se distingue la lista sin tener que leer el texto.
 * Deliberadamente sin ningun tono rojo/rosa: ese color esta reservado en toda la app para dolor y
 * avisos de peligro (ver PerfilRapido/WeekStrip/AcwrGauge), y aqui no hay ningun metodo "de riesgo".
 */
export const STRENGTH_METHOD_COLOR: Record<StrengthMethod, string> = {
  '531': '#d4af37',
  lineal: '#38bdf8',
  ondulante: '#22d3ee',
  conjugado: '#f472b6',
  ruso: '#a78bfa',
  texas: '#fbbf24',
  juggernaut: '#34d399',
  haltero: '#6366f1',
  temporada: '#84cc16',
};
