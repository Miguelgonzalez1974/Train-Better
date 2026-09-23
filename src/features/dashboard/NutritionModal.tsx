import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Grab, Hand, Scale, ThumbsUp } from 'lucide-react';
import type { AthleteProfile, BodyweightEntry, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { generateSessionForDate } from '../../engine/generateSession';
import { resolveWeekLocks } from '../../engine/weekLocks';
import { computeAcwr } from '../../engine/loadMetrics';
import { getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import {
  analyzeWeightTrend,
  classifyNutritionDay,
  defaultTrainingSlot,
  FIST_CARB_G,
  FOOD_REFERENCE,
  formatServing,
  handGuide,
  mealTimingPlan,
  NUTRITION_DAY_LABEL,
  NUTRITION_DISCLAIMER,
  NUTRITION_SOURCES,
  nutritionForDay,
  PALM_PROTEIN_G,
  SUPPLEMENTS,
  TRAINING_SLOT_LABEL,
  VEGETABLES_ADVICE,
  type NutritionDayType,
  type TrainingSlot,
  type WeightTrendStatus,
} from '../../engine/nutritionPlan';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { Modal } from '../shell/Modal';

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const HAND_TABS: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];
const HAND_TAB_LABEL: Record<NutritionDayType, string> = { descanso: 'Descanso', ligero: 'Ligero', normal: 'Normal', alto: 'Alto' };

const TREND_STYLE: Record<WeightTrendStatus, string> = {
  'sin-datos': 'text-neutral-400',
  rapido: 'text-brand-orange',
  'en-objetivo': 'text-emerald-400',
  lento: 'text-brand-gold',
  'sin-perdida': 'text-brand-gold',
};

const TREND_TITLE: Record<WeightTrendStatus, string> = {
  'sin-datos': 'Sin datos suficientes',
  rapido: 'Pierdes demasiado deprisa',
  'en-objetivo': 'Ritmo en objetivo',
  lento: 'Ritmo lento',
  'sin-perdida': 'Sin pérdida en las últimas semanas',
};

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-t border-white/5 pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-white">
        {title}
        <Chevron size={16} className="text-neutral-500" />
      </button>
      {open && <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-300">{children}</div>}
    </div>
  );
}

/**
 * Guía por manos: palmas de proteína, puños de carbohidrato y pulgares de grasa por comida, según el tipo de
 * día y la hora del entreno — para comer sin gramos ni báscula. Las cifras salen del mismo plan (`handGuide`);
 * la equivalencia de la mano es APROXIMADA y se le dice al atleta.
 */
