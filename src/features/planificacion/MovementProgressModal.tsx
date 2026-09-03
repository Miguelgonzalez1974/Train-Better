import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PersonalRecords, PrLogEntry, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { buildPrSeries, summarisePrProgress } from '../../engine/progressSeries';
import {
  buildMovementSessionSeries,
  resolveLiftPrKey,
  summariseMovementWork,
  type MovementSessionPoint,
} from '../../engine/movementProgress';
import { Modal } from '../shell/Modal';

interface MovementProgressModalProps {
  movementId: string;
  /** Carga objetivo de la serie desde la que se abrió — solo para contexto en la cabecera. */
  targetKg: number;
  open: boolean;
  onClose: () => void;
  prs: PersonalRecords;
  prLog: PrLogEntry[];
  workLog: WorkSetEntry[];
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
}

function pctColor(pct: number): string {
  if (pct >= 88) return '#39ff14';
  if (pct >= 80) return '#cfeecb';
  return '#8a827a';
}

/** Barras "peso máximo por sesión" con la línea de puntos del 1RM. SVG plano, sin dependencias. */
function SessionBars({ series, oneRepMax }: { series: MovementSessionPoint[]; oneRepMax: number }) {
  const W = 312;
  const H = 138;
  const PAD = 6;
  const BASELINE = 116;
  const USABLE = 90;
  const inner = W - PAD * 2;

  const topKgs = series.map((p) => p.topKg);
  const maxTop = Math.max(...topKgs);
  const minTop = Math.min(...topKgs);
  const ceil = oneRepMax > 0 ? Math.max(oneRepMax, maxTop) : maxTop;
  const floor = oneRepMax > 0 ? Math.min(oneRepMax * 0.5, minTop * 0.9) : minTop * 0.9;
  const span = Math.max(ceil - floor, 1);
  const frac = (kg: number) => Math.max(0, Math.min(1, (kg - floor) / span));
  const yFor = (kg: number) => BASELINE - frac(kg) * USABLE;

  const n = series.length;
  const slot = inner / n;
  const barW = Math.min(26, slot * 0.62);
  const y1rm = oneRepMax > 0 ? yFor(oneRepMax) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Peso máximo por sesión frente al 1RM" style={{ overflow: 'visible' }}>
      {y1rm != null && (
        <>
          <line x1={PAD} y1={y1rm} x2={W - PAD} y2={y1rm} stroke="#d4af37" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - PAD} y={y1rm - 4} textAnchor="end" fontSize="11" fill="#d4af37">
            1RM {oneRepMax}
          </text>
        </>
      )}

      {series.map((p, i) => {
        const x = PAD + slot * i + (slot - barW) / 2;
        const top = yFor(p.topKg);
        const recent = i >= n - 2;
        const showPct = p.pct != null && (i === 0 || i === n - 1);
        return (
          <g key={p.date}>
            <rect x={x} y={top} width={barW} height={Math.max(BASELINE - top, 2)} rx="3" fill={recent ? '#39ff14' : '#2f6b2a'} />
            {showPct && (
              <text x={x + barW / 2} y={top - 5} textAnchor="middle" fontSize="11" fill="#cfeecb">
                {p.pct}%
              </text>
            )}
          </g>
        );
      })}

      {n === 1 ? (
        <text x={W / 2} y={132} textAnchor="middle" fontSize="11" fill="#6f6a63">
          {fmtDay(series[0].date)}
        </text>
      ) : (
        <>
          <text x={PAD} y={132} textAnchor="start" fontSize="11" fill="#6f6a63">
            {fmtDay(series[0].date)}
          </text>
          {n >= 5 && (
            <text x={W / 2} y={132} textAnchor="middle" fontSize="11" fill="#6f6a63">
              {fmtDay(series[Math.floor(n / 2)].date)}
            </text>
          )}
          <text x={W - PAD} y={132} textAnchor="end" fontSize="11" fill="#6f6a63">
            {fmtDay(series[n - 1].date)}
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Popup de progresión de un levantamiento — sustituye a la antigua calculadora de discos. Se abre al
 * tocar la carga de una serie de fuerza u oly y muestra el 1RM actual del atleta y, sesión a sesión,
 * el peso máximo real que ha cogido en ese movimiento, para que vea de un vistazo cómo de cerca de su
 * 1RM está trabajando. Solo aplica a movimientos con PR raíz (`resolveLiftPrKey`); la serie se filtra
 * por `movementId` exacto, sin mezclar variantes.
 */
export function MovementProgressModal({ movementId, targetKg, open, onClose, prs, prLog, workLog }: MovementProgressModalProps) {
  const movement = getMovementById(movementId);
  const prKey = movement ? resolveLiftPrKey(movement) : null;
  const oneRepMax = prKey ? prs[prKey] : 0;

  const series = useMemo(
    () => (prKey ? buildMovementSessionSeries(workLog, movementId, oneRepMax) : []),
    [prKey, workLog, movementId, oneRepMax],
  );
  const summary = useMemo(() => summariseMovementWork(series), [series]);
  const prProgress = useMemo(
    () => (prKey ? summarisePrProgress(buildPrSeries(prLog, prKey)) : null),
    [prKey, prLog],
  );

  if (!open) return null;

  const gained = prProgress ? prProgress.deltaKg : 0;
  const recent = [...series].reverse().slice(0, 3);

  return (
    <Modal open={open} onClose={onClose} title={movement?.name ?? 'Movimiento'}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold leading-none text-white">{oneRepMax > 0 ? oneRepMax : '—'}</span>
            {oneRepMax > 0 && <span className="text-sm text-neutral-500">kg</span>}
            {prProgress && gained !== 0 && (
              <span
                className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  gained > 0 ? 'bg-brand-neon/15 text-brand-neon' : 'bg-brand-orange/15 text-brand-orange'
                }`}
              >
                {gained > 0 ? <TrendingUp size={11} strokeWidth={2.75} /> : <TrendingDown size={11} strokeWidth={2.75} />}
                {gained > 0 ? '+' : ''}
                {gained} kg
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">
            {oneRepMax > 0 ? '1RM actual' : '1RM sin registrar'}
            {targetKg > 0 && oneRepMax > 0 && (
              <span className="ml-2 normal-case tracking-normal text-neutral-600">
                · serie de hoy {targetKg} kg ({Math.round((targetKg / oneRepMax) * 100)}%)
              </span>
            )}
          </p>
        </div>

        {series.length === 0 ? (
          <div className="rounded-xl bg-white/[0.03] px-3 py-6 text-center">
            <p className="text-sm font-semibold text-neutral-300">A la espera de sesiones</p>
            <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-neutral-500">
              Cuando registres series de {movement?.name ?? 'este movimiento'} en el modo entreno, aquí verás cómo de cerca de tu
              1RM trabajas cada día.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-black/25 px-3 pb-1 pt-3">
              <SessionBars series={series} oneRepMax={oneRepMax} />
            </div>

            <p className="text-xs leading-relaxed text-neutral-400">
              {summary.avgPct != null && summary.maxPct != null ? (
                <>
                  Trabajando al <span className="font-semibold text-white">{summary.avgPct}%</span> de media
                  {series.length > 1 && ' este tramo'} · máximo{' '}
                  <span className="font-semibold text-brand-neon">{summary.maxPct}%</span>
                  {summary.maxPctDate && ` el ${fmtDay(summary.maxPctDate)}`}.
                  {summary.nearMax && <span className="text-brand-gold"> Cerca de re-test.</span>}
                </>
              ) : oneRepMax > 0 ? (
                'Registra el RPE de tus series para estimar a qué % del 1RM estás trabajando.'
              ) : (
                `Registra tu 1RM de ${movement?.name ?? 'este movimiento'} para ver a qué % trabajas cada sesión.`
              )}
            </p>

            <div className="border-t border-white/5 pt-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">Últimas sesiones</p>
              <div className="flex flex-col">
                {recent.map((p, i) => (
                  <div
                    key={p.date}
                    className={`flex items-center justify-between py-1.5 text-[13px] ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
                  >
                    <span className="text-neutral-400">{fmtDay(p.date)}</span>
                    <span className="text-white">
                      {p.topKg} kg{p.reps > 0 ? ` × ${p.reps}` : ''}
                    </span>
                    <span className="min-w-[38px] text-right font-semibold" style={{ color: p.pct != null ? pctColor(p.pct) : '#8a827a' }}>
                      {p.pct != null ? `${p.pct}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
