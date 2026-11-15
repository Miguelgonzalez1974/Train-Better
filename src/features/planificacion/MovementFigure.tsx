import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DynShape, FigurePose, MovementAnimation, Point, PropShape } from '../../engine/movementAnimation';
import { animationFor } from '../../engine/movementAnimations';
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

/** Las piezas móviles que van detrás del cuerpo (radios, palancas, bielas, rayitas del suelo); el resto (disco, balón, comba) va delante. */
const isBehind = (shape: DynShape) => shape.kind === 'line';

const DYN_LINE_CLASS: Record<string, string> = {
  spoke: 'stroke-neutral-600',
  lever: 'stroke-neutral-500',
  crank: 'stroke-neutral-500',
  tick: 'stroke-neutral-700',
};
const DYN_LINE_WIDTH: Record<string, number> = { spoke: 3, lever: 5, crank: 4, tick: 3 };

function DynElement({ shape, setRef }: { shape: DynShape; setRef: (el: SVGElement | null) => void }) {
  if (shape.kind === 'circle') {
    return shape.role === 'plate' ? (
      <circle ref={setRef} r={shape.r} fill="none" strokeWidth={5} className="stroke-brand-orange" />
    ) : (
      <circle ref={setRef} r={shape.r} className="fill-brand-orange" />
    );
  }
  if (shape.kind === 'line') {
    const role = shape.role;
    return <line ref={setRef} strokeWidth={DYN_LINE_WIDTH[role]} strokeLinecap="round" className={DYN_LINE_CLASS[role]} />;
  }
  return <polyline ref={setRef} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="stroke-neutral-300" />;
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

const setLine = (el: SVGElement | null | undefined, v: [number, number, number, number]) => {
  if (!el) return;
  el.setAttribute('x1', String(v[0]));
  el.setAttribute('y1', String(v[1]));
  el.setAttribute('x2', String(v[2]));
  el.setAttribute('y2', String(v[3]));
};

function Figure({ anim, stroke, playing, speed, respectReducedMotion, className }: { anim: MovementAnimation; stroke: number; playing: boolean; speed: number; respectReducedMotion: boolean; className: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const legs = useRef<SVGPolylineElement>(null);
  const torso = useRef<SVGPolylineElement>(null);
  const arm = useRef<SVGPolylineElement>(null);
  const foot = useRef<SVGLineElement>(null);
  const legs2 = useRef<SVGPolylineElement>(null);
  const arm2 = useRef<SVGPolylineElement>(null);
  const foot2 = useRef<SVGLineElement>(null);
  const head = useRef<SVGCircleElement>(null);
  const hand = useRef<SVGCircleElement>(null);
  const seat = useRef<SVGLineElement>(null);
  const cable = useRef<SVGLineElement>(null);
  const dynEls = useRef<(SVGElement | null)[]>([]);
  const t = useRef(anim.duration * 0.3);
  const [visible, setVisible] = useState(true);
  const still = respectReducedMotion && prefersReducedMotion();
  // La estructura de lo que se mueve (cuántas piezas y de qué tipo) es la misma en todos los instantes: se mira en uno.
  const first = anim.pose(0);
  const dyn = first.dyn ?? [];

  const draw = (pose: FigurePose) => {
    legs.current?.setAttribute('points', pts(pose.legs));
    torso.current?.setAttribute('points', pts(pose.torso));
    arm.current?.setAttribute('points', pts(pose.arm));
    setLine(foot.current, pose.foot);
    if (pose.legs2) legs2.current?.setAttribute('points', pts(pose.legs2));
    if (pose.arm2) arm2.current?.setAttribute('points', pts(pose.arm2));
    if (pose.foot2) setLine(foot2.current, pose.foot2);
    head.current?.setAttribute('cx', String(pose.head[0]));
    head.current?.setAttribute('cy', String(pose.head[1]));
    hand.current?.setAttribute('cx', String(pose.hand[0]));
    hand.current?.setAttribute('cy', String(pose.hand[1]));
    if (pose.seat) setLine(seat.current, pose.seat);
    if (pose.cable) setLine(cable.current, pose.cable);
    pose.dyn?.forEach((d, i) => {
      const el = dynEls.current[i];
      if (!el) return;
      if (d.kind === 'circle') {
        el.setAttribute('cx', String(d.cx));
        el.setAttribute('cy', String(d.cy));
      } else if (d.kind === 'line') setLine(el, [d.x1, d.y1, d.x2, d.y2]);
      else el.setAttribute('points', pts(d.points));
    });
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
      <line ref={seat} strokeWidth={5} strokeLinecap="round" className="stroke-neutral-500" display={first.seat ? undefined : 'none'} />
      <line ref={cable} strokeWidth={2} className="stroke-brand-orange" display={first.cable ? undefined : 'none'} />
      {dyn.map((d, i) => (isBehind(d) ? <DynElement key={`b${i}`} shape={d} setRef={(el) => (dynEls.current[i] = el)} /> : null))}
      {/* El otro lado del cuerpo (la pierna y el brazo de detrás), más tenue. */}
      {first.legs2 && (
        <g fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className="stroke-neutral-500">
          <line ref={foot2} />
          <polyline ref={legs2} />
          <polyline ref={arm2} />
        </g>
      )}
      <g fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className="stroke-white">
        <line ref={foot} />
        <polyline ref={legs} />
        <polyline ref={torso} />
        <polyline ref={arm} />
      </g>
      <circle ref={head} r={stroke * 1.5} className="fill-white" />
      <circle ref={hand} r={stroke * 0.7} className="fill-brand-orange" />
      {dyn.map((d, i) => (isBehind(d) ? null : <DynElement key={`f${i}`} shape={d} setRef={(el) => (dynEls.current[i] = el)} />))}
    </svg>
  );
}

/**
 * El muñeco pequeño junto a un movimiento del WOD; al tocarlo se abre grande, solo el dibujo en bucle. Si el movimiento no tiene
 * animación, no se pinta nada (la fila queda como siempre).
 */
export function MovementFigureButton({ movementId, name }: { movementId: string; name: string }) {
  const [open, setOpen] = useState(false);
  if (!animationFor(movementId)) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Ver ${name} ampliado`}
        className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] transition-colors hover:bg-white/10 active:bg-white/15"
      >
        <MovementFigure movementId={movementId} stroke={13} className="h-full w-full" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        <div className="rounded-xl bg-white/[0.03] p-2">
          <MovementFigure movementId={movementId} stroke={7} respectReducedMotion={false} className="h-64 w-full" />
        </div>
      </Modal>
    </>
  );
}