function HandGuide({
  slot,
  kg,
  activeType,
  onChange,
}: {
  slot: TrainingSlot;
  kg: number;
  activeType: NutritionDayType;
  onChange: (t: NutritionDayType) => void;
}) {
  const meals = handGuide(activeType, slot, kg);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-white">Guía por manos</p>
      <div className="mb-2 flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Tipo de día">
        {HAND_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={activeType === t}
            onClick={() => onChange(t)}
            className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              activeType === t ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {HAND_TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-white/5 rounded-xl bg-brand-surfaceMuted/60 px-3">
        {meals.map((m) => (
          <li key={m.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
            <div className="w-24 shrink-0">
              <p className="text-sm font-semibold text-white">{m.name}</p>
              {m.tag && <p className="text-[11px] text-neutral-500">{m.tag}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs text-neutral-200">
              <span className="flex items-center gap-1 rounded-md bg-red-400/10 px-2 py-1"><Hand size={13} className="text-red-300" aria-hidden="true" />{formatServing(m.palms, 'palma', 'palmas')}</span>
              <span className="flex items-center gap-1 rounded-md bg-brand-gold/10 px-2 py-1"><Grab size={13} className="text-brand-gold" aria-hidden="true" />{formatServing(m.fists, 'puño', 'puños')}</span>
              {m.thumb && <span className="flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1"><ThumbsUp size={13} className="text-emerald-300" aria-hidden="true" />1 pulgar</span>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
        Palma = proteína (pollo, pescado, 2 huevos, un yogur; ≈ {PALM_PROTEIN_G} g). Puño = carbohidrato cocinado (arroz, pasta, patata, pan, fruta;
        ≈ {FIST_CARB_G} g). Pulgar = grasa (aceite, frutos secos); no en la toma de justo antes de entrenar. Es aproximado: tu mano es tu medida.
      </p>
    </div>
  );
}

interface NutritionModalProps {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  bodyweightLog: BodyweightEntry[];
  onClose: () => void;
  onOpenBodyweight: () => void;
}

/**
 * Plan de nutricion deportiva orientativo (ver `engine/nutritionPlan.ts` para las fuentes y los limites):
 * cantidades por dia segun la carga real de la semana, que comer alrededor del entreno segun la hora, la
 * tendencia del peso registrado y contenido de apoyo. Solo lee — nunca escribe en el perfil.
 */
export function NutritionModal({ profile, history, bodyweightLog, onClose, onOpenBodyweight }: NutritionModalProps) {
  // Horario por defecto según el día (sábado por la mañana, el resto por la tarde); el selector lo cambia a mano.
  const [slot, setSlot] = useState<TrainingSlot>(() => defaultTrainingSlot(getWeekdayIndex(new Date())));
  const todayIso = toLocalIsoDate(new Date());
  const latest = useMemo(() => [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop(), [bodyweightLog]);

  // Sesiones planificadas de la semana en curso (lunes a domingo), con el bloqueo semanal ya resuelto (sin persistirlo).
  const week = useMemo(() => {
    const lockedProfile = resolveWeekLocks(profile, history, profile.goals, todayIso);
    const monday = new Date();
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - getWeekdayIndex(monday));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const iso = toLocalIsoDate(d);
      const session: DailySession = generateSessionForDate(lockedProfile, history.filter((h) => h.date < iso), d, profile.goals);
      return { iso, letter: DAY_LETTERS[i], session, type: classifyNutritionDay(session) };
    });
  }, [profile, history, todayIso]);

  const today = week.find((d) => d.iso === todayIso) ?? week[0];
  const highStrain = useMemo(() => computeAcwr(history).zone === 'alta' || Boolean(today.session.deloadReason), [history, today]);
  const trend = useMemo(() => analyzeWeightTrend(bodyweightLog, todayIso, { highStrain }), [bodyweightLog, todayIso, highStrain]);

  const [handTab, setHandTab] = useState<NutritionDayType | null>(null);

  if (!latest) {
    return (
      <Modal open onClose={onClose} title="Nutrición deportiva">
        <div className="flex flex-col gap-3 text-sm text-neutral-300">
          <p>Las cantidades del plan se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
          <button
            onClick={onOpenBodyweight}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black"
          >
            <Scale size={16} strokeWidth={2.25} /> Registrar mi peso
          </button>
          <p className="text-xs text-neutral-500">{NUTRITION_DISCLAIMER}</p>
        </div>
      </Modal>
    );
  }

  const kg = latest.kg;
  const todayNutrition = nutritionForDay(today.type, kg);
  const steps = mealTimingPlan(slot, today.type, kg, Boolean(today.session.doubleWod));

  return (
    <Modal open onClose={onClose} title="Nutrición deportiva">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-neutral-500">
          Objetivo: rendir mejor y perder grasa. Cantidades para {String(kg).replace('.', ',')} kg (pesaje del{' '}
          {new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${latest.date}T12:00:00`))}), ajustadas a la carga de cada día.
        </p>

        {/* Hoy */}
        <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Hoy</p>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${DAY_TYPE_STYLE[today.type]}`}>{NUTRITION_DAY_LABEL[today.type]}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Proteína</p>
              <p className="num text-xl font-bold text-white">
                {todayNutrition.proteinG.min}-{todayNutrition.proteinG.max} <span className="text-sm font-normal text-neutral-500">g</span>
              </p>
              <p className="text-xs text-neutral-500">
                {todayNutrition.proteinPerKg.min}-{todayNutrition.proteinPerKg.max} g/kg · ~{todayNutrition.proteinPerMealG} g por toma
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Carbohidrato</p>
              <p className="num text-xl font-bold text-white">
                {todayNutrition.carbsG.min}-{todayNutrition.carbsG.max} <span className="text-sm font-normal text-neutral-500">g</span>
              </p>
              <p className="text-xs text-neutral-500">
                {todayNutrition.carbsPerKg.min}-{todayNutrition.carbsPerKg.max} g/kg
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Grasa: el resto de tu comida, sin bajar de ~20 % de la energía. La proteína es la misma todos los días; lo que cambia con la carga es el carbohidrato.
          </p>
        </div>

        {/* Alrededor del entreno */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Alrededor del entreno</p>
            <div className="flex overflow-hidden rounded-lg border border-brand-border text-xs">
              {(['manana', 'tarde'] as TrainingSlot[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${slot === s ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-white'}`}
                >
                  {s === 'manana' ? '10:00' : '16-17 h'}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-2 text-xs text-neutral-500">{TRAINING_SLOT_LABEL[slot]}</p>
          <ol className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.when} className="rounded-lg bg-white/[0.03] p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gold">{s.when}</p>
                <p className="mt-0.5 text-sm text-neutral-300">{s.what}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Guía por manos */}
        <HandGuide slot={slot} kg={kg} activeType={handTab ?? today.type} onChange={setHandTab} />

        {/* Esta semana */}
        <div>
          <p className="mb-2 text-sm font-semibold text-white">Esta semana</p>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const n = nutritionForDay(d.type, kg);
              return (
                <div
                  key={d.iso}
                  className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-center ${d.iso === todayIso ? 'ring-1 ring-brand-gold' : ''} ${DAY_TYPE_STYLE[d.type]}`}
                  title={`${NUTRITION_DAY_LABEL[d.type]}: ${n.carbsG.min}-${n.carbsG.max} g de carbohidrato`}
                >
                  <span className="text-[11px] font-bold">{d.letter}</span>
                  <span className="num text-[10px] leading-tight">
                    {n.carbsG.min}-{n.carbsG.max}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">Gramos de carbohidrato por día. Descanso y ligero, normal, carga alta (doble WOD o día fuerte). La proteína no cambia.</p>
        </div>

        {/* Tendencia del peso */}
        <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5">
          <p className="text-sm font-semibold text-white">Tu tendencia de peso</p>
          <p className={`mt-1 text-sm font-semibold ${TREND_STYLE[trend.status]}`}>
            {TREND_TITLE[trend.status]}
            {trend.lossPctPerWeek !== null && (
              <span className="ml-2 font-normal text-neutral-500">
                {trend.lossPctPerWeek >= 0 ? '−' : '+'}
                {Math.abs(trend.lossPctPerWeek).toFixed(1).replace('.', ',')} %/semana
              </span>
            )}
          </p>
          <p className="mt-1.5 text-sm text-neutral-300">{trend.message}</p>
          <button onClick={onOpenBodyweight} className="mt-2 text-xs font-semibold text-brand-gold underline decoration-dotted">
            Registrar peso
          </button>
        </div>

        <Section title={VEGETABLES_ADVICE.title}>
          <p>{VEGETABLES_ADVICE.intro}</p>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {VEGETABLES_ADVICE.ideas.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Section>

        <Section title="Ejemplos de proteína y carbohidrato">
          {(['proteina', 'carbohidrato'] as const).map((g) => (
            <div key={g}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{g === 'proteina' ? 'Proteína' : 'Carbohidrato'}</p>
              <ul className="flex flex-col gap-0.5">
                {FOOD_REFERENCE.filter((f) => f.group === g).map((f) => (
                  <li key={f.item} className="flex justify-between gap-3">
                    <span>{f.item}</span>
                    <span className="shrink-0 text-neutral-500">{f.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-neutral-500">Valores aproximados (USDA FoodData Central); varían con la marca y la cocción.</p>
        </Section>

        <Section title="Suplementos con evidencia">
          {SUPPLEMENTS.map((s) => (
            <div key={s.name}>
              <p className="font-semibold text-white">{s.name}</p>
              <p className="text-neutral-400">{s.dose}</p>
              <p className="text-xs text-neutral-500">{s.note}</p>
            </div>
          ))}
        </Section>

        <Section title="Fuentes">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-neutral-500">
            {NUTRITION_SOURCES.map((s) => (
              <li key={s.key}>{s.label}</li>
            ))}
          </ul>
        </Section>

        <p className="border-t border-white/5 pt-3 text-xs leading-relaxed text-neutral-500">{NUTRITION_DISCLAIMER}</p>
      </div>
    </Modal>
  );
}
