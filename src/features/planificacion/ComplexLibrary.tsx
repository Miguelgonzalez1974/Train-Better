import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, EyeOff, Eye, Minus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import type { AthleteProfile, WorkSetEntry } from '../../data/athlete/types';
import {
  BUILTIN_COMPLEXES,
  COMPLEX_FAMILY_LABEL,
  COMPLEX_FOCUS_LABEL,
  complexNotation,
  type ComplexFamily,
  type ComplexFocus,
  type OlyComplex,
} from '../../data/complexes';
import { getMovementById, getMovementsByBlock } from '../../data/movements';
import { complexPreviewKg, stepCapacityKg } from '../../engine/olyComplexes';
import { Modal } from '../shell/Modal';

type Week = 1 | 2 | 3 | 4;
type FamilyFilter = 'todos' | ComplexFamily | 'mios' | 'ocultos';

const FAMILY_FILTERS: { key: FamilyFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'clean', label: 'Clean' },
  { key: 'mixto', label: 'Mixtos' },
  { key: 'mios', label: 'Míos' },
  { key: 'ocultos', label: 'Ocultos' },
];

const FOCUS_ORDER: ComplexFocus[] = ['tecnica', 'potencia', 'recepcion', 'jerk', 'fuerza'];
const nameOf = (id: string) => getMovementById(id)?.name ?? id;
const fmt = (n: number) => String(n).replace('.', ',');

/** Movimientos que se pueden encadenar: los de oly y los jerks y sentadillas que se hacen en un complejo, solo si hay marca para valorar su peso. */
const EXTRA_STEP_IDS = ['front-squat', 'push-press', 'push-jerk', 'split-jerk'];

interface LibraryProps {
  profile: AthleteProfile;
  workLog: WorkSetEntry[];
  /** Semana del bloque de hoy (para el peso orientativo). */
  week: Week;
  onSave: (next: { customComplexes: OlyComplex[]; complexPrefs: { favorites: string[]; hidden: string[] } }) => void;
  onClose: () => void;
}

/**
 * La librería de complejos de halterofilia: los de fábrica y los tuyos, con filtros, su peso orientativo y tu mejor marca en cada
 * uno. Marca favoritos (salen más), oculta los que no quieras (no salen) y crea los tuyos. Cada semana sale un complejo de clean y
 * otro de snatch, elegidos de aquí (ver `engine/olyComplexes.ts`).
 */
