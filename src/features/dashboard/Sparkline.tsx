const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 56;
const DEFAULT_PADDING = 6;

/**
 * Convierte una serie de valores en un path de linea + area rellena — mismo trazado que ya usaba
 * `BodyweightCard` en solitario, extraido aqui porque ACWR necesita exactamente la misma
 * matematica para su propia tendencia. Una sola implementacion en vez de dos copias que divergan.
 */
export function buildSparklinePath(values: number[], width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, padding = DEFAULT_PADDING) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  return { line, area, lastPoint: points[points.length - 1], width, height };
}

interface SparklineProps {
  values: number[];
  strokeClassName: string;
  areaClassName: string;
  dotClassName: string;
  className?: string;
}

/** Renderiza nada si hay menos de 2 puntos — no hay tendencia que trazar con un solo valor. Las clases de color se pasan completas desde el llamador (no se interpolan) para que Tailwind las detecte en build. */
export function Sparkline({ values, strokeClassName, areaClassName, dotClassName, className }: SparklineProps) {
  if (values.length < 2) return null;
  const { line, area, lastPoint, width, height } = buildSparklinePath(values);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className ?? 'h-14 w-full'}>
      <path d={area} className={areaClassName} />
      <path d={line} fill="none" className={strokeClassName} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={3} className={dotClassName} />
    </svg>
  );
}
