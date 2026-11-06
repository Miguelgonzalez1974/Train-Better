import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recoverFromChunkError, resetAppCache } from '../../lib/chunkError';

interface State {
  error: Error | null;
  /** Se está intentando limpiar la copia guardada y recargar. */
  recovering: boolean;
}

/**
 * La red de seguridad de la app: si algo falla al pintar (o un trozo de la app no se descarga porque el móvil guarda una versión
 * vieja), en vez de dejar la pantalla en blanco enseña qué ha pasado y dos salidas: recargar o limpiar la copia guardada y recargar.
 * Un trozo que no se descarga se recupera solo, una vez, sin que tengas que tocar nada. No toca tus datos.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('La app ha fallado al pintar:', error, info.componentStack);
    if (recoverFromChunkError(error)) this.setState({ recovering: true });
  }

  private reset = () => {
    this.setState({ recovering: true });
    void resetAppCache().finally(() => window.location.reload());
  };

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg px-6 text-center">
        <p className="text-base font-semibold text-white">{recovering ? 'Actualizando la app…' : 'Algo ha fallado al abrir la app'}</p>
        {!recovering && (
          <>
            <p className="max-w-sm text-sm leading-relaxed text-neutral-400">
              Tus datos están a salvo. Prueba a recargar y, si sigue igual, a limpiar la copia guardada de la app: es lo más habitual tras una actualización.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => window.location.reload()} className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark">
                Recargar
              </button>
              <button onClick={this.reset} className="rounded-lg border border-brand-border px-4 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
                Limpiar y recargar
              </button>
            </div>
            <details className="max-w-sm text-left">
              <summary className="cursor-pointer text-center text-xs text-neutral-500">Detalle del error</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/[0.05] p-3 text-[11px] leading-snug text-neutral-300">
                {`${error.name}: ${error.message}\n\nVersión: ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'desconocida'}`}
              </pre>
            </details>
          </>
        )}
      </div>
    );
  }
}
