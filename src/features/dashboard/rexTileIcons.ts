import { Activity, Apple, CalendarClock, CalendarDays, ClipboardCheck, Flag, Flame, Frown, Gauge, HeartPulse, HelpCircle, NotebookPen, Plane, Play, Radar, Scale, ScanBarcode, Shuffle, Target, Timer, Trophy, Utensils, type LucideIcon } from 'lucide-react';

/** Los iconos de las teselas globales de la biblioteca (ver `rexTiles.ts`), por su clave. */
export const TILE_ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  shuffle: Shuffle,
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  'heart-pulse': HeartPulse,
  frown: Frown,
  plane: Plane,
  'clipboard-check': ClipboardCheck,
  activity: Activity,
  gauge: Gauge,
  trophy: Trophy,
  flame: Flame,
  'help-circle': HelpCircle,
  apple: Apple,
  scale: Scale,
  utensils: Utensils,
  target: Target,
  radar: Radar,
  flag: Flag,
  play: Play,
  'scan-barcode': ScanBarcode,
  'notebook-pen': NotebookPen,
};
