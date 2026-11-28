import type { AthleteProfile, PrLogEntry } from './types';

/**
 * Las marcas (1RM) al sincronizar: gana el cambio MÁS RECIENTE de cada levantamiento, no el dispositivo que sincroniza. Antes ganaba siempre el
 * local, así que abrir la app en un dispositivo con marcas antiguas borraba un récord apuntado en otro.
 *
 *  - `prsAt` guarda cuándo cambió cada marca (se sella al guardar). Con sello, gana el más nuevo (también si es una baja o un borrado).
 *  - Sin sello (datos de antes), manda el registro de cambios (`prLog`): su último apunte de ese levantamiento. Así se recuperan los récords que
 *    ya se habían pisado. Una marca borrada (0) no se resucita.
 */

type PrTable = Record<string, number | undefined>;

const isoDayOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tablesOf = (p: AthleteProfile) => ({ prs: (p.prs ?? {}) as unknown as PrTable, variantPrs: (p.variantPrs ?? {}) as unknown as PrTable });
const flat = (p: AthleteProfile): PrTable => ({ ...tablesOf(p).variantPrs, ...tablesOf(p).prs });

/** Los sellos de un guardado: solo las marcas que cambian. Un sello que ya viene más nuevo (de una fusión) se respeta. */
export function stampPrChanges(prev: AthleteProfile, next: AthleteProfile, now: number = Date.now()): AthleteProfile['prsAt'] {
  const before = flat(prev);
  const after = flat(next);
  const out: Record<string, number> = { ...(prev.prsAt ?? {}), ...(next.prsAt ?? {}) };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = prev.prsAt?.[key] ?? 0;
    const brought = next.prsAt?.[key] ?? 0;
    if (before[key] === after[key]) {
      if (old || brought) out[key] = Math.max(old, brought);
    } else out[key] = brought > old ? brought : now;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Las marcas de la fusión de dos dispositivos, levantamiento a levantamiento. `log` es el registro de cambios ya unido de los dos. */
export function mergePrs(
  remote: AthleteProfile,
  local: AthleteProfile,
  log: PrLogEntry[],
  localIsFresh: boolean,
): Pick<AthleteProfile, 'prs' | 'variantPrs' | 'prsAt'> {
  // Un dispositivo recién instalado trae las marcas de fábrica: cede a lo remoto.
  if (localIsFresh) return { prs: remote.prs, variantPrs: remote.variantPrs ?? local.variantPrs, ...(remote.prsAt ? { prsAt: remote.prsAt } : {}) };

  const at: Record<string, number> = {};
  const pick = (kind: 'prs' | 'variantPrs'): PrTable => {
    const mine = tablesOf(local)[kind];
    const theirs = tablesOf(remote)[kind];
    const out: PrTable = {};
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const lv = mine[key];
      const rv = theirs[key];
      const ls = local.prsAt?.[key] ?? 0;
      const rs = remote.prsAt?.[key] ?? 0;
      const stamp = Math.max(ls, rs);
      const mineOfKey = log.filter((e) => e.key === key);
      const lastDate = mineOfKey.reduce((d, e) => (e.date > d ? e.date : d), '');
      let value = lv ?? rv;
      let sealed = stamp;
      const stampDay = stamp ? isoDayOf(stamp) : '';
      // Mismo sello y valores distintos: uno de los dos lo pisó con la versión antigua, así que desempata el registro.
      const tied = ls === rs && lv !== rv;
      if (lastDate !== '' && lv !== 0 && (lastDate > stampDay || (tied && lastDate >= stampDay))) {
        // Hay un cambio apuntado posterior a los sellos (o no hay sellos): manda ese. A igual fecha, el que ya tenga uno de los dos.
        const latest = mineOfKey.filter((e) => e.date === lastDate).map((e) => e.kg);
        value = lv !== undefined && latest.includes(lv) ? lv : rv !== undefined && latest.includes(rv) ? rv : latest[latest.length - 1];
        if (value !== lv || value !== rv) sealed = Math.max(stamp, new Date(`${lastDate}T00:00:00`).getTime());
      } else if (stamp) {
        value = rs > ls ? rv : lv;
      }
      if (value !== undefined) out[key] = value;
      if (sealed) at[key] = sealed;
    }
    return out;
  };

  const prs = pick('prs') as unknown as AthleteProfile['prs'];
  const variants = pick('variantPrs') as unknown as NonNullable<AthleteProfile['variantPrs']>;
  const hasVariants = local.variantPrs !== undefined || remote.variantPrs !== undefined;
  return { prs, variantPrs: hasVariants ? variants : undefined, ...(Object.keys(at).length > 0 ? { prsAt: at } : {}) };
}
