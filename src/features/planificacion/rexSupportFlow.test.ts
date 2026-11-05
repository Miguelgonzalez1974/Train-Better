import { describe, expect, it } from 'vitest';
import type { AthleteProfile } from '../../data/athlete/types';
import { RETURN_GAP_MIN_DAYS } from '../../engine/intensityRamp';
import { PAIN_AREA_AVOID_TEXT } from '../../engine/painFlags';
import { isRestMarked } from '../../engine/restDays';
import { makeProfile } from '../../engine/__fixtures';
import { addDaysIso } from '../objetivos/rexFlow';
import { applySupport, awayDates, getSupportNode, isComplete, summarize, type SupportCtx, type SupportState } from './rexSupportFlow';

const TODAY = '2026-11-04';
const mkCtx = (profile: AthleteProfile, todayDone = false): SupportCtx => ({ profile, todayIso: TODAY, todayDone, newId: () => 'flag-1' });
const base = () => makeProfile({ painFlags: [], restDates: [] });

/** Recorre la conversación pulsando botones por su texto. */
function walk(labels: string[], ctx: SupportCtx) {
  let s: SupportState = {};
  let id = 'start';
  for (const label of labels) {
    const node = getSupportNode(id, ctx);
    const opt = node.options.find((o) => o.label === label);
    if (!opt) throw new Error(`En «${id}» no hay «${label}». Hay: ${node.options.map((o) => o.label).join(' | ')}`);
    s = { ...s, ...opt.set };
    id = opt.next;
  }
  return { s, id };
}

describe('Rex para imprevistos: la conversación', () => {
  it('ofrece los tres caminos, y sin "hoy no" si la sesión de hoy ya está hecha', () => {
    expect(getSupportNode('start', mkCtx(base())).options.map((o) => o.label)).toEqual(['Me duele algo', 'Hoy no estoy para el plan', 'Voy a faltar unos días']);
    expect(getSupportNode('start', mkCtx(base(), true)).options.map((o) => o.label)).toEqual(['Me duele algo', 'Voy a faltar unos días']);
  });

  it('con la sesión a mano, primero lo que se cambia (otro WOD, el tipo, más dura) y luego los imprevistos', () => {
    const ctx: SupportCtx = { ...mkCtx(base()), canSwapWod: true, canChangeType: true, canHarder: true };
    const opts = getSupportNode('start', ctx).options;
    expect(opts.map((o) => o.label)).toEqual(['Otro WOD', 'Cambiar el tipo de sesión', 'Más dura', 'Me duele algo', 'Hoy no estoy para el plan', 'Voy a faltar unos días']);
    expect(opts.filter((o) => o.act).map((o) => o.act)).toEqual(['otro-wod', 'tipo', 'dureza']);
    // Cada una aparece solo si se puede.
    expect(getSupportNode('start', { ...ctx, canSwapWod: false }).options.map((o) => o.label)).not.toContain('Otro WOD');
    expect(getSupportNode('start', { ...ctx, canHarder: false }).options.map((o) => o.label)).not.toContain('Más dura');
  });

  it('con la sesión de hoy ya hecha no se ofrece cambiarla', () => {
    const labels = getSupportNode('start', { ...mkCtx(base(), true), canSwapWod: true, canChangeType: true, canHarder: true }).options.map((o) => o.label);
    expect(labels).toEqual(['Más dura', 'Me duele algo', 'Voy a faltar unos días']);
  });

  it('cada botón lleva a una pregunta que existe o al resumen', () => {
    const ctx = mkCtx(base());
    const ids = ['start', 'p_zone', 'p_dur', 't_what', 'a_why', 'a_days'];
    for (const id of ids) {
      for (const o of getSupportNode(id, ctx).options) expect(o.next === 'summary' || ids.includes(o.next), `${id} → ${o.label}`).toBe(true);
    }
  });

  it('las zonas son las cuatro que conoce la app, con su nombre', () => {
    expect(getSupportNode('p_zone', mkCtx(base())).options.map((o) => o.label)).toEqual(['Hombro', 'Cadera / lumbar', 'Rodilla', 'Codo / muñeca']);
  });

  it('los días fuera incluyen el umbral desde el que la app propone la rampa de vuelta', () => {
    const labels = getSupportNode('a_days', mkCtx(base())).options.map((o) => o.label);
    expect(labels).toContain(`${RETURN_GAP_MIN_DAYS} días o más`);
  });

  it('si hoy ya está entrenado, los días fuera empiezan mañana y la pregunta lo dice', () => {
    expect(getSupportNode('a_days', mkCtx(base(), true)).text).toMatch(/desde mañana/);
    expect(getSupportNode('a_days', mkCtx(base())).text).toMatch(/contando hoy/);
  });
});

