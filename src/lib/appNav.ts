import type { TabId } from '../features/shell/navItems';

/**
 * El cambio de pestaña de la app, al alcance de cualquier pantalla (RexLab lo usa para llevarte a donde pides: «ve a nutrición», «he comido…»).
 * `App` registra aquí cómo cambiar de pestaña al montarse; quien no lo necesita no lo toca. Sin React ni estado propio.
 */
type Go = (tab: TabId) => void;

let go: Go | null = null;

export const appNav = {
  /** Lo llama `App` al montarse; devuelve cómo deshacerlo. */
  register(fn: Go): () => void {
    go = fn;
    return () => {
      if (go === fn) go = null;
    };
  },
  /** Cambia de pestaña. Devuelve false si todavía no hay nadie que lo haga (p. ej. en un test). */
  goTo(tab: TabId): boolean {
    if (!go) return false;
    go(tab);
    return true;
  },
};
