import type { AthleteProfile, LevelTestKey, LevelTestPostpone, SessionHistoryEntry } from '../../data/athlete/types';
import { nextTestOfSameKind, POSTPONE_TEXT, testBriefing, testName, upcomingTests } from '../../engine/levelTestPlan';
import { computeReferenceLevel, testDateText, testResults, timeText, ZONES, type RefKey } from '../../engine/levelReference';
import { ZoneBar } from '../dashboard/ZoneBar';

/** Lo que se ve de un test programado en Planificación: el aviso previo, la ficha del día, el aplazamiento y el resultado al anotarlo. */

const DAY = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' });
export const testDayText = (iso: string) => DAY.format(new Date(`${iso}T12:00:00`)).replace(/[.,]/g, '');

const CARD = 'day-card flex flex-col gap-1.5 px-[14px] py-3';
const TITLE = 'text-[13px] font-semibold text-white';
const TEXT = 'text-xs leading-relaxed text-neutral-400';
const BUTTON = 'mt-1 self-start rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white';
const Tag = ({ text }: { text: string }) => <span className="shrink-0 whitespace-nowrap rounded-md bg-warn/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn">{text}</span>;

/** «El lunes toca test», unos días antes. Si con lo que se sabe hoy ese día se va a aplazar (`postponed`), lo dice en su lugar. */
export function TestNotice({ profile, history, test, postponed, onPostpone }: { profile: AthleteProfile; history: SessionHistoryEntry[]; test: { key: LevelTestKey; date: string; inDays: number }; postponed?: LevelTestPostpone; onPostpone: (date: string) => void }) {
  if (postponed) return <TestPostponed profile={profile} history={history} testKey={test.key} reason={postponed} date={test.date} />;
  const { previous } = testBriefing(profile, history, test.key, test.date);
  return (
    <section className={CARD} aria-label="Próximo test" data-testid="test-notice">
      <p className="flex items-center justify-between gap-2">
        <span className={TITLE}>
          El {testDayText(test.date)} toca test: {testName(test.key)}
        </span>
        <Tag text={test.inDays === 1 ? 'mañana' : `en ${test.inDays} días`} />
      </p>
      <p className={TEXT}>{previous ? `Llega fresco. Tu marca: ${timeText(previous.seconds)} (${testDateText(previous.date)}).` : 'Llega fresco. Aún no tienes marca, así que será tu punto de partida.'}</p>
      <button type="button" onClick={() => onPostpone(test.date)} className={BUTTON}>
        Pasarlo a la semana siguiente
      </button>
    </section>
  );
}

/** La ficha del test, el día que toca. */
export function TestDayCard({ profile, history, testKey, date, onPostpone }: { profile: AthleteProfile; history: SessionHistoryEntry[]; testKey: LevelTestKey; date: string; onPostpone: (date: string) => void }) {
  const brief = testBriefing(profile, history, testKey, date);
  return (
    <section className={CARD} aria-label="Test de hoy" data-testid="test-day">
      <p className="flex items-center justify-between gap-2">
        <span className={TITLE}>Test: {brief.name}</span>
        <Tag text="test" />
      </p>
      <p className={TEXT}>{brief.prescription} Sustituye al WOD y va antes de la fuerza, que hoy va ligera.</p>
      {brief.targets.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 border-t border-white/[0.08] pt-2">
          {brief.targets.map((t) => (
            <li key={t.zone} className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-neutral-400">Para {t.zone}</span>
              <span className="num text-[13px] font-semibold text-white">{timeText(t.seconds)} o menos</span>
            </li>
          ))}
        </ul>
      )}
      {brief.previous && (
        <p className={TEXT}>
          Tu marca anterior: <span className="num font-semibold text-white">{timeText(brief.previous.seconds)}</span> · {testDateText(brief.previous.date)}
        </p>
      )}
      <button type="button" onClick={() => onPostpone(date)} className={BUTTON}>
        Hoy no, aplazar
      </button>
    </section>
  );
}

/** Un día tocaba un test y no sale: por qué y cuándo vuelve. */
export function TestPostponed({ profile, history, testKey, reason, date }: { profile: AthleteProfile; history: SessionHistoryEntry[]; testKey: LevelTestKey; reason: LevelTestPostpone; date: string }) {
  const next = upcomingTests(profile, history, date, 4).find((t) => t.date > date && t.key === testKey);
  return (
    <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-400" data-testid="test-postponed">
      El test de {testName(testKey)} del {testDayText(date)} se aplaza porque {POSTPONE_TEXT[reason]}.{next ? ` Vuelve el ${testDayText(next.date)}.` : ''}
    </p>
  );
}

const CATEGORY_OF: Record<LevelTestKey, RefKey> = { fran: 'velocidad', row2k: 'resistencia', run5k: 'largo' };

/** El resultado del test al anotarlo: tu tiempo, tu escalón, la mejora y cuándo se repite. Nada si no hay un tiempo válido. */
export function TestResultCard({ profile, history, testKey, date }: { profile: AthleteProfile; history: SessionHistoryEntry[]; testKey: LevelTestKey; date: string }) {
  const entry = history.find((e) => e.date === date);
  if (!entry) return null;
  // El nivel calculado solo con lo de ese día: así la barra es la de este tiempo y no la de tu mejor marca.
  const solo = computeReferenceLevel({ profile: { ...profile, levelTests: [], levelLog: [], levelScaledLog: [] }, history: [entry], today: new Date(`${date}T12:00:00`) });
  const category = solo.categories.find((c) => c.key === CATEGORY_OF[testKey]);
  const mark = category?.marks[0];
  if (!category || !mark) return null;
  const seconds = testResults(profile, [entry], testKey).find((r) => r.date === date)?.seconds;
  const before = testResults(profile, history, testKey).find((r) => r.date < date);
  const diff = before && seconds !== undefined ? Math.round(before.seconds - seconds) : null;
  const again = nextTestOfSameKind(date);
  return (
    <section className={CARD} aria-label="Resultado del test" data-testid="test-result">
      <p className="flex items-baseline justify-between gap-3">
        <span className={TITLE}>Test: {testName(testKey)}</span>
        <span className="num text-[22px] font-semibold leading-none text-white">{mark.value}</span>
      </p>
      {mark.placement && <ZoneBar placement={mark.placement} hollow={category.scaled} />}
      {mark.placement && (
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-white">{ZONES[mark.placement.zone]}</span>
          {mark.next && <span className="text-xs text-neutral-400">{mark.next}</span>}
        </p>
      )}
      {mark.detail && (
        <p className={TEXT}>
          {mark.detail.charAt(0).toUpperCase()}
          {mark.detail.slice(1)}. Guardado en Tu nivel.
        </p>
      )}
      {mark.notes?.map((n) => (
        <p key={n} className={TEXT}>
          {n}
        </p>
      ))}
      <p className={`${TEXT} border-t border-white/[0.08] pt-2`}>
        {diff === null || !before
          ? 'Primera marca.'
          : diff > 0
            ? `${timeText(diff)} mejor que el ${testDateText(before.date)}.`
            : diff < 0
              ? `${timeText(-diff)} por encima de tu marca del ${testDateText(before.date)}.`
              : `Igual que el ${testDateText(before.date)}.`}
        {again ? ` Lo repetirás hacia el ${testDayText(again)} para comparar.` : ''}
      </p>
    </section>
  );
}
