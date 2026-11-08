import { RexCorner } from './RexCorner';
import type { RexAction, RexSuggestion, RexTarget } from './rexDashboard';

/**
 * El Rex de las pantallas que no llevan su propia cola de sugerencias (Nutrición, Objetivos, Planificación sin sesión): el mismo Rex, en el
 * mismo sitio y con el mismo globo fijo plegable, con una frase y, si hace falta, un botón. Dentro de RexLab solo enseña esa frase y su
 * botón; el lab propio de cada pantalla llegará aparte.
 */
export function ScreenRex({
  id,
  lead,
  text,
  tone = 'info',
  mood = 'idle',
  stats = null,
  actions = [],
  onAction,
}: {
  id: string;
  lead: string;
  text: string;
  tone?: NonNullable<RexSuggestion['tone']>;
  mood?: RexSuggestion['mood'];
  /** Una línea de cifras bajo la frase. */
  stats?: string | null;
  actions?: RexAction[];
  onAction?: (target: RexTarget) => void;
}) {
  const suggestion: RexSuggestion = { id, priority: 50, lead, text: `${lead} ${text}`, tone, mood, actions, dismissible: false };
  return (
    <RexCorner
      speak={false}
      modules={false}
      showDate={false}
      dock={{ stats }}
      suggestion={suggestion}
      waiting={0}
      typedAlready
      badges={{}}
      dots={[]}
      onAction={onAction ?? (() => undefined)}
      onDismiss={() => undefined}
      onNext={() => undefined}
      onTyped={() => undefined}
    />
  );
}
