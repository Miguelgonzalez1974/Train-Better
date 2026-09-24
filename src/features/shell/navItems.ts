import { LayoutDashboard, CalendarRange, Target, Apple, type LucideIcon } from 'lucide-react';

export type TabId = 'dashboard' | 'planificacion' | 'nutricion' | 'objetivos';

export interface NavItem {
  id: TabId;
  label: string;
  Icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'planificacion', label: 'Planificación', Icon: CalendarRange },
  { id: 'nutricion', label: 'Nutrición', Icon: Apple },
  { id: 'objetivos', label: 'Objetivos', Icon: Target },
];
