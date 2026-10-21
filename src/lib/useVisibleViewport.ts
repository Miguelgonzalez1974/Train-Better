import { useEffect, useState, type CSSProperties } from 'react';

/**
 * La zona que el atleta ve de verdad (`visualViewport`): en el móvil la ventana "layout" puede ser más grande que la
 * pantalla (una barra del navegador, una página que se ensancha, el zoom), y una capa `fixed inset-0` se pinta del
 * tamaño de esa ventana grande: su cabecera y su pie quedan fuera de lo visible. Con esto la capa se ajusta a lo visible.
 * Sin `visualViewport` (navegadores viejos) devuelve null y la capa se queda con `inset-0`.
 */
export function useVisibleViewport(): CSSProperties | null {
  const [box, setBox] = useState<CSSProperties | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setBox({ top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height, right: 'auto', bottom: 'auto' });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return box;
}
