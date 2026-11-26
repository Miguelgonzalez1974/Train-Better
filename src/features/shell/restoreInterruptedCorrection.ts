import { athleteRepository } from '../../data/athlete/athleteRepository';
import { recoverPendingCorrection } from '../../data/athlete/pendingCorrection';
import { toast } from '../../lib/toast';

/** Si una corrección quedó a medias, devuelve la sesión como estaba y lo dice. Nunca se llama mientras se pinta una pantalla. */
export function restoreInterruptedCorrection(): void {
  if (recoverPendingCorrection(athleteRepository)) toast.show('La corrección quedó sin guardar: tu sesión vuelve a estar como antes', { tone: 'info', ttlMs: 10000 });
}
