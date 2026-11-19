import type { AthleteProfile } from '../../data/athlete/types';
import { toLocalIsoDate } from '../../engine/periodization';
import { skillLabel, skillLadder, skillPosition, skillWeekSplit, SKILL_WAVE_WEEKS, type MuKind, type SkillFocusKey } from '../../engine/skillFocus';

type WodSourceId = NonNullable<AthleteProfile['wodSources']>[number];

const EFFORT_MODE_OPTIONS: { key: NonNullable<AthleteProfile['wodEffortMode']>; label: string; hint: string }[] = [
  { key: 'off', label: 'Apagado', hint: 'El WOD se elige como siempre: por duración, energía, dominio y molestias.' },
  { key: 'shadow', label: 'Prueba', hint: 'El coach calcula qué WOD dejaría tu esfuerzo previsto dentro del objetivo de hoy y lo cuenta en «por qué tu sesión es así», pero sirve el de siempre.' },
  { key: 'on', label: 'Activo', hint: 'Si el WOD previsto te sacaría de tu objetivo de esfuerzo, el coach sirve otro de los que ya encajaban que sí lo respeta.' },
];

/** Las programaciones que se pueden marcar; «Clásicos» incluye también las piezas de programaciones menores. */
const WOD_SOURCE_OPTIONS: { key: string; label: string; sources: WodSourceId[] }[] = [
  { key: 'pushjerk', label: 'PushJerk', sources: ['pushjerk'] },
  { key: 'mayhem', label: 'CrossFit Mayhem', sources: ['mayhem'] },
  { key: 'comptrain', label: 'CompTrain', sources: ['comptrain'] },
  { key: 'invictus', label: 'CrossFit Invictus', sources: ['invictus'] },
  { key: 'clasicos', label: 'Clásicos (Girls, Heroes, Open)', sources: ['clasicos', 'otros'] },
];

const selectClass = 'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

function Chip({ on, onClick, role, children }: { on: boolean; onClick: () => void; role?: 'radio'; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? on : undefined}
      aria-pressed={role ? undefined : on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-neutral-500 hover:bg-white/5'}`}
    >
      {children}
    </button>
  );
}

/** «lun 18 ene»: cuándo empieza el paso siguiente. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}

/**
 * Foco de skill (handstand walk y muscle-up): en qué paso de su escalera estás en cada una. Cambiar el paso lo hace empezar hoy y cada 4 semanas
 * sube solo; la 4ª semana de cada paso es de test, y si no lo clavas lo repites desde aquí.
 */
