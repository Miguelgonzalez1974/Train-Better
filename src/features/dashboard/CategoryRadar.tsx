import type { CategoryLevel } from '../../engine/levelCategories';

const CENTER = { x: 180, y: 128 };
const RADIUS = 96;
const point = (i: number, n: number, frac: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: CENTER.x + RADIUS * frac * Math.cos(a), y: CENTER.y + RADIUS * frac * Math.sin(a) };
};
const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Dónde va la etiqueta de cada eje y hacia dónde se alinea el texto (arriba y abajo centrado; a la derecha o izquierda, junto al eje). */
function labelAt(i: number, n: number) {
  const p = point(i, n, 1.2);
  const cos = Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n);
  const anchor: 'start' | 'middle' | 'end' = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
  return { x: p.x, y: p.y + 4, anchor };
}

/**
 * El radar de «Tu nivel»: una forma con cada categoría (la de hoy, rellena, y la de hace tres meses, discontinua). 100 es tu mejor marca de esa categoría; el círculo hueco
 * marca una categoría provisional (un solo resultado) y una sin datos se queda en el centro, sin punto. Solo pinta.
 */
export function CategoryRadar({ categories }: { categories: CategoryLevel[] }) {
  const n = categories.length;
  const frac = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(100, v)) / 100);
  const now = categories.map((c, i) => point(i, n, frac(c.score)));
  const before = categories.map((c, i) => point(i, n, frac(c.before)));
  const hasBefore = categories.filter((c) => c.before !== null).length >= 3;
  return (
    <svg viewBox="0 0 360 262" width="100%" role="img" aria-label="Radar de las ocho categorías de tu nivel: hoy y hace tres meses">
      <title>Radar de tu nivel</title>
      {[1, 0.5].map((f) => (
        <polygon key={f} points={poly(categories.map((_, i) => point(i, n, f)))} fill="none" stroke="rgb(var(--c-white) / 0.16)" strokeWidth={1} />
      ))}
      {categories.map((_, i) => {
        const p = point(i, n, 1);
        return <line key={i} x1={CENTER.x} y1={CENTER.y} x2={p.x} y2={p.y} stroke="rgb(var(--c-white) / 0.1)" />;
      })}
      {hasBefore && <polygon points={poly(before)} fill="none" stroke="rgb(var(--c-white) / 0.55)" strokeWidth={1.4} strokeDasharray="4 3" strokeLinejoin="round" />}
      <polygon points={poly(now)} fill="rgb(var(--c-brand-orange) / 0.22)" stroke="rgb(var(--c-brand-orange))" strokeWidth={2} strokeLinejoin="round" />
      {categories.map((c, i) =>
        c.score === null ? null : c.confidence === 'provisional' ? (
          <circle key={c.key} cx={now[i].x} cy={now[i].y} r={4} fill="rgb(var(--c-bg, 14 14 16))" stroke="rgb(var(--c-brand-orange))" strokeWidth={1.6} />
        ) : (
          <circle key={c.key} cx={now[i].x} cy={now[i].y} r={3.5} fill="rgb(var(--c-brand-orange))" />
        ),
      )}
      {categories.map((c, i) => {
        const l = labelAt(i, n);
        return (
          <text key={c.key} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={12} fill={c.score === null ? 'rgb(var(--c-white) / 0.4)' : 'rgb(var(--c-white) / 0.9)'}>
            {c.label}
          </text>
        );
      })}
    </svg>
  );
}

/** El radar en miniatura para la insignia de la fila: el octógono y tu forma de hoy. */
export function MiniCategoryRadar({ categories }: { categories: CategoryLevel[] }) {
  const n = categories.length;
  const c = 22;
  const r = 17;
  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(c + r * f * Math.cos(a)).toFixed(1)},${(c + r * f * Math.sin(a)).toFixed(1)}`;
  };
  const ring = (f: number) => categories.map((_, i) => pt(i, f)).join(' ');
  const shape = categories.map((cat, i) => pt(i, cat.score === null ? 0 : cat.score / 100)).join(' ');
  return (
    <svg viewBox="0 0 44 44" width="34" height="34" aria-hidden="true">
      <polygon points={ring(1)} fill="none" stroke="rgb(var(--c-white) / 0.18)" strokeWidth={1} />
      {categories.filter((cat) => cat.score !== null).length >= 2 && <polygon points={shape} fill="rgb(var(--c-brand-orange) / 0.3)" stroke="rgb(var(--c-brand-orange))" strokeWidth={1.4} strokeLinejoin="round" />}
    </svg>
  );
}