describe('Rex para imprevistos: una molestia', () => {
  const flow = ['Me duele algo', 'Rodilla', 'Unos días'];

  it('pone un aviso de la zona, de hoy, con la caducidad de la duración elegida', () => {
    const ctx = mkCtx(base());
    const { s, id } = walk(flow, ctx);
    expect(id).toBe('summary');
    expect(isComplete(s)).toBe(true);
    const flag = applySupport(s, ctx).profile.painFlags![0];
    expect(flag).toEqual({ id: 'flag-1', area: 'rodilla', createdDate: TODAY, until: addDaysIso(TODAY, 5) });
  });

  it('un par de semanas caduca a los 12 días; "lo quito yo" no caduca', () => {
    const ctx = mkCtx(base());
    expect(applySupport(walk(['Me duele algo', 'Hombro', 'Un par de semanas'], ctx).s, ctx).profile.painFlags![0].until).toBe(addDaysIso(TODAY, 12));
    expect(applySupport(walk(['Me duele algo', 'Hombro', 'No lo sé: lo quito yo'], ctx).s, ctx).profile.painFlags![0].until).toBeNull();
  });

  it('el resumen dice lo que evita según la app y que la sesión de hoy se rehace; pide que se recalcule', () => {
    const ctx = mkCtx(base());
    const { s } = walk(flow, ctx);
    const sum = summarize(s, ctx);
    expect(sum.title).toBe('Aviso de molestia · Rodilla');
    expect(sum.fx.join(' ')).toContain(PAIN_AREA_AVOID_TEXT.rodilla);
    expect(sum.fx.join(' ')).toMatch(/se rehace/);
    expect(sum.fx.join(' ')).toMatch(/Mañana te pregunto/);
    expect(applySupport(s, ctx).regenerate).toBe(true);
  });

  it('un aviso nuevo de una zona que ya tenías activa la sustituye (y lo dice); las demás zonas se quedan', () => {
    const profile = makeProfile({
      painFlags: [
        { id: 'viejo', area: 'rodilla', createdDate: '2026-11-01', until: '2026-11-20' },
        { id: 'otra', area: 'hombro', createdDate: '2026-11-01', until: null },
      ],
    });
    const ctx = mkCtx(profile);
    const { s } = walk(flow, ctx);
    expect(summarize(s, ctx).fx[0]).toMatch(/Sustituye al aviso de rodilla/);
    const flags = applySupport(s, ctx).profile.painFlags!;
    expect(flags.map((f) => f.id).sort()).toEqual(['flag-1', 'otra']);
  });

  it('un aviso ya quitado de la misma zona no se cuenta como activo', () => {
    const profile = makeProfile({ painFlags: [{ id: 'quitado', area: 'rodilla', createdDate: '2026-10-20', until: null, clearedDate: '2026-10-30' }] });
    const ctx = mkCtx(profile);
    const { s } = walk(flow, ctx);
    expect(summarize(s, ctx).fx.join(' ')).not.toMatch(/Sustituye/);
    expect(applySupport(s, ctx).profile.painFlags!.map((f) => f.id)).toContain('quitado');
  });
});

describe('Rex para imprevistos: hoy no', () => {
  it('descansar marca solo hoy, sin recalcular la sesión', () => {
    const ctx = mkCtx(base());
    const { s } = walk(['Hoy no estoy para el plan', 'Descansar hoy'], ctx);
    const eff = applySupport(s, ctx);
    expect(eff.profile.restDates).toEqual([TODAY]);
    expect(eff.swap).toBeUndefined();
    expect(eff.regenerate).toBe(false);
    expect(summarize(s, ctx).fx.join(' ')).toMatch(/no baja tu cumplimiento/);
  });

  it('recuperación y WOD libre cambian la sesión de hoy y no tocan el perfil', () => {
    const ctx = mkCtx(base());
    const rec = applySupport(walk(['Hoy no estoy para el plan', 'Algo suave: recuperación'], ctx).s, ctx);
    expect(rec.swap).toBe('recovery');
    expect(rec.profile).toBe(ctx.profile);
    expect(applySupport(walk(['Hoy no estoy para el plan', 'Un WOD libre, sin cargas de PR'], ctx).s, ctx).swap).toBe('random');
    expect(summarize(walk(['Hoy no estoy para el plan', 'Un WOD libre, sin cargas de PR'], ctx).s, ctx).fx.join(' ')).toMatch(/sin cargas de PR/);
  });
});

