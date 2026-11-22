import { useMemo, useState } from 'react';
import { HeartPulse, History, Minus, Plus } from 'lucide-react';
import type { HrvHistoryEntry, ReadinessCheck } from '../../data/athlete/types';
import { computeHrvStatus, HR_MAX, HR_MIN, HRV_MAX_RMSSD, HRV_MIN_RMSSD, HRV_PROVISIONAL_MIN, hrvScore } from '../../engine/hrv';
import { HrvBackfill } from './HrvBackfill';
import { HrvMini, type HrvMiniPoint } from './HrvMini';
import { displayHrv, loadHrvUnit, parseHrv, saveHrvUnit, stepHrv, unitLabel, type HrvUnit } from './hrvUnit';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const INFO = 'rgb(var(--c-state-cool))';
const TEAL = 'rgb(var(--c-sleep))';

const parseInt10 = (text: string): number | null => {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

function Round({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-neutral-100 transition-colors active:bg-white/15">
      {children}
    </button>
  );
}

/** Un número grande que se sube y baja con − y + y que también se puede escribir. */
function BigField({
  label,
  unit,
  value,
  invalid,
  color,
  onText,
  onStep,
  testId,
}: {
  label: string;
  unit: string;
  value: string;
  invalid: boolean;
  color: string;
  onText: (v: string) => void;
  onStep: (dir: 1 | -1) => void;
  testId: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1" data-testid={testId}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">{label}</span>
      <label className="flex min-w-0 items-baseline justify-center gap-1">
        <input
          value={value}
          onChange={(e) => onText(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          aria-label={`${label} (${unit})`}
          aria-invalid={invalid}
          className="num w-[4.4rem] min-w-0 bg-transparent text-center text-[2.1rem] font-semibold leading-none outline-none placeholder:text-neutral-600"
          style={{ color: invalid ? LOW : color }}
        />
        <span className="text-[11px] text-neutral-400">{unit}</span>
      </label>
      <div className="flex items-center gap-2">
        <Round onClick={() => onStep(-1)} label={`Menos ${label}`}>
          <Minus size={16} />
        </Round>
        <Round onClick={() => onStep(1)} label={`Más ${label}`}>
          <Plus size={16} />
        </Round>
      </div>    </div>
  );
}

/**
 * HRV (rMSSD en ms, o la nota de HRV4Training) y pulso en reposo de la mañana: dos números grandes con − y +, tu HRV de los últimos siete días sobre
 * la banda de tu rango normal y las medias semanal y mensual. Si aún no hay rango, «Cargar días anteriores» deja copiar de HRV4Training los de
 * antes para tenerlo desde el primer día. Opcional: solo se pasan a la tarjeta los valores válidos.
 */
export function HrvInputs({
  hrv,
  hr,
  log,
  todayIso,
  onChange,
  onHistoryChange,
}: {
  hrv: number | undefined;
  hr: number | undefined;
  /** El registro con el historial ya mezclado (`hrvLogWith`). */
  log: ReadinessCheck[];
  todayIso: string;
  onChange: (patch: { hrv?: number; restingHr?: number }) => void;
  /** Se cargaron días anteriores: la tarjeta recalcula con el historial nuevo. */
  onHistoryChange: (history: HrvHistoryEntry[]) => void;
}) {
  const [unit, setUnitState] = useState<HrvUnit>(() => loadHrvUnit(typeof window !== 'undefined' ? window.localStorage : null));
  const [hrvText, setHrvText] = useState(hrv !== undefined ? displayHrv(hrv, unit) : '');
  const [hrText, setHrText] = useState(hr !== undefined ? String(hr) : '');
  const [backfill, setBackfill] = useState(false);

  const setUnit = (u: HrvUnit) => {
    saveHrvUnit(typeof window !== 'undefined' ? window.localStorage : null, u);
    setUnitState(u);
    if (hrv !== undefined) setHrvText(displayHrv(hrv, u));
  };

  const hrvMs = parseHrv(hrvText, unit);
  const hrNum = parseInt10(hrText);
  const hrvOk = hrvMs !== null;
  const hrOk = hrNum !== null && hrNum >= HR_MIN && hrNum <= HR_MAX;

  // El estado se calcula con lo que llevas escrito, como si ya estuviera guardado.
  const status = useMemo(() => {
    const draft: ReadinessCheck = { date: todayIso, sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal', ...(hrvOk ? { hrv: hrvMs! } : {}), ...(hrOk ? { restingHr: hrNum! } : {}) };
    return computeHrvStatus([...log.filter((c) => c.date !== todayIso), draft], todayIso);
  }, [log, todayIso, hrvOk, hrvMs, hrOk, hrNum]);

  const points: HrvMiniPoint[] = useMemo(() => {
    const byDate = new Map(log.filter((c) => c.hrv !== undefined).map((c) => [c.date, c.hrv as number]));
    if (hrvOk) byDate.set(todayIso, hrvMs!);
    else byDate.delete(todayIso);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${todayIso}T12:00:00`);
      d.setDate(d.getDate() - (6 - i));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { iso, v: byDate.get(iso) ?? null };
    });
  }, [log, todayIso, hrvOk, hrvMs]);

  const fmt = (ms: number) => displayHrv(ms, unit);
  const startMs = () => status.week?.avg ?? (status.range ? Math.round((status.range.low + status.range.high) / 2) : 50);
  const stepHrvBy = (dir: 1 | -1) => {
    const next = stepHrv(hrvOk ? hrvMs! : startMs(), unit, dir);
    setHrvText(displayHrv(next, unit));
    onChange({ hrv: Math.round(next * 10) / 10 });
  };
  const stepHr = (dir: 1 | -1) => {
    const next = Math.min(HR_MAX, Math.max(HR_MIN, (hrOk ? hrNum! : (status.hr.baseline ?? 55)) + dir));
    setHrText(String(next));
    onChange({ restingHr: next });
  };

  let line: { text: string; color?: string; tag?: string };
  if (hrvText.trim() !== '' && !hrvOk) {
    line = {
      text: unit === 'nota' ? `La nota va entre ${hrvScore(HRV_MIN_RMSSD).toFixed(1).replace('.', ',')} y ${hrvScore(HRV_MAX_RMSSD).toFixed(1).replace('.', ',')}` : `El rMSSD va entre ${HRV_MIN_RMSSD} y ${HRV_MAX_RMSSD} ms. Si copias la nota (7,5), cambia a «Nota».`,
      color: LOW,
    };
  } else if (hrText.trim() !== '' && !hrOk) {
    line = { text: `El pulso va entre ${HR_MIN} y ${HR_MAX} ppm`, color: LOW };
  } else if (status.range && status.today?.vs) {
    const where = status.today.vs === 'bajo' ? 'Por debajo de tu rango' : status.today.vs === 'alto' ? 'Por encima de tu rango' : 'Dentro de tu rango';
    line = { text: `${where}${status.provisional ? ' (provisional)' : ''}`, color: status.today.vs === 'bajo' ? LOW : status.today.vs === 'alto' ? INFO : GOOD, tag: where };
  } else if (status.range) {
    line = { text: `Tu rango normal${status.provisional ? ' (provisional)' : ''}: ${fmt(status.range.low)}–${fmt(status.range.high)} ${unitLabel(unit)}` };
  } else {
    line = { text: status.n >= HRV_PROVISIONAL_MIN ? 'Mañana tendrás un rango provisional' : `Reuniendo datos: ${status.n} de ${HRV_PROVISIONAL_MIN} para un primer rango` };
  }

  const seg = (on: boolean) => (on ? 'bg-white/15 text-white' : 'text-neutral-400');
  return (
    <div data-testid="hrv-inputs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: TEAL }}>
          <HeartPulse size={13} aria-hidden="true" />
          Tu medición de HRV4Training
        </p>
        <div className="flex overflow-hidden rounded-lg bg-white/[0.06] text-[11px] font-semibold" role="radiogroup" aria-label="Unidad del HRV">
          <button role="radio" aria-checked={unit === 'ms'} onClick={() => setUnit('ms')} className={`px-2.5 py-1 ${seg(unit === 'ms')}`}>
            rMSSD
          </button>
          <button role="radio" aria-checked={unit === 'nota'} onClick={() => setUnit('nota')} className={`px-2.5 py-1 ${seg(unit === 'nota')}`}>
            Nota
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <BigField label={unit === 'nota' ? 'HRV' : 'rMSSD'} unit={unitLabel(unit)} value={hrvText} invalid={hrvText.trim() !== '' && !hrvOk} color={TEAL} onText={(v) => {
          setHrvText(v);
          const ms = parseHrv(v, unit);
          onChange({ hrv: ms !== null ? ms : undefined });
        }} onStep={stepHrvBy} testId="hrv-field" />
        <BigField label="Pulso" unit="ppm" value={hrText} invalid={hrText.trim() !== '' && !hrOk} color="rgb(var(--c-white))" onText={(v) => {
          setHrText(v);
          const n = parseInt10(v);
          onChange({ restingHr: n !== null && n >= HR_MIN && n <= HR_MAX ? Math.round(n) : undefined });
        }} onStep={stepHr} testId="hr-field" />
      </div>

      <div className="mt-3">
        <HrvMini points={points} status={status} todayIso={todayIso} fmt={fmt} unitLabel={unitLabel(unit)} />
      </div>

      <p className="mt-1.5 text-[12px] leading-snug text-neutral-400" style={line.color ? { color: line.color } : undefined}>
        {line.text}
        {status.week && (
          <span className="text-neutral-400">
            {' '}
            · media semanal {fmt(status.week.avg)}
            {status.month ? ` · mensual ${fmt(status.month.avg)}` : ''}
          </span>
        )}
        {status.hr.baseline !== null && status.hr.today !== null && (
          <span className="text-neutral-400">
            {' '}
            · pulso {status.hr.delta! > 0 ? `+${status.hr.delta}` : status.hr.delta} sobre tu media ({status.hr.baseline})
          </span>
        )}
      </p>

      <button onClick={() => setBackfill(true)} className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-300 underline decoration-dotted underline-offset-2" data-testid="hrv-backfill-open">
        <History size={13} aria-hidden="true" />
        {status.range && !status.provisional ? 'Editar días anteriores' : 'Cargar días anteriores y tener tu rango ya'}
      </button>

      <HrvBackfill open={backfill} onClose={() => setBackfill(false)} unit={unit} todayIso={todayIso} onSaved={onHistoryChange} />
    </div>
  );
}
