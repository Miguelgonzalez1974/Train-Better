import type { DiagnosisAreaKey } from '../../data/athlete/types';
import { REFERENCE_SCORE, type AreaTrend, type DiagnosisArea, type Tone } from '../../engine/athleteDiagnosis';

const TONE_COLOR: Record<Tone, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  low: 'rgb(var(--c-state-low))',
  none: 'rgb(var(--c-white) / 0.55)',
};

const TREND_MARK: Record<AreaTrend, { text: string; color: string } | null> = {
  sube: { text: '↑', color: 'rgb(var(--c-state-good))' },
  estable: { text: '→', color: 'rgb(var(--c-white) / 0.55)' },
  baja: { text: '↓', color: 'rgb(var(--c-state-mid))' },
  'sin-datos': null,
};

const R = 88;
const CX = 130;
const CY = 124;
const SHORT: Record<DiagnosisAreaKey, string> = { fuerza: 'Fuerza', halterofilia: 'Halterofilia', motor: 'Motor', gimnasticos: 'Gimnásticos', constancia: 'Constancia' };

/**
 * Un pentágono con tu forma de atleta: cada eje es un área; el aro punteado es lo esperable, así que lo que sobresale del aro es fuerte y lo
 * que queda dentro, margen. Un área sin datos se queda con su eje a trazos y su etiqueta atenuada. Con `trends`, cada etiqueta lleva una flecha
 * (↑ sube, → estable, ↓ baja) que sale de la tendencia del diagnóstico.
 */
export function ProfileRadar({ areas, trends = false }: { areas: DiagnosisArea[]; trends?: boolean }) {
  const n = areas.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, frac: number) => ({ x: CX + R * frac * Math.cos(angle(i)), y: CY + R * frac * Math.sin(angle(i)) });
  const ring = (frac: number) =>
    areas
      .map((_, i) => at(i, frac))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  const scored = areas.map((a, i) => (a.score === null ? null : { a, i, p: at(i, a.score / 100) })).filter((x): x is NonNullable<typeof x> => x !== null);
  const label = (i: number) => {
    const p = at(i, 1.2);
    const c = Math.cos(angle(i));
    return { x: p.x, y: p.y + 4, anchor: Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end' } as const;
  };
  return (
    <svg viewBox="-30 0 320 250" className="mx-auto h-auto w-full max-w-[22rem]" role="img" aria-label={`Tu forma: ${areas.map((a) => `${a.title} ${a.score ?? 'sin datos'}`).join(', ')}`}>
      <polygon points={ring(1)} fill="none" stroke="rgb(var(--c-white) / 0.1)" />
      <polygon points={ring(0.5)} fill="none" stroke="rgb(var(--c-white) / 0.06)" />
      <polygon points={ring(REFERENCE_SCORE / 100)} fill="none" stroke="rgb(var(--c-white) / 0.55)" strokeWidth={1} strokeDasharray="3 3" />
      {areas.map((a, i) => {
        const p = at(i, 1);
        return <line key={a.key} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgb(var(--c-white) / 0.07)" strokeDasharray={a.score === null ? '3 4' : undefined} />;
      })}
      {scored.length >= 3 && (
        <polygon points={scored.map((s) => `${s.p.x.toFixed(1)},${s.p.y.toFixed(1)}`).join(' ')} fill="rgb(var(--c-state-cool) / 0.16)" stroke="rgb(var(--c-state-cool))" strokeWidth={1.6} strokeLinejoin="round" />
      )}
      {scored.map((s) => (
        <circle key={s.a.key} cx={s.p.x} cy={s.p.y} r={4} fill="rgb(var(--c-brand-bg))" stroke={TONE_COLOR[s.a.tone]} strokeWidth={2} />
      ))}
      {areas.map((a, i) => {
        const l = label(i);
        const mark = trends ? TREND_MARK[a.trend] : null;
        return (
          <text key={a.key} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={11} fontWeight={600} fill={a.score === null ? 'rgb(var(--c-white) / 0.35)' : 'rgb(var(--c-white) / 0.85)'}>
            {SHORT[a.key]}
            {mark && (
              <tspan dx={3} fill={mark.color}>
                {mark.text}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