describe('Rex para imprevistos: faltar unos días', () => {
  it('marca esos días seguidos desde hoy como descanso', () => {
    const ctx = mkCtx(base());
    const { s } = walk(['Voy a faltar unos días', 'Viajo', '3 días'], ctx);
    expect(awayDates(s, ctx)).toEqual([TODAY, addDaysIso(TODAY, 1), addDaysIso(TODAY, 2)]);
    const marked = applySupport(s, ctx).profile;
    expect(awayDates(s, ctx).every((d) => isRestMarked(marked.restDates, d))).toBe(true);
    expect(marked.restDates).toHaveLength(3);
    expect(applySupport(s, ctx).regenerate).toBe(false);
  });

  it('si hoy ya está entrenado, empiezan mañana', () => {
    const ctx = mkCtx(base(), true);
    const { s } = walk(['Voy a faltar unos días', 'Trabajo o familia', '2 días'], ctx);
    expect(awayDates(s, ctx)).toEqual([addDaysIso(TODAY, 1), addDaysIso(TODAY, 2)]);
    expect(isRestMarked(applySupport(s, ctx).profile.restDates, TODAY)).toBe(false);
  });

  it('no duplica días que ya estaban marcados ni toca los otros', () => {
    const profile = makeProfile({ restDates: ['2026-10-30', TODAY] });
    const ctx = mkCtx(profile);
    const { s } = walk(['Voy a faltar unos días', 'Viajo', '2 días'], ctx);
    expect(applySupport(s, ctx).profile.restDates).toEqual(['2026-10-30', TODAY, addDaysIso(TODAY, 1)]);
  });

  it('enfermo añade el consejo de descansar; con 10 días o más avisa de la rampa de vuelta; con menos no', () => {
    const ctx = mkCtx(base());
    const sick = walk(['Voy a faltar unos días', 'Estoy enfermo', `${RETURN_GAP_MIN_DAYS} días o más`], ctx).s;
    const sum = summarize(sick, ctx);
    expect(sum.fx[0]).toMatch(/Descansa de verdad/);
    expect(sum.fx.join(' ')).toMatch(/rampa de vuelta/);
    expect(sum.done).toMatch(/Mejórate/);
    const short = summarize(walk(['Voy a faltar unos días', 'Viajo', '3 días'], ctx).s, ctx);
    expect(short.fx.join(' ')).not.toMatch(/rampa/);
    expect(short.fx.join(' ')).toMatch(/macrociclo sigue su calendario/);
  });

  it('el título habla de un día o de un rango', () => {
    const ctx = mkCtx(base());
    expect(summarize(walk(['Voy a faltar unos días', 'Viajo', '1 día'], ctx).s, ctx).title).toBe('Descanso 4 nov');
    expect(summarize(walk(['Voy a faltar unos días', 'Viajo', 'Una semana'], ctx).s, ctx).title).toBe('Descanso del 4 nov al 10 nov');
  });
});

describe('Rex para imprevistos: seguridad', () => {
  it('aplicar no muta el perfil que recibe', () => {
    const profile = base();
    const before = JSON.stringify(profile);
    const ctx = mkCtx(profile);
    applySupport(walk(['Me duele algo', 'Rodilla', 'Unos días'], ctx).s, ctx);
    applySupport(walk(['Voy a faltar unos días', 'Viajo', '3 días'], ctx).s, ctx);
    expect(JSON.stringify(profile)).toBe(before);
  });

  it('un estado a medias no está completo', () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete({ kind: 'pain', area: 'rodilla' })).toBe(false);
    expect(isComplete({ kind: 'away', why: 'viaje' })).toBe(false);
    expect(isComplete({ kind: 'today', what: 'rest' })).toBe(true);
  });
});
