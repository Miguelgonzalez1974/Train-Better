import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animationFor, type FigurePose, type MovementAnimation, type Point, type PropShape } from '../../engine/movementAnimation';
import { subscribeAnimation } from '../../lib/animationClock';
import { Modal } from '../shell/Modal';

/**
 * El muñeco de palitos de un movimiento (ver `engine/movementAnimation.ts`): una animación en bucle de perfil, para tener a mano la
 * imagen del movimiento junto al WOD. Sin animación para ese movimiento, no pinta nada. Las animaciones de toda la pantalla comparten un
 * solo reloj, se pausan fuera de la vista y, con «reducir movimiento» activado en el móvil, se quedan en una postura quieta.
 */

const pts = (a: Point[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const PROP_CLASS: Record<string, string> = {
  floor: 'stroke-neutral-700',
  frame: 'stroke-neutral-500',
  thin: 'stroke-neutral-600',
  ring: 'stroke-brand-orange',
};

function Prop({ shape }: { shape: PropShape }) {
  if (shape.kind === 'line') {
    const width = shape.role === 'floor' ? 2 : shape.role === 'thin' ? 2 : 4;
    return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} strokeWidth={width} strokeLinecap="round" className={PROP_CLASS[shape.role]} />;
  }
  return <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="none" strokeWidth={4} className={PROP_CLASS[shape.role]} />;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface FigureProps {
  movementId: string;
  /** Grosor del trazo en unidades del dibujo: más grueso en pequeño para que se vea. */
  stroke: number;
  /** En marcha o parado en la postura actual. */
  playing?: boolean;
  /** 1 = a su ritmo, 0,5 = a cámara lenta. */
  speed?: number;
  /** Con «reducir movimiento» el muñeco pequeño no se mueve; el ampliado sí si se pulsa play. */
  respectReducedMotion?: boolean;
  className?: string;
}

export function MovementFigure({ movementId, stroke, playing = true, speed = 1, respectReducedMotion = true, className = '' }: FigureProps) {
  const anim = animationFor(movementId);
  if (!anim) return null;
  return <Figure anim={anim} stroke={stroke} playing={playing} speed={speed} respectReducedMotion={respectReducedMotion} className={className} />;
}

function Figure({ anim, stroke, playing, speed, respectReducedMotion, className }: { anim: MovementAnimation; stroke: number; playing: boolean; speed: number; respectReducedMotion: boolean; className: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const legs = useRef<SVGPolylineElement>(null);
  const torso = useRef<SVGPolylineElement>(null);
  const arm = useRef<SVGPolylineElement>(null);
  const foot = useRef<SVGLineElement>(null);
  const head = useRef<SVGCircleElement>(null);
  const hand = useRef<SVGCircleElement>(null);
  const seat = useRef<SVGLineElement>(null);
  const cable = useRef<SVGLineElement>(null);
  const t = useRef(anim.duration * 0.3);
  const [visible, setVisible] = useState(true);
  const still = respectReducedMotion && prefersReducedMotion();

  const draw = (pose: FigurePose) => {
    legs.current?.setAttribute('points', pts(pose.legs));
    torso.current?.setAttribute('points', pts(pose.torso));
    arm.current?.setAttribute('points', pts(pose.arm));
    const f = foot.current;
    if (f) {
      f.setAttribute('x1', String(pose.foot[0]));
      f.setAttribute('y1', String(pose.foot[1]));
      f.setAttribute('x2', String(pose.foot[2]));
      f.setAttribute('y2', String(pose.foot[3]));
    }
    head.current?.setAttribute('cx', String(pose.head[0]));
    head.current?.setAttribute('cy', String(pose.head[1]));
    hand.current?.setAttribute('cx', String(pose.hand[0]));
    hand.current?.setAttribute('cy', String(pose.hand[1]));
    const s = seat.current;
    if (s && pose.seat) {
      s.setAttribute('x1', String(pose.seat[0]));
      s.setAttribute('y1', String(pose.seat[1]));
      s.setAttribute('x2', String(pose.seat[2]));
      s.setAttribute('y2', String(pose.seat[3]));
    }
    const c = cable.current;
    if (c && pose.cable) {
      c.setAttribute('x1', String(pose.cable[0]));
      c.setAttribute('y1', String(pose.cable[1]));
      c.setAttribute('x2', String(pose.cable[2]));
      c.setAttribute('y2', String(pose.cable[3]));
    }
  };

  // La postura quieta (o la de partida) se pinta antes del primer fotograma, para que no salga el muñeco sin colocar.
  useLayoutEffect(() => {
    draw(anim.pose(t.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  // Fuera de la vista no se anima.
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || still) return;
    return subscribeAnimation((dt) => {
      t.current = (t.current + dt * speed) % anim.duration;
      draw(anim.pose(t.current));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, visible, still, speed, anim]);

  const [x, y, w, h] = anim.box;
  return (
    <svg ref={svg} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={className}>
      {anim.props.map((p, i) => (
        <Prop key={i} shape={p} />
      ))}
      <line ref={seat} strokeWidth={5} strokeLinecap="round" className="stroke-neutral-500" display={anim.pose(0).seat ? undefined : 'none'} />
      <line ref={cable} strokeWidth={2} className="stroke-brand-orange" display={anim.pose(0).cable ? undefined : 'none'} />
      <g fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className="stroke-white">
        <line ref={foot} />
        <polyline ref={legs} />
        <polyline ref={torso} />
        <polyline ref={arm} />
      </g>
      <circle ref={head} r={stroke * 1.5} className="fill-white" />
      <circle ref={hand} r={stroke * 0.7} className="fill-brand-orange" />
    </svg>
  );
}

/**
 * El muñeco pequeño junto a un movimiento del WOD; al tocarlo se abre grande, con pausa y cámara lenta. Si el movimiento no tiene
 * animación, no se pinta nada (la fila queda como siempre).
 */
export function MovementFigureButton({ movementId, name }: { movementId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  if (!animationFor(movementId)) return null;
  return (
    <>
      <button
        onClick={() => {
          setPlaying(true);
          setOpen(true);
        }}
        aria-label={`Ver ${name} ampliado`}
        className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] transition-colors hover:bg-white/10 active:bg-white/15"
      >
        <MovementFigure movementId={movementId} stroke={13} className="h-full w-full" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        <div className="rounded-xl bg-white/[0.03] p-2">
          <MovementFigure movementId={movementId} stroke={7} playing={playing} speed={slow ? 0.5 : 1} respectReducedMotion={false} className="h-64 w-full" />
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setPlaying((p) => !p)} className="flex-1 rounded-lg border border-brand-border py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
            {playing ? 'Pausa' : 'Seguir'}
          </button>
          <button
            onClick={() => setSlow(false)}
            aria-pressed={!slow}
            className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors ${!slow ? 'border-white/30 bg-white/10 text-white' : 'border-brand-border text-neutral-300 hover:bg-white/5'}`}
          >
            1x
          </button>
          <button
            onClick={() => setSlow(true)}
            aria-pressed={slow}
            className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors ${slow ? 'border-white/30 bg-white/10 text-white' : 'border-brand-border text-neutral-300 hover:bg-white/5'}`}
          >
            0,5x
          </button>
        </div>
      </Modal>
    </>
  );
}
