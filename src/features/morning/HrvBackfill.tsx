import { useEffect, useMemo, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { HrvHistoryEntry } from '../../data/athlete/types';
import { HR_MAX, HR_MIN } from '../../engine/hrv';
import { Modal } from '../shell/Modal';
import { displayHrv, parseHrv, unitLabel, type HrvUnit } from './hrvUnit';

const SHOWN_STEP = 14;
const SHOWN_MAX = 60;
const DAY = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lo que se guarda: las filas escritas con un valor válido, junto a las que ya había de días que no se enseñan. */
export function buildHistory(previous: HrvHistoryEntry[], shownDates: string[], hrvText: Record<string, string>, hrText: Record<string, string>, unit: HrvUnit): HrvHistoryEntry[] {
  const shown = new Set(shownDates);
  const kept = previous.filter((e) => !shown.has(e.date));
  const written: HrvHistoryEntry[] = [];
  for (const date of shownDates) {
    const ms = parseHrv(hrvText[date] ?? '', unit);
    if (ms === null) continue;
    const hr = Number((hrText[date] ?? '').replace(',', '.'));
    written.push({ date, hrv: ms, ...((hrText[date] ?? '').trim() !== '' && Number.isFinite(hr) && hr >= HR_MIN && hr <= HR_MAX ? { restingHr: Math.round(hr) } : {}) });
  }
  return [...kept, ...written].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * «Cargar días anteriores»: una lista de los días de antes (de ayer hacia atrás) para copiar de HRV4Training el rMSSD (o la nota) y el pulso de cada
 * uno. Sirve para tener tu rango normal desde el primer día en vez de esperar 7 o 14 mediciones. Los días con check-in propio no se tocan (mandan los
 * del check-in). Se puede volver a abrir para corregir o ampliar.
 */
export function HrvBackfill({ open, onClose, unit, todayIso, onSaved }: { open: boolean; onClose: () => void; unit: HrvUnit; todayIso: string; onSaved: (history: HrvHistoryEntry[]) => void }) {
  const [days, setDays] = useState(SHOWN_STEP);
  const [hrvText, setHrvText] = useState<Record<string, string>>({});
  const [hrText, setHrText] = useState<Record<string, string>>({});

  const dates = useMemo(() => Array.from({ length: days }, (_, i) => isoMinus(todayIso, i + 1)), [days, todayIso]);
  // Los días con HRV de un check-in propio van aparte: no se editan aquí (se miran en el registro de check-ins, no en el historial cargado).
  const ownFromCheckIn = (date: string) => {
    const stored = athleteRepository.getProfile().readinessLog?.find((c) => c.date === date);
    return stored?.hrv !== undefined ? stored : null;
  };

  useEffect(() => {
    if (!open) return;
    const history = athleteRepository.getProfile().hrvHistory ?? [];
    const h: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (const e of history) {
      h[e.date] = displayHrv(e.hrv, unit);
      if (e.restingHr !== undefined) r[e.date] = String(e.restingHr);
    }
    setHrvText(h);
    setHrText(r);
    // se rehace solo al abrir o al cambiar de unidad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  const filled = dates.filter((d) => parseHrv(hrvText[d] ?? '', unit) !== null && !ownFromCheckIn(d)).length;
  const invalid = dates.some((d) => (hrvText[d] ?? '').trim() !== '' && parseHrv(hrvText[d], unit) === null);

  function save() {
    const profile = athleteRepository.getProfile();
    const editable = dates.filter((d) => !ownFromCheckIn(d));
    const next = buildHistory(profile.hrvHistory ?? [], editable, hrvText, hrText, unit);
    athleteRepository.saveProfile({ ...profile, hrvHistory: next });
    onSaved(next);
    onClose();
  }

  const input = 'num w-full min-w-0 rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1.5 text-center text-sm font-semibold text-white outline-none focus:border-white/40';
  return (
    <Modal open={open} onClose={onClose} title="Tus días anteriores">
      <div className="flex flex-col gap-3" data-testid="hrv-backfill">
        <p className="text-xs leading-relaxed text-neutral-400">
          Copia de HRV4Training el {unit === 'nota' ? 'valor de la pestaña HRV' : 'valor de la pestaña rMSSD'} de cada día y, si quieres, su pulso. Con 7 días ya hay un rango y con 14 o más es fiable. Lo que dejes vacío
          se ignora.
        </p>
        <ul className="flex max-h-[52vh] flex-col overflow-y-auto rounded-xl border border-white/10">
          {dates.map((date) => {
            const mine = ownFromCheckIn(date);
            const label = DAY.format(new Date(`${date}T12:00:00`)).replace(/\./g, '');
            return (
              <li key={date} className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-1.5 first:border-t-0">
                <span className="w-[5.2rem] shrink-0 text-xs capitalize text-neutral-300">{label}</span>
                {mine ? (
                  <span className="text-[11px] text-neutral-400">Ya medido en tu check-in: {displayHrv(mine.hrv!, unit)} {unitLabel(unit)}</span>
                ) : (
                  <>
                    <input
                      value={hrvText[date] ?? ''}
                      onChange={(e) => setHrvText((t) => ({ ...t, [date]: e.target.value }))}
                      inputMode="decimal"
                      placeholder={unit === 'nota' ? 'nota' : 'ms'}
                      aria-label={`${unit === 'nota' ? 'HRV' : 'rMSSD'} del ${label}`}
                      aria-invalid={(hrvText[date] ?? '').trim() !== '' && parseHrv(hrvText[date], unit) === null}
                      className={input}
                    />
                    <input value={hrText[date] ?? ''} onChange={(e) => setHrText((t) => ({ ...t, [date]: e.target.value }))} inputMode="numeric" placeholder="ppm" aria-label={`Pulso del ${label}`} className={`${input} max-w-[4.2rem]`} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {days < SHOWN_MAX && (
          <button onClick={() => setDays((d) => Math.min(SHOWN_MAX, d + SHOWN_STEP))} className="self-start text-xs font-semibold text-neutral-300 underline decoration-dotted">
            Ver {SHOWN_STEP} días más
          </button>
        )}
        {invalid && <p className="text-xs" style={{ color: 'rgb(var(--c-state-low))' }}>Hay valores que no cuadran con {unit === 'nota' ? 'una nota de HRV' : 'un rMSSD en ms'}: revisa los marcados.</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={invalid} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:opacity-50" data-testid="hrv-backfill-save">
            {filled > 0 ? `Guardar ${filled} ${filled === 1 ? 'día' : 'días'}` : 'Guardar'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
