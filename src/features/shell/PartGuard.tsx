import { Component, type ReactNode } from 'react';

/**
 * La red de una parte de la pantalla: si pintarla fallara (un dato guardado inesperado), en su sitio queda `fallback` y el resto sigue funcionando.
 * `name` sale en la consola para saber qué parte fue.
 */
export class PartGuard extends Component<{ name: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error(`No se pudo pintar ${this.props.name}:`, error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
