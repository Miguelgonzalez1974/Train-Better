import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    // El centrado vertical va con margen automatico (`sm:my-auto`) y no con `items-center`: con `items-center`, un
    // contenido mas alto que la ventana se centraba y su parte de arriba quedaba fuera de pantalla e inalcanzable
    // (el scroll no llega a un desbordamiento por arriba). Con margen automatico, si cabe se centra y si no, arranca arriba.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm sm:pt-4">
      <button aria-label="Cerrar" onClick={onClose} className="fixed inset-0 cursor-default" />
      <div className="card relative w-full max-w-lg p-5 sm:my-auto">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-semibold tracking-tight text-white">{title}</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors duration-200 hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
