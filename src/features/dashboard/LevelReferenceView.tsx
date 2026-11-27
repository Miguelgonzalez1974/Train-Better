import { useMemo, useState } from 'react';
import type { AthleteProfile, LevelTest, LevelTestKey, SessionHistoryEntry } from '../../data/athlete/types';
import {
  computeReferenceLevel,
  MIN_FOR_OVERALL,
  TEST_LABEL,
  TEST_RANGE,
  testDateText,
  testResults,
  timeText,
  ZONES,
  type Placement,
  type RefCategory,
  type RefTag,
} from '../../engine/levelReference';
import { toast } from '../../lib/toast';

/**
 * «Tu nivel» frente a gente de tu edad y tu peso (ver `engine/levelReference.ts`): un escalón por categoría, lo que te falta para el siguiente y de
 * dónde sale cada comparación. Aquí también se apuntan el año de nacimiento y los tests de tiempo.
 */
interface LevelReferenceViewProps {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  todayIso: string;
  onSaveProfile: (patch: Partial<AthleteProfile>) => void;
  onOpenMarks: () => void;
  onOpenBody: () => void;
}

const input = 'w-full min-w-0 rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none';
const primary = 'shrink-0 rounded-full bg-brand-orange px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'shrink-0 rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white';

const TAG_STYLE: Record<RefTag, string> = {
  medido: 'bg-good/15 text-good',
  orientativo: 'bg-warn/15 text-warn',
  'solo contra ti': 'bg-white/10 text-neutral-400',
};