export function ComplexLibrary({ profile, workLog, week, onSave, onClose }: LibraryProps) {
  const [custom, setCustom] = useState<OlyComplex[]>(profile.customComplexes ?? []);
  const [favorites, setFavorites] = useState<string[]>(profile.complexPrefs?.favorites ?? []);
  const [hidden, setHidden] = useState<string[]>(profile.complexPrefs?.hidden ?? []);
  const [family, setFamily] = useState<FamilyFilter>('todos');
  const [focus, setFocus] = useState<ComplexFocus | null>(null);
  const [editing, setEditing] = useState<OlyComplex | 'new' | null>(null);

  const persist = (nextCustom: OlyComplex[], nextFav: string[], nextHidden: string[]) => {
    setCustom(nextCustom);
    setFavorites(nextFav);
    setHidden(nextHidden);
    onSave({ customComplexes: nextCustom, complexPrefs: { favorites: nextFav, hidden: nextHidden } });
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const all = useMemo(() => [...BUILTIN_COMPLEXES, ...custom], [custom]);
  const bestKg = useMemo(() => {
    const best = new Map<string, number>();
    for (const e of workLog) {
      if (!e.movementId.startsWith('complex:') || !(e.kg > 0)) continue;
      const id = e.movementId.slice('complex:'.length);
      best.set(id, Math.max(best.get(id) ?? 0, e.kg));
    }
    return best;
  }, [workLog]);

  const list = all.filter((x) => {
    const isHidden = hidden.includes(x.id);
    if (family === 'ocultos') return isHidden;
    if (isHidden) return false;
    if (family === 'mios') return Boolean(x.custom);
    if (family !== 'todos' && x.family !== family) return false;
    if (focus && !x.focus.includes(focus)) return false;
    return true;
  });
  // Favoritos primero, luego los tuyos.
  list.sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || Number(Boolean(b.custom)) - Number(Boolean(a.custom)));

  return (
    <>
      <Modal open onClose={onClose} title="Complejos">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-relaxed text-neutral-400">
              Cada semana sale un complejo de clean y otro de snatch. Marca los que más te gustan con la estrella (salen más) y oculta los que no quieras.
            </p>
            <button
              onClick={() => setEditing('new')}
              className="flex shrink-0 items-center gap-1 rounded-full bg-brand-gold px-3 py-1.5 text-xs font-bold text-black transition-colors hover:brightness-110"
            >
              <Plus size={13} strokeWidth={3} /> Crear el tuyo
            </button>
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Familia">
            {FAMILY_FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={family === f.key}
                onClick={() => setFamily(f.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${family === f.key ? 'bg-brand-gold text-black' : 'bg-white/[0.06] text-neutral-300 hover:bg-white/10'}`}
              >
                {f.label}
                {f.key === 'mios' && ` · ${custom.length}`}
                {f.key === 'ocultos' && hidden.length > 0 && ` · ${hidden.length}`}
              </button>
            ))}
          </div>
          {family !== 'ocultos' && family !== 'mios' && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Enfoque">
              {[null, ...FOCUS_ORDER].map((f) => (
                <button
                  key={f ?? 'todo'}
                  role="tab"
                  aria-selected={focus === f}
                  onClick={() => setFocus(f)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${focus === f ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200'}`}
                >
                  {f ? COMPLEX_FOCUS_LABEL[f] : 'Todo'}
                </button>
              ))}
            </div>
          )}

          <ul className="flex flex-col">
            {list.length === 0 && (
              <li className="border-t border-white/10 py-6 text-center text-sm text-neutral-500">
                {family === 'mios' ? 'Todavía no has creado ninguno. Toca «Crear el tuyo» y encadena los movimientos que quieras.' : 'No hay complejos con estos filtros.'}
              </li>
            )}
            {list.map((x) => {
              const isFav = favorites.includes(x.id);
              const isHidden = hidden.includes(x.id);
              const kg = complexPreviewKg(x, week, profile.prs, profile.variantPrs);
              const best = bestKg.get(x.id);
              return (
                <li key={x.id} className={`border-t border-white/10 py-3 ${isHidden ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-white">{x.name}</p>
                      <p className="num mt-0.5 text-base font-bold text-brand-gold">{complexNotation(x)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
                        {x.steps.map((s) => `${nameOf(s.movementId)}${s.reps > 1 ? ` ×${s.reps}` : ''}`).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {x.custom && (
                        <button onClick={() => setEditing(x)} aria-label={`Editar ${x.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white">
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => persist(custom, isFav ? favorites.filter((f) => f !== x.id) : [...favorites, x.id], hidden)}
                        aria-label={isFav ? `Quitar ${x.name} de favoritos` : `Marcar ${x.name} como favorito`}
                        aria-pressed={isFav}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 ${isFav ? 'text-brand-gold' : 'text-neutral-500'}`}
                      >
                        <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => persist(custom, isHidden ? favorites : favorites.filter((f) => f !== x.id), toggle(hidden, x.id))}
                        aria-label={isHidden ? `Volver a mostrar ${x.name}` : `Ocultar ${x.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                      >
                        {isHidden ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 font-semibold text-neutral-300">{COMPLEX_FAMILY_LABEL[x.family]}</span>
                    {x.focus.map((f) => (
                      <span key={f} className="rounded-full bg-brand-neon/10 px-2 py-0.5 font-semibold text-brand-neon">
                        {COMPLEX_FOCUS_LABEL[f]}
                      </span>
                    ))}
                    {x.custom && <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 font-semibold text-brand-gold">Tuyo</span>}
                    <span className="ml-auto flex items-center gap-2 text-neutral-400">
                      {best ? <span>mejor marca <b className="num text-white">{fmt(best)} kg</b></span> : null}
                      {kg !== null ? <span className="num font-semibold text-brand-gold">≈ {fmt(kg)} kg</span> : <span>sin peso (faltan marcas)</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-white/10 pt-3 text-[11px] leading-relaxed text-neutral-500">
            El peso orientativo es el de esta semana del bloque, sin los ajustes del día. Los kilos de un complejo se anotan aparte: no cuentan para tu 1RM estimado.
          </p>
        </div>
      </Modal>

      {editing && (
        <ComplexEditor
          initial={editing === 'new' ? null : editing}
          profile={profile}
          week={week}
          onCancel={() => setEditing(null)}
          onSave={(c) => {
            const exists = custom.some((x) => x.id === c.id);
            persist(exists ? custom.map((x) => (x.id === c.id ? c : x)) : [...custom, c], favorites, hidden);
            setEditing(null);
          }}
          onDelete={(id) => {
            persist(custom.filter((x) => x.id !== id), favorites.filter((f) => f !== id), hidden.filter((h) => h !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ComplexEditor({
  initial,
  profile,
  week,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: OlyComplex | null;
  profile: AthleteProfile;
  week: Week;
  onSave: (c: OlyComplex) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [family, setFamily] = useState<ComplexFamily>(initial?.family ?? 'clean');
  const [focus, setFocus] = useState<ComplexFocus[]>(initial?.focus ?? ['tecnica']);
  const [steps, setSteps] = useState<{ movementId: string; reps: number }[]>(initial?.steps ?? [{ movementId: 'hang-clean', reps: 1 }, { movementId: 'split-jerk', reps: 1 }]);
  const [adjust, setAdjust] = useState(Math.round((initial?.loadAdjust ?? 1) * 100));

  // Movimientos que se pueden elegir: los de oly y los jerks y sentadillas de un complejo, siempre que haya marca para valorar su peso.
  const options = useMemo(() => {
    const ids = [...getMovementsByBlock('oly').map((m) => m.id), ...EXTRA_STEP_IDS];
    return [...new Set(ids)]
      .filter((id) => stepCapacityKg(id, profile.prs, profile.variantPrs) !== null)
      .map((id) => ({ id, name: nameOf(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [profile.prs, profile.variantPrs]);

  const autoName = steps.map((s) => nameOf(s.movementId)).join(' + ');
  const draft: OlyComplex = {
    id: initial?.id ?? `custom-${Date.now().toString(36)}`,
    name: name.trim() || autoName,
    family,
    focus: focus.length > 0 ? focus : ['tecnica'],
    steps,
    custom: true,
    loadAdjust: adjust / 100,
  };
  const kg = steps.length >= 2 ? complexPreviewKg(draft, week, profile.prs, profile.variantPrs) : null;
  const valid = steps.length >= 2 && steps.every((s) => s.reps >= 1);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  return (
    <Modal open onClose={onCancel} title={initial ? 'Editar complejo' : 'Nuevo complejo'}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-neutral-400">
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={autoName || 'Mi complejo'}
            maxLength={60}
            className="rounded-lg border border-brand-border bg-transparent px-3 py-2 text-sm font-medium text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
          />
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-400">Familia (en qué día de la semana puede salir)</p>
          <div className="flex gap-1.5">
            {(['snatch', 'clean', 'mixto'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFamily(f)}
                aria-pressed={family === f}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${family === f ? 'bg-brand-gold text-black' : 'bg-white/[0.06] text-neutral-300'}`}
              >
                {COMPLEX_FAMILY_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-400">Pasos (sin soltar la barra)</p>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">{i + 1}</span>
                <select
                  value={s.movementId}
                  onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, movementId: e.target.value } : x)))}
                  aria-label={`Movimiento del paso ${i + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-surface px-2 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
                >
                  {!options.some((o) => o.id === s.movementId) && <option value={s.movementId}>{nameOf(s.movementId)}</option>}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setSteps(steps.map((x, k) => (k === i ? { ...x, reps: Math.max(1, x.reps - 1) } : x)))} aria-label="Menos repeticiones" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <span className="num w-6 text-center text-sm font-bold text-brand-gold">×{s.reps}</span>
                  <button onClick={() => setSteps(steps.map((x, k) => (k === i ? { ...x, reps: Math.min(5, x.reps + 1) } : x)))} aria-label="Más repeticiones" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
                <div className="flex shrink-0 flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir paso" className="text-neutral-400 disabled:opacity-20">
                    <ArrowUp size={13} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Bajar paso" className="text-neutral-400 disabled:opacity-20">
                    <ArrowDown size={13} />
                  </button>
                </div>
                <button onClick={() => setSteps(steps.filter((_, k) => k !== i))} disabled={steps.length <= 2} aria-label="Quitar paso" className="shrink-0 text-neutral-500 hover:text-red-400 disabled:opacity-20">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
          {steps.length < 5 && (
            <button
              onClick={() => setSteps([...steps, { movementId: options[0]?.id ?? 'clean', reps: 1 }])}
              className="mt-2 w-full rounded-lg border border-dashed border-brand-border py-2 text-xs font-semibold text-neutral-400 hover:border-brand-gold hover:text-brand-gold"
            >
              + Añadir paso
            </button>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-400">Enfoque (qué semanas del bloque lo prefieren)</p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_ORDER.map((f) => (
              <button
                key={f}
                onClick={() => setFocus(focus.includes(f) ? focus.filter((x) => x !== f) : [...focus, f])}
                aria-pressed={focus.includes(f)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${focus.includes(f) ? 'bg-brand-neon/20 text-brand-neon' : 'bg-white/[0.05] text-neutral-400'}`}
              >
                {COMPLEX_FOCUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 pt-3">
          <p className="num text-xl font-extrabold text-brand-gold">{complexNotation({ steps })}</p>
          <p className="mt-0.5 text-xs text-neutral-300">{autoName}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-400">
              {kg !== null ? (
                <>
                  Peso de esta semana: <b className="num text-white">≈ {fmt(kg)} kg</b> <span className="text-neutral-500">(lo marca el paso más flojo)</span>
                </>
              ) : (
                'Elige al menos dos pasos para ver el peso.'
              )}
            </p>
            <div className="flex shrink-0 items-center gap-1" aria-label="Ajuste de carga">
              <button onClick={() => setAdjust(Math.max(70, adjust - 5))} aria-label="Bajar el peso un 5 %" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="num w-12 text-center text-xs font-bold text-white">{adjust} %</span>
              <button onClick={() => setAdjust(Math.min(130, adjust + 5))} aria-label="Subir el peso un 5 %" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {initial && (
            <button onClick={() => onDelete(initial.id)} className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-400/10">
              <Trash2 size={14} /> Borrar
            </button>
          )}
          <button
            onClick={() => valid && onSave(draft)}
            disabled={!valid}
            className="ml-auto rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-black transition-colors hover:brightness-110 disabled:opacity-40"
          >
            Guardar en mi librería
          </button>
        </div>
      </div>
    </Modal>
  );
}
