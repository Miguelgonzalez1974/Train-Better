import { RexCorner, type LabSection } from './RexCorner';
import type { AskAnswer } from './rexAsk';
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
  ask,
  lab,
  examples,
  hints,
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
  /** La caja de RexLab de esta pantalla, sus atajos y sus opciones. */
  ask?: (text: string) => AskAnswer | 'close';
  lab?: LabSection[];
  examples?: readonly string[];
  /** Frases que Rex entiende en esta pantalla y que no tienen botón: rotan en el hueco de la caja. */
  hints?: readonly string[];
}) {
  const suggestion: RexSuggestion = { id, priority: 50, lead, text: `${lead} ${text}`, tone, mood, actions, dismissible: false };
  return (
    <RexCorner
      speak={false}
      ask={ask}
      lab={lab}
      examples={examples}
      hints={hints}
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
