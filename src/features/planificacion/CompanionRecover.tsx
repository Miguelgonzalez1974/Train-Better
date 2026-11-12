import { useState } from 'react';
import { History } from 'lucide-react';
import type { AthleteProfile } from '../../data/athlete/types';
import { orphanCompanionEntries, recoverCompanion } from '../../engine/strengthCompanion';
import { formatIsoDateShort } from '../../lib/dateFormat';
import { pickCompanionProgram } from './CompanionCard';

const DISMISSED_KEY = 'tb-companion-recover-dismissed';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Si al rehacer la temporada el programa de fuerza (el Texas) empezó de cero, pero hay sesiones suyas hechas hace poco, se ofrece recuperarlas:
 * el programa sigue desde la siguiente a la última que hiciste, con sus marcas. Solo sale con el programa aún sin avanzar; «No» lo aparta.
 */
export function CompanionRecover({ profile, todayIso, commit }: { profile: AthleteProfile; todayIso: string; commit: (change: (p: AthleteProfile) => AthleteProfile) => void }) {
  const program = pickCompanionProgram(profile, todayIso);
  const entries = program && program.companion.cursor === 0 ? orphanCompanionEntries(profile, todayIso) : [];
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissed());
  if (!program || entries.length === 0) return null;
  const key = entries.map((e) => e.id).join(',');
  if (dismissed === key) return null;
  const n = entries.length;
  const dates = entries.map((e) => formatIsoDateShort(e.date)).join(', ');

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-3.5 py-3 text-xs text-neutral-300" aria-label="Recuperar las sesiones del programa de fuerza">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
        <History size={14} aria-hidden="true" className="text-brand-gold" />
        {n === 1 ? 'Tenías 1 sesión del programa hecha' : `Tenías ${n} sesiones del programa hechas`}
      </p>
      <p className="leading-relaxed">
        Las hiciste antes de rehacer la temporada ({dates}) y el programa ha empezado de cero. ¿Las recupero y sigues por la sesión {entries[entries.length - 1].index + 2}?
      </p>
      <div className="flex gap-2">
        <button onClick={() => commit((p) => recoverCompanion(p, program.id, todayIso))} className="rounded-lg bg-brand-orange px-3 py-1.5 font-semibold text-black hover:bg-brand-orange-dark">
          Recuperarlas
        </button>
        <button
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISSED_KEY, key);
            } catch {
              /* se vuelve a ver */
            }
            setDismissed(key);
          }}
          className="rounded-lg border border-brand-border px-3 py-1.5 text-neutral-300 hover:bg-white/5"
        >
          No
        </button>
      </div>
    </section>
  );
}
