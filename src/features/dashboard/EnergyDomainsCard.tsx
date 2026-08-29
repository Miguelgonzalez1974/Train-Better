import { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import type { EnergySystem } from '../../engine/wodDomains';

/** Colores por sistema — misma lógica calma→máximo que el resto del Dashboard (sky = suave, emerald = recuperación). */
const SYSTEM_COLOR: Record<EnergySystem, string> = {
  'base-aerobica': '#38bdf8',
  umbral: '#d4af37',
  potencia: '#fb7185',
  recuperacion: '#34d399',
};

const TRIFECTA_COLOR = '#a78bfa';

function AdherenceBar({ planned, done, maxPlanned, color }: { planned: number; done: number; maxPlanned: number; color: string }) {
  const trackPct = Math.max((planned / maxPlanned) * 100, 6);
  const fillPct = planned > 0 ? Math.min((done / planned) * 100, 100) : 0;
  return (
    <div className="h-2.5 flex-1">
      <div className="relative h-full rounded-full bg-white/[0.06]" style={{ width: `${trackPct}%` }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fillPct}%`, background: color }} />
      </div>
    </div>
  );
}

function ShareBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2.5 flex-1 rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, background: color }} />
    </div>
  );
}

/**
 * "Cómo llevamos el acondicionamiento": reparto de los días de WOD del bloque por sistema
 * energético (planificado por la rotación de fase vs. sesiones hechas) y trifecta realizada de los
 * WOD. Lectura pura del historial + el planificador determinista — no toca el motor. Devuelve null
 * sin macrociclo activo, igual que el resto de tarjetas del bloque. Colapsable para no alargar el
 * scroll; el titular (insight) ya se ve plegada.
 */
export function EnergyDomainsCard({ profile, history }: { profile: AthleteProfile; history: SessionHistoryEntry[] }) {
  const [collapsed, setCollapsed] = useState(true);
  const balance = computeConditioningBalance(profile, history, new Date());
  if (!balance) return null;

  const maxPlanned = Math.max(...balance.energy.map((e) => e.planned), 1);
  const adherencePct = balance.totalPlanned > 0 ? Math.round((balance.totalDone / balance.totalPlanned) * 100) : 0;

  return (
    <section className="card overflow-hidden p-0">
      <button onClick={() => setCollapsed((prev) => !prev)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <Activity size={16} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.6)]" />
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-white">Dominios energéticos</span>
          <span className="rounded-full bg-brand-neon/15 px-2 py-0.5 text-[10px] font-bold text-brand-neon">
            {balance.totalDone}/{balance.totalPlanned} sesiones
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-neutral-400">{balance.phaseLabel}</span>
        </span>
        {collapsed ? (
          <ChevronDown size={16} className="shrink-0 text-neutral-500" />
        ) : (
          <ChevronUp size={16} className="shrink-0 text-neutral-500" />
        )}
      </button>

      {collapsed && (
        <div className="border-t border-white/5 px-3.5 pb-3.5 pt-3">
          <div className="flex items-center gap-3 rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5">
            <Lightbulb size={15} strokeWidth={2.25} className="shrink-0 text-brand-gold" />
            <p className="text-xs leading-relaxed text-neutral-300">{balance.insight}</p>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="flex flex-col gap-4 border-t border-white/5 px-3.5 pb-3.5 pt-3">
          <p className="text-[11px] text-neutral-500">
            Fase {balance.phaseLabel} · domina {balance.dominantLabel.toLowerCase()} · últimas {balance.windowWeeks} semanas
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Sistema energético</p>
              <p className="text-[10px] text-neutral-600">hechas / planificadas</p>
            </div>
            <div className="flex flex-col gap-2">
              {balance.energy.map((e) => (
                <div key={e.system} className="flex items-center gap-2.5">
                  <span className="w-[92px] shrink-0 text-[11px] text-neutral-400">{e.label}</span>
                  <AdherenceBar planned={e.planned} done={e.done} maxPlanned={maxPlanned} color={SYSTEM_COLOR[e.system]} />
                  <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-white">
                    {e.done}/{e.planned}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-neutral-600">
              Adherencia del bloque: {adherencePct}%. Los días de benchmark no cuentan aquí.
            </p>
          </div>

          {balance.trifecta.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Trifecta · {balance.trifectaSessions} WOD
              </p>
              <div className="flex flex-col gap-2">
                {balance.trifecta.map((t) => (
                  <div key={t.domain} className="flex items-center gap-2.5">
                    <span className="w-[92px] shrink-0 text-[11px] text-neutral-400">{t.label}</span>
                    <ShareBar pct={t.pct} color={TRIFECTA_COLOR} />
                    <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-white">{t.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-neutral-500">
              Aún sin WOD registrados en la ventana — la trifecta aparecerá según entrenes.
            </p>
          )}

          <div className="flex items-start gap-2 border-t border-white/5 pt-2.5">
            <Lightbulb size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-gold" />
            <p className="text-[11px] leading-relaxed text-neutral-400">{balance.insight}</p>
          </div>
        </div>
      )}
    </section>
  );
}
