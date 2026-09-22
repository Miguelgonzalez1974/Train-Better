import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult } from '../../data/athlete/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { BLOCK_META, ACCENT_CLASSES } from './SessionBlockCard';
import { BLOCK_ORDER } from './DaySessionBlocks';
import { groupWodByPart } from './wodPartGroups';

interface TaskItem {
  name: string;
  why: string;
}

export interface TaskSection {
  block: Block;
  items: TaskItem[];
}

/**
 * Construye el contenido de la pestaña Task a partir de la sesión: calentamiento (el porqué de cada
 * movimiento), fuerza/oly (el levantamiento de trabajo), WOD (ritmo/objetivo), accesorio (incluido el
 * core) y skill. En fuerza/oly/WOD la nota salía SIEMPRE abierta en la tarjeta normal — eran las que
 * más scroll daban; en accesorio y skill ya salía cerrada ("ver más"), pero también se saca de ahí
 * para que "Sesión" quede solo con números y toda la explicación viva en un único sitio. Cooldown no
 * tenía nota del coach hasta ahora — usa el `cooldownWhy` fijo de cada movimiento, igual que
 * calentamiento usa `why`. Todo en el mismo orden que la sesión (`BLOCK_ORDER`). La preparación con
 * barra (Burgener) y el calentamiento por subgrupo siguen con su nota donde estaban — no se duplican.
 */
export function buildTaskSections(session: DailySession): TaskSection[] {
  const sections: TaskSection[] = [];

  for (const block of BLOCK_ORDER) {
    const entries = session.blocks.filter((e) => e.block === block);
    if (entries.length === 0) continue;

    if (block === 'warmup') {
      const items = entries
        .map((e) => getMovementById(e.movementId))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((movement) => ({ name: movement.name, why: movement.why ?? 'Prepara el cuerpo para lo que toca hoy.' }));
      if (items.length > 0) sections.push({ block, items });
      continue;
    }

    if (block === 'strength' || block === 'oly') {
      // Las entradas con `subgroup` (ej. barra Burgener) son preparación, no el levantamiento de
      // trabajo — su nota se queda donde estaba, no se saca de la tarjeta.
      const items = entries
        .filter((e): e is SessionBlockResult & { notes: string } => !e.subgroup && Boolean(e.notes))
        .map((e) => ({ name: getMovementById(e.movementId)?.name ?? e.movementId, why: e.notes }));
      if (items.length > 0) sections.push({ block, items });
      continue;
    }

    if (block === 'wod') {
      // Cada movimiento del WOD lleva la MISMA nota repetida en su propia entrada (así la ve cada
      // fila si hiciera falta) — coger todas daría la nota duplicada una vez por movimiento. Como
      // `CustomWodCard`, solo la primera entrada de cada parte. En un día de doble WOD cada parte
      // (`wodPart`) lleva la suya; en un día normal solo hay una. `benchmarkWorkouts` resuelve el
      // nombre de un WOD de referencia — los generados por el motor ya llevan su título en `title`.
      const items = groupWodByPart(entries)
        .map((g) => g.entries[0])
        .filter((e): e is SessionBlockResult & { notes: string } => Boolean(e?.notes))
        .map((e) => {
          const base = e.movementId.startsWith('benchmark:')
            ? (benchmarkWorkouts.find((w) => w.id === e.movementId.replace('benchmark:', ''))?.name ?? e.title ?? 'WOD')
            : (e.title ?? 'WOD');
          return { name: e.wodPart ? `${base} · Parte ${e.wodPart}` : base, why: e.notes };
        });
      if (items.length > 0) sections.push({ block, items });
      continue;
    }

    if (block === 'accessory') {
      // Igual que en el WOD: la nota se repite en cada movimiento del mismo superset/circuito (ej.
      // los 2 movimientos de un core en intervalo) — solo la primera entrada de cada tramo consecutivo
      // con el mismo `format`, igual que agrupa `AccessoryGroupCard`.
      const items: TaskItem[] = [];
      let lastFormat: string | undefined = undefined;
      let isFirstOfGroup = true;
      for (const e of entries) {
        isFirstOfGroup = e.format !== lastFormat;
        lastFormat = e.format;
        if (isFirstOfGroup && e.notes) {
          items.push({ name: e.format ?? getMovementById(e.movementId)?.name ?? e.movementId, why: e.notes });
        }
      }
      if (items.length > 0) sections.push({ block, items });
      continue;
    }

    if (block === 'skill') {
      const items = entries
        .filter((e): e is SessionBlockResult & { notes: string } => Boolean(e.notes))
        .map((e) => ({ name: getMovementById(e.movementId)?.name ?? e.movementId, why: e.notes }));
      if (items.length > 0) sections.push({ block, items });
      continue;
    }

    if (block === 'cooldown') {
      const items = entries
        .map((e) => getMovementById(e.movementId))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((movement) => ({ name: movement.name, why: movement.cooldownWhy ?? 'Ayuda a recuperar después del esfuerzo de hoy.' }));
      if (items.length > 0) sections.push({ block, items });
    }
  }

  return sections;
}

/**
 * Pestaña Task: una sola pantalla que baja bloque por bloque con el porqué de cada parte del entreno
 * de hoy (letra pequeña, como la nota del coach normal) — separada de "Sesión", que solo enseña los
 * números.
 */
export function SessionTaskView({ sections }: { sections: TaskSection[] }) {
  return (
    <div className="flex flex-col divide-y divide-white/5 rounded-xl bg-brand-surfaceMuted/80">
      {sections.map(({ block, items }) => {
        const { label, Icon, accent } = BLOCK_META[block];
        const accentClasses = ACCENT_CLASSES[accent];
        return (
          <div key={block} className="p-3.5">
            <p className={`mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] ${accentClasses.icon}`}>
              <Icon size={13} strokeWidth={2.5} aria-hidden />
              {label}
            </p>
            <div className="flex flex-col gap-3">
              {items.map((item, idx) => (
                <div key={idx}>
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-400">{item.why}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
