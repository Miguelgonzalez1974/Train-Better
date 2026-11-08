import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { AthleteProfile } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { applySeasonSetup, backupBeforeSeason, buildSeasonSetup, describeRemovals, restoreSeasonBackup, type SeasonBackup } from '../../engine/seasonSetup';
import { isCompanionProgram } from '../../engine/strengthCompanion';
import { formatIsoDateShort } from '../../lib/dateFormat';
import { Modal } from '../shell/Modal';

const BACKUP_KEY = 'tb-season-backup';
const HIDDEN_KEY = 'tb-season-card-hidden';

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * «Nueva temporada»: monta de una vez, tras terminar una competición, un macro continuo hasta junio en tres bloques (con sus fases) y un
 * programa de fuerza que convive con él. Enseña lo que se va a quitar y lo que se va a crear, guarda copia de lo anterior y se puede
 * deshacer. La lógica está en `engine/seasonSetup.ts`; aquí solo se enseña y se aplica.
 */
export function SeasonSetupCard({ profile, onApply }: { profile: AthleteProfile; onApply: (next: AthleteProfile) => void }) {
  const todayIso = toLocalIsoDate(new Date());
  const setup = useMemo(() => buildSeasonSetup(todayIso), [todayIso]);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => readJson<boolean>(HIDDEN_KEY) === true);
  const [backup, setBackup] = useState<SeasonBackup | null>(() => readJson<SeasonBackup>(BACKUP_KEY));
  const applied = (profile.strengthPrograms ?? []).some(isCompanionProgram) && backup !== null;

  if (!setup) return null;
  if (hidden && !applied) return null;

  function apply() {
    if (!setup) return;
    const saved = backupBeforeSeason(profile, new Date().toISOString());
    try {
      window.localStorage.setItem(BACKUP_KEY, JSON.stringify(saved));
    } catch {
      /* sin almacenamiento: se aplica igual, pero sin copia */
    }
    setBackup(saved);
    onApply(applySeasonSetup(profile, setup, todayIso));
    setOpen(false);
  }

  function undo() {
    if (!backup || !window.confirm('¿Volver a tus macros, objetivos y programas de antes?')) return;
    onApply(restoreSeasonBackup(profile, backup));
    try {
      window.localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* nada que borrar */
    }
    setBackup(null);
  }

  function hide() {
    try {
      window.localStorage.setItem(HIDDEN_KEY, 'true');
    } catch {
      /* se vuelve a ver */
    }
    setHidden(true);
  }

  const removals = describeRemovals(profile);

  if (applied) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs text-neutral-400" aria-label="Temporada aplicada">
        <span className="flex items-center gap-2">
          <CalendarRange size={15} aria-hidden="true" className="shrink-0 text-good" />
          Temporada hasta junio aplicada.
        </span>
        <button onClick={undo} className="shrink-0 rounded-full border border-brand-border px-3 py-1 font-semibold text-neutral-200 hover:bg-white/5">
          Deshacer
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border border-brand-neon/30 bg-brand-neon/[0.06] p-3.5" aria-label="Nueva temporada">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarRange size={16} aria-hidden="true" className="text-brand-neon" />
          Nueva temporada hasta junio
        </p>
        <p className="text-xs leading-relaxed text-neutral-400">
          Un macro continuo en tres bloques y un programa de fuerza que convive con él, desde el {formatIsoDateShort(setup.startDate)} hasta el {formatIsoDateShort(setup.endDate)}.
          Antes de aplicar te enseño lo que se quita y lo que se crea.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setOpen(true)} className="rounded-md bg-brand-neon px-3 py-1.5 text-xs font-semibold text-brand-bg hover:bg-brand-neon-soft">
            Revisar y aplicar
          </button>
          <button onClick={hide} className="rounded-md border border-brand-border px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5">
            Ahora no
          </button>
        </div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva temporada">
        <div className="flex flex-col gap-4 text-sm text-neutral-300">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Se quita</p>
            {removals.macrocycles.length + removals.programs.length + removals.goals === 0 ? (
              <p className="text-neutral-500">Nada: no tienes macros, objetivos ni programas.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-neutral-400">
                {removals.macrocycles.map((m) => (
                  <li key={m}>Macro · {m}</li>
                ))}
                {removals.goals > 0 && <li>{removals.goals === 1 ? '1 objetivo' : `${removals.goals} objetivos`}</li>}
                {removals.programs.map((p) => (
                  <li key={p}>Programa · {p}</li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-neutral-500">Guardo una copia: si no te convence, «Deshacer» lo deja como estaba.</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Macro · {setup.totalWeeks} semanas</p>
            <ul className="flex flex-col gap-2">
              {setup.macrocycles.map((m) => (
                <li key={m.id} className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="font-semibold text-white">{m.label}</p>
                  <p className="text-xs text-neutral-500">
                    {formatIsoDateShort(m.startDate)} → {formatIsoDateShort(m.endDate)} · acumulación {m.phaseWeeks?.[0]}, intensificación {m.phaseWeeks?.[1]}, pico {m.phaseWeeks?.[2]}, descarga{' '}
                    {m.phaseWeeks?.[3]}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-neutral-500">
              Vuelta tras la competición: la primera semana, la carga de fuerza, oly y WOD va reducida y sube sola.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Programa de fuerza · convive con el macro</p>
            <div className="rounded-lg bg-white/[0.04] px-3 py-2">
              <p className="font-semibold text-white">Bloque de Temporada · 24 sesiones</p>
              <p className="text-xs text-neutral-500">
                Lunes, miércoles y viernes desde el {formatIsoDateShort(setup.program.startDate)}: test de apertura, cinco semanas de olas, descarga y retest. Press banca, sentadilla y press militar.
                Cada día te lo ofrece debajo de la sesión del macro.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={apply} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black hover:bg-brand-orange-dark">
              Aplicar temporada
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