/** Cinco tramos, el tuyo encendido y una marca en el punto exacto. `hollow`: el escalón sale de un escalado (tramo sin rellenar y marca hueca). */
function ZoneBar({ placement, labels = false, hollow = false }: { placement: Placement; labels?: boolean; hollow?: boolean }) {
  return (
    <div>
      <div className="relative py-1" role="img" aria-label={`Escalón ${placement.zone + 1} de ${ZONES.length}: ${ZONES[placement.zone]}`}>
        <div className="grid grid-cols-5 gap-[3px]">
          {ZONES.map((z, i) => (
            <span key={z} className={`h-1.5 rounded-full ${i < placement.zone ? 'bg-brand-orange/40' : i === placement.zone ? (hollow ? 'border border-brand-orange' : 'bg-brand-orange') : 'bg-white/10'}`} />
          ))}
        </div>
        <span
          className={`absolute -translate-x-1/2 rounded-full ${hollow ? 'top-[2px] h-2.5 w-2.5 border-2 border-white bg-brand-surface' : 'top-0 h-3.5 w-[3px] bg-white'}`}
          style={{ left: `${placement.position * 100}%` }}
          data-testid="zone-marker"
        />
      </div>
      {labels && (
        <div className="grid grid-cols-5 gap-[3px]" aria-hidden="true">
          {ZONES.map((z, i) => (
            <span key={z} className={`min-w-0 whitespace-nowrap text-[10px] tracking-tight ${i === 0 ? 'text-left' : 'text-center'} ${i === placement.zone ? 'font-semibold text-white' : 'text-neutral-500'}`}>
              {z}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pide (o corrige) el año de nacimiento. */
function BirthYearForm({ current, thisYear, onSave, onCancel }: { current: number | undefined; thisYear: number; onSave: (year: number) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState(current ? String(current) : '');
  const year = Number(draft);
  const valid = Number.isInteger(year) && year >= thisYear - 90 && year <= thisYear - 14;
  return (
    <section className="rounded-2xl bg-white/[0.04] p-4" aria-label="Tu año de nacimiento" data-testid="birth-year-form">
      <p className="text-[13px] font-semibold text-white">¿En qué año naciste?</p>
      <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">Lo necesito para compararte con gente de tu edad. Las tablas que uso son de hombres.</p>
      <form
        className="mt-2.5 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(year);
        }}
      >
        <input type="text" inputMode="numeric" maxLength={4} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} placeholder="Año (4 cifras)" aria-label="Año de nacimiento" className={input} />
        <button type="submit" disabled={!valid} className={primary}>
          Guardar
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 px-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
            No
          </button>
        )}
      </form>
    </section>
  );
}

/** Apuntar un test (minutos y segundos, con su fecha) y ver o quitar los apuntados a mano. */
function TestEntry({ testKey, profile, history, todayIso, onSaveProfile }: { testKey: LevelTestKey } & Pick<LevelReferenceViewProps, 'profile' | 'history' | 'todayIso' | 'onSaveProfile'>) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const [date, setDate] = useState(todayIso);
  const seconds = Number(min) * 60 + Number(sec || 0);
  const [lo, hi] = TEST_RANGE[testKey];
  const typed = min !== '';
  const valid = typed && Number(sec || 0) < 60 && seconds >= lo && seconds <= hi && date !== '' && date <= todayIso;
  const manual = testResults(profile, history, testKey)
    .filter((r) => r.manual)
    .slice(0, 3);
  const all = profile.levelTests ?? [];

  function save() {
    const entry: LevelTest = { date, key: testKey, seconds };
    onSaveProfile({ levelTests: [...all.filter((t) => !(t.key === testKey && t.date === date)), entry] });
    toast.show(`${TEST_LABEL[testKey]}: ${timeText(seconds)} apuntado`);
    setOpen(false);
    setMin('');
    setSec('');
  }

  function remove(removedDate: string) {
    onSaveProfile({ levelTests: all.filter((t) => !(t.key === testKey && t.date === removedDate)) });
    toast.show('Test quitado', { action: { label: 'Deshacer', run: () => onSaveProfile({ levelTests: all }) } });
  }

  return (
    <div className="mt-2.5">
      {manual.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {manual.map((r) => (
            <li key={r.date} className="flex items-center justify-between gap-2 text-[11px] text-neutral-500" data-testid="level-test-row">
              <span>
                Apuntado: <span className="num text-neutral-300">{timeText(r.seconds)}</span> · {testDateText(r.date)}
              </span>
              <button type="button" onClick={() => remove(r.date)} className="shrink-0 px-1 py-0.5 font-medium text-neutral-500 hover:text-neutral-200">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={secondary}>
          Apuntar {TEST_LABEL[testKey]}
        </button>
      ) : (
        <form
          className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <input type="text" inputMode="numeric" maxLength={3} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} placeholder="Min" aria-label="Minutos" className={input} />
            <input type="text" inputMode="numeric" maxLength={2} value={sec} onChange={(e) => setSec(e.target.value.replace(/\D/g, ''))} placeholder="Seg" aria-label="Segundos" className={input} />
            <input type="date" value={date} max={todayIso} onChange={(e) => setDate(e.target.value)} aria-label="Fecha del test" className={`${input} col-span-2`} />
          </div>
          {typed && !valid && (
            <p className="text-[11px] text-warn">
              Revisa el tiempo: tiene que estar entre {timeText(lo)} y {timeText(hi)}.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={!valid} className={primary}>
              Guardar
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CategoryCard({ category, ...props }: { category: RefCategory } & LevelReferenceViewProps) {
  const { label, tag, placement, marks, against, missing, warning, test } = category;
  // Con un solo dato, la barra de la categoría ya es la suya: no se repite debajo.
  const single = marks.length === 1;
  return (
    <section className="rounded-2xl bg-white/[0.03] p-4" aria-label={label} data-testid="ref-category" data-key={category.key}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2">
          <span className="text-[13px] font-semibold text-white">{label}</span>
          <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${category.scaled ? TAG_STYLE.orientativo : TAG_STYLE[tag]}`}>{category.scaled ? 'escalado, con tope' : tag}</span>
        </p>
        {placement && (
          <span className="shrink-0 text-[13px] font-bold text-white" data-testid="ref-zone">
            {ZONES[placement.zone]}
          </span>
        )}
      </div>
      {placement && (
        <div className="mt-2">
          <ZoneBar placement={placement} hollow={category.scaled} />
        </div>
      )}
      {marks.length > 0 && (
        <ul className="mt-1.5 divide-y divide-white/[0.06]">
          {marks.map((m) => (
            <li key={m.key} className="py-2" data-testid="ref-mark" data-key={m.key}>
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-neutral-200">{m.label}</span>
                <span className="num text-[15px] font-bold text-white">{m.value}</span>
              </p>
              {m.placement && !single && (
                <p className="mt-0.5 text-[11px] text-neutral-300">
                  {ZONES[m.placement.zone]}
                  {m.next ? ` · ${m.next}` : ''}
                </p>
              )}
              {single && m.next && <p className="mt-0.5 text-[11px] text-neutral-300">Estás {m.next}</p>}
              {m.detail && <p className="mt-0.5 text-[11px] text-neutral-500">{m.detail}</p>}
              {m.notes?.map((n) => (
                <p key={n} className="mt-0.5 text-[11px] leading-snug text-neutral-300">
                  {n}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {warning && (
        <div className="mt-1.5 flex items-start justify-between gap-2 rounded-xl bg-warn/10 p-2.5" data-testid="ref-warning">
          <p className="text-[11px] leading-snug text-warn">{warning}</p>
          <button type="button" onClick={props.onOpenMarks} className={secondary}>
            Revisar
          </button>
        </div>
      )}
      {missing && <p className="mt-2 text-xs text-neutral-400">{missing}</p>}
      {against && <p className="mt-2 text-[11px] leading-snug text-neutral-500">{against}</p>}
      {test && <TestEntry testKey={test} profile={props.profile} history={props.history} todayIso={props.todayIso} onSaveProfile={props.onSaveProfile} />}
    </section>
  );
}

export function LevelReferenceView(props: LevelReferenceViewProps) {
  const { profile, history, todayIso, onSaveProfile, onOpenBody } = props;
  const [editingAge, setEditingAge] = useState(false);
  const level = useMemo(() => computeReferenceLevel({ profile, history, today: new Date(`${todayIso}T12:00:00`) }), [profile, history, todayIso]);
  const thisYear = Number(todayIso.slice(0, 4));
  const needed = MIN_FOR_OVERALL - level.measured;
  const pending = level.categories.filter((c) => !c.placement && c.tag !== 'solo contra ti').map((c) => (c.test ? TEST_LABEL[c.test] : c.label));

  return (
    <div className="flex flex-col gap-3" data-testid="level-reference">
      {level.age === null || editingAge ? (
        <BirthYearForm
          current={profile.birthYear}
          thisYear={thisYear}
          onSave={(birthYear) => {
            onSaveProfile({ birthYear });
            setEditingAge(false);
          }}
          onCancel={level.age === null ? undefined : () => setEditingAge(false)}
        />
      ) : (
        <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-xs text-neutral-400" data-testid="ref-header">
          <span>
            {level.age} años{level.bodyweightKg !== null ? ` · ${String(level.bodyweightKg).replace('.', ',')} kg` : ''} · {level.measured} de {level.measurable} categorías medidas
          </span>
          <button type="button" onClick={() => setEditingAge(true)} aria-label="Cambiar el año de nacimiento" className="font-semibold text-neutral-300 underline underline-offset-2 hover:text-white">
            Cambiar
          </button>
        </p>
      )}

      {level.bodyweightKg === null && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] p-4">
          <p className="text-xs leading-relaxed text-neutral-400">Sin tu peso no puedo comparar tus kilos.</p>
          <button type="button" onClick={onOpenBody} className={primary}>
            Apuntar peso
          </button>
        </div>
      )}

      {level.age !== null && (
        <section className="rounded-2xl bg-white/[0.06] p-4" aria-label="Tu nivel global" data-testid="ref-overall">
          {level.overall ? (
            <>
              <p className="text-[11px] text-neutral-400">Tu nivel, de media en {level.measured} categorías</p>
              <p className="mb-2 mt-0.5 text-2xl font-semibold leading-tight text-white">{ZONES[level.overall.zone]}</p>
              <ZoneBar placement={level.overall} labels />
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-white">Aún sin nivel global</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
                Hacen falta {MIN_FOR_OVERALL} categorías medidas y tienes {level.measured}.{needed > 0 && pending.length > 0 ? ` Puedes sumar: ${pending.join(', ')}.` : ''}
              </p>
            </>
          )}
        </section>
      )}

      {level.categories.map((c) => (
        <CategoryCard key={c.key} category={c} {...props} />
      ))}

      <p className="px-1 text-xs leading-relaxed text-neutral-500">Peso corporal, Pesado y Ligero no tienen referencia fuera: los ves contra ti en «Progreso».</p>
      <p className="px-1 text-[11px] leading-relaxed text-neutral-500" data-testid="ref-sources">
        Fuentes: OpenPowerlifting (openpowerlifting.org), dominio público. Fran: Mangine, Cebulla y Feito (2018), Sports Medicine - Open, CC BY 4.0. 5 km: tablas por edad de Alan Jones, CC0. Olímpicos: escala propia, orientativa.
      </p>
    </div>
  );
}