function SkillFocusSettings({ profile, onChange }: { profile: AthleteProfile; onChange: (patch: Partial<AthleteProfile>) => void }) {
  const today = toLocalIsoDate(new Date());
  const focus = profile.skillFocus;
  const muKind: MuKind = focus?.muKind ?? 'bar';
  const split = skillWeekSplit(today);

  function setStep(skill: SkillFocusKey, step: number) {
    onChange({ skillFocus: { ...focus, [skill]: { step, since: today } } });
  }
  function setKind(kind: MuKind) {
    if (kind === muKind) return;
    const len = skillLadder('mu', kind).length;
    onChange({ skillFocus: { ...focus, muKind: kind, mu: { step: Math.min(focus?.mu?.step ?? 0, len - 1), since: today } } });
  }

  const row = (skill: SkillFocusKey) => {
    const ladder = skillLadder(skill, muKind);
    const pos = skillPosition(focus, skill, today);
    return (
      <div key={skill} className="flex flex-col gap-1.5 rounded-xl bg-white/[0.04] p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          {skillLabel(skill, muKind)}: en qué paso estás
          <select value={pos.stepIndex} onChange={(e) => setStep(skill, Number(e.target.value))} className={`w-full ${selectClass}`} aria-label={`Paso de ${skillLabel(skill, muKind)}`}>
            {ladder.map((s, i) => (
              <option key={s.movementId + i} value={i}>
                {i + 1}. {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-neutral-500">
          Paso {pos.stepIndex + 1} de {pos.stepCount} · semana {pos.waveWeek + 1} de {SKILL_WAVE_WEEKS}
          {pos.waveWeek === SKILL_WAVE_WEEKS - 1 ? ' (test)' : ''}
          {pos.nextStepFrom ? ` · el paso siguiente empieza el ${shortDate(pos.nextStepFrom)}` : ' · último paso: la ola se repite con más exigencia'}
        </p>
        <button type="button" onClick={() => setStep(skill, pos.stepIndex)} className="self-start text-[11px] font-semibold text-neutral-400 underline decoration-dotted hover:text-white">
          Repetir este paso desde hoy
        </button>
      </div>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-label="Foco de skill">
      <legend className="mb-1 text-xs text-neutral-400">Skill: handstand walk y muscle-up</legend>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Muscle-up en barra o en anillas">
        <span className="text-xs text-neutral-500">Muscle-up en</span>
        <Chip role="radio" on={muKind === 'bar'} onClick={() => setKind('bar')}>
          Barra
        </Chip>
        <Chip role="radio" on={muKind === 'ring'} onClick={() => setKind('ring')}>
          Anillas
        </Chip>
      </div>
      {row('mu')}
      {row('hsw')}
      <span className="text-[11px] text-neutral-600">
        Tres días de skill por semana: esta semana {split.mu} de muscle-up y {split.hsw} de handstand walk, y la siguiente al revés. Cada paso dura 4 semanas con series y repeticiones que
        suben; la última es de test. Con un objetivo de gimnásticos de otra habilidad, el coach trabaja ese.
      </span>
    </fieldset>
  );
}

/**
 * Cómo programa el coach: días de entreno por semana, reparto de la fuerza, de qué programaciones sale el WOD y si se elige por tu
 * esfuerzo de hoy. Cada cambio se guarda al momento (`onChange` con solo lo que cambia); quien lo usa recalcula las sesiones ya generadas.
 */
export function ProgrammingSettings({ profile, onChange }: { profile: AthleteProfile; onChange: (patch: Partial<AthleteProfile>) => void }) {
  // Sin lista guardada valen todas. «Clásicos» agrupa los clásicos y el resto de programaciones sueltas.
  const selectedWodSources = WOD_SOURCE_OPTIONS.filter((o) => !profile.wodSources || o.sources.some((s) => profile.wodSources!.includes(s))).map((o) => o.key);

  function toggleWodSource(key: string) {
    const next = selectedWodSources.includes(key) ? selectedWodSources.filter((k) => k !== key) : [...selectedWodSources, key];
    if (next.length === 0) return; // siempre queda al menos una
    const sources = next.length === WOD_SOURCE_OPTIONS.length ? undefined : WOD_SOURCE_OPTIONS.filter((o) => next.includes(o.key)).flatMap((o) => o.sources);
    onChange({ wodSources: sources });
  }

  const effort = profile.wodEffortMode ?? 'shadow';

  return (
    <section aria-label="Ajustes de programación" className="flex flex-col gap-4 rounded-2xl bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">Ajustes de programación</p>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Días de entrenamiento / semana
        <select value={profile.trainingDaysPerWeek} onChange={(e) => onChange({ trainingDaysPerWeek: Number(e.target.value) as AthleteProfile['trainingDaysPerWeek'] })} className={`w-40 ${selectClass}`}>
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} días
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Reparto de la fuerza
        <select value={profile.strengthSplit ?? 'weekly'} onChange={(e) => onChange({ strengthSplit: e.target.value as NonNullable<AthleteProfile['strengthSplit']> })} className={`w-full sm:w-72 ${selectClass}`}>
          <option value="weekly">Semanal por días</option>
          <option value="adaptive">Adaptativo</option>
        </select>
        <span className="text-[11px] text-neutral-600">
          Semanal: cada día tiene su patrón fijo (piernas, pecho, hombro, peso muerto) con un complemento (p. ej. banca + remo); el sábado va al que más lo necesita. Adaptativo: el reparto se recalcula según la fase y tus objetivos.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-neutral-400">Programaciones de las que sale tu WOD</legend>
        <div className="flex flex-wrap gap-2">
          {WOD_SOURCE_OPTIONS.map((opt) => (
            <Chip key={opt.key} on={selectedWodSources.includes(opt.key)} onClick={() => toggleWodSource(opt.key)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <span className="text-[11px] text-neutral-600">El coach elige el WOD de cada día entre las programaciones marcadas. Si dejas pocas, algún día puede recurrir a un WOD generado.</span>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-neutral-400">Elegir el WOD por tu esfuerzo de hoy</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Elegir el WOD por tu esfuerzo de hoy">
          {EFFORT_MODE_OPTIONS.map((opt) => (
            <Chip key={opt.key} role="radio" on={effort === opt.key} onClick={() => onChange({ wodEffortMode: opt.key === 'shadow' ? undefined : opt.key })}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <span className="text-[11px] text-neutral-600">{EFFORT_MODE_OPTIONS.find((o) => o.key === effort)?.hint} Nunca toca el simulacro, la activación ni la víspera de la competición.</span>
      </fieldset>

      <SkillFocusSettings profile={profile} onChange={onChange} />
    </section>
  );
}
