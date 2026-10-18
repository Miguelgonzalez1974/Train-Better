import { useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { computeHrvStatus, HR_MAX, HR_MIN, HRV_MAX_RMSSD, HRV_MIN_RMSSD } from '../../engine/hrv';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const INFO = 'rgb(var(--c-state-cool))';

const parse = (text: string): number | null => {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

function Field({ label, unit, value, placeholder, invalid, onChange, mode }: { label: string; unit: string; value: string; placeholder: string; invalid: boolean; onChange: (v: string) => void; mode: 'decimal' | 'numeric' }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500">{label}</span>
      <span className={`flex items-baseline justify-center gap-1 rounded-lg border bg-white/[0.04] px-1.5 py-1 ${invalid ? 'border-[rgb(var(--c-state-low))]' : 'border-white/10 focus-within:border-white/30'}`}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={mode}
          placeholder={placeholder}
          aria-label={`${label} (${unit})`}
          aria-invalid={invalid}
          className="num w-full min-w-0 bg-transparent text-center text-base font-semibold text-neutral-100 outline-none placeholder:font-normal placeholder:text-neutral-600"
        />
        <span className="text-[10.5px] text-neutral-500">{unit}</span>
      </span>
    </label>
  );
}

/**
 * HRV (rMSSD en ms, p. ej. el de HRV4Training) y pulso en reposo de la mañana: dos casillas para teclear y, debajo, dónde cae
 * tu HRV frente a tu rango normal (o cuántas mediciones llevas para tenerlo). Opcional. Solo se pasan a la tarjeta los valores válidos.
 */
export function HrvInputs({
  hrv,
  hr,
  log,
  todayIso,
  onChange,
}: {
  hrv: number | undefined;
  hr: number | undefined;
  log: ReadinessCheck[];
  todayIso: string;
  onChange: (patch: { hrv?: number; restingHr?: number }) => void;
}) {
  const [hrvText, setHrvText] = useState(hrv !== undefined ? String(hrv).replace('.', ',') : '');
  const [hrText, setHrText] = useState(hr !== undefined ? String(hr) : '');
  const hrvNum = parse(hrvText);
  const hrNum = parse(hrText);
  const hrvOk = hrvNum !== null && hrvNum >= HRV_MIN_RMSSD && hrvNum <= HRV_MAX_RMSSD;
  const hrOk = hrNum !== null && hrNum >= HR_MIN && hrNum <= HR_MAX;

  // El estado se calcula con lo que llevas escrito, como si ya estuviera guardado.
  const status = useMemo(() => {
    const draft: ReadinessCheck = { date: todayIso, sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal', ...(hrvOk ? { hrv: hrvNum! } : {}), ...(hrOk ? { restingHr: hrNum! } : {}) };
    return computeHrvStatus([...log.filter((c) => c.date !== todayIso), draft], todayIso);
  }, [log, todayIso, hrvOk, hrvNum, hrOk, hrNum]);

  let line: { text: string; color?: string };
  if (hrvText.trim() !== '' && !hrvOk) {
    line = { text: hrvNum !== null && hrvNum < HRV_MIN_RMSSD ? 'Pon el rMSSD en ms (p. ej. 64), no la nota de 0 a 10' : `El rMSSD va entre ${HRV_MIN_RMSSD} y ${HRV_MAX_RMSSD} ms`, color: LOW };
  } else if (hrText.trim() !== '' && !hrOk) {
    line = { text: `El pulso va entre ${HR_MIN} y ${HR_MAX} ppm`, color: LOW };
  } else if (status.range && status.today?.vs) {
    const where = status.today.vs === 'bajo' ? 'Por debajo de tu rango' : status.today.vs === 'alto' ? 'Por encima de tu rango' : 'Dentro de tu rango';
    line = { text: `${where} (${status.range.low}–${status.range.high} ms)`, color: status.today.vs === 'bajo' ? LOW : status.today.vs === 'alto' ? INFO : GOOD };
  } else if (status.range) {
    line = { text: `Tu rango normal: ${status.range.low}–${status.range.high} ms` };
  } else {
    line = { text: status.n >= status.needed ? 'Mañana tendrás tu rango normal' : `Reuniendo datos: ${status.n} de ${status.needed} mediciones` };
  }

  return (
    <div className="border-t border-white/[0.07] pt-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
        <HeartPulse size={12} aria-hidden="true" />
        HRV y pulso
      </p>
      <div className="flex gap-1.5">
        <Field
          label="rMSSD"
          unit="ms"
          value={hrvText}
          placeholder={status.range ? String(Math.round((status.range.low + status.range.high) / 2)) : '64'}
          invalid={hrvText.trim() !== '' && !hrvOk}
          mode="decimal"
          onChange={(v) => {
            setHrvText(v);
            const n = parse(v);
            onChange({ hrv: n !== null && n >= HRV_MIN_RMSSD && n <= HRV_MAX_RMSSD ? Math.round(n * 10) / 10 : undefined });
          }}
        />
        <Field
          label="Pulso"
          unit="ppm"
          value={hrText}
          placeholder={status.hr.baseline !== null ? String(status.hr.baseline) : '55'}
          invalid={hrText.trim() !== '' && !hrOk}
          mode="numeric"
          onChange={(v) => {
            setHrText(v);
            const n = parse(v);
            onChange({ restingHr: n !== null && n >= HR_MIN && n <= HR_MAX ? Math.round(n) : undefined });
          }}
        />
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-neutral-500" style={line.color ? { color: line.color } : undefined}>
        {line.text}
      </p>
    </div>
  );
}
