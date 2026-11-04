export type RexMood = 'idle' | 'think' | 'happy' | 'lift';

/**
 * Rex, la mascota del coach: un robot con cinta en la frente que respira y parpadea. Cambia de cara según lo que pasa:
 * `think` mira de lado y la antena late, `happy` cierra los ojos sonriendo y `lift` levanta una barra con los brazos en alto.
 * Solo es dibujo: no lleva texto ni decide nada. Usa los colores del tema, así que se ve bien en claro y en oscuro.
 */
export function RexMascot({ size = 56, mood = 'idle', className = '' }: { size?: number; mood?: RexMood; className?: string }) {
  const happy = mood === 'happy' || mood === 'lift';
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={Math.round((size * 140) / 120)}
      role="img"
      aria-label="Rex, la mascota del coach"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <g className="animate-rex-bob motion-reduce:animate-none">
        {mood === 'lift' && (
          <g className="animate-rex-lift motion-reduce:animate-none">
            <rect x="8" y="12" width="104" height="5" rx="2.5" className="fill-white" />
            <rect x="4" y="2" width="9" height="25" rx="3" className="fill-white" />
            <rect x="107" y="2" width="9" height="25" rx="3" className="fill-white" />
          </g>
        )}
        {mood === 'lift' ? (
          <g className="stroke-brand-neon" strokeWidth={6} strokeLinecap="round" fill="none">
            <line x1="38" y1="102" x2="19" y2="18" />
            <line x1="82" y1="102" x2="101" y2="18" />
          </g>
        ) : (
          <g className="stroke-brand-neon" strokeWidth={6} strokeLinecap="round" fill="none">
            <line x1="38" y1="104" x2="26" y2="122" />
            <line x1="82" y1="104" x2="94" y2="122" />
          </g>
        )}
        <line x1="60" y1="34" x2="60" y2="24" className="stroke-brand-neon" strokeWidth={3} strokeLinecap="round" />
        <circle
          cx="60"
          cy="19"
          r="5"
          className={`fill-brand-neon [transform-box:fill-box] origin-center ${mood === 'think' ? 'animate-rex-pulse motion-reduce:animate-none' : ''}`}
        />
        <rect x="38" y="94" width="44" height="32" rx="12" className="fill-brand-neon/15 stroke-brand-neon" strokeWidth={2} />
        <circle cx="60" cy="110" r="7" className="fill-none stroke-brand-neon" strokeWidth={2.5} />
        <rect x="22" y="34" width="76" height="58" rx="18" className="fill-brand-neon/15 stroke-brand-neon" strokeWidth={2} />
        <rect x="25" y="43" width="70" height="8" className="fill-brand-neon/25" />
        {happy ? (
          <g className="stroke-white" strokeWidth={3} strokeLinecap="round" fill="none">
            <path d="M39 69 Q46 58 53 69" />
            <path d="M67 69 Q74 58 81 69" />
          </g>
        ) : (
          <g className={mood === 'think' ? 'translate-x-1' : ''}>
            <circle cx="46" cy="66" r="6" className="fill-white [transform-box:fill-box] origin-center animate-rex-blink motion-reduce:animate-none" />
            <circle cx="74" cy="66" r="6" className="fill-white [transform-box:fill-box] origin-center animate-rex-blink motion-reduce:animate-none" />
          </g>
        )}
        {happy ? (
          <path d="M46 77 Q60 96 74 77 Z" className="fill-white" />
        ) : mood === 'think' ? (
          <path d="M54 82 L66 82" className="stroke-white" strokeWidth={3} strokeLinecap="round" fill="none" />
        ) : (
          <path d="M50 80 Q60 88 70 80" className="stroke-white" strokeWidth={3} strokeLinecap="round" fill="none" />
        )}
      </g>
    </svg>
  );
}
