import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const KEY = 'train-better:theme';

function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* almacenamiento no disponible — el tema vive solo esta sesión */
  }
}

/**
 * Botón sol/luna — alterna tema claro/oscuro y lo recuerda por navegador. Oscuro es el defecto. El icono enseña a lo que vas a cambiar:
 * la luna en el tema claro y el sol en el oscuro.
 */
export function ThemeToggle({ className = '', round = false }: { className?: string; /** El círculo pequeño del Dashboard: discreto a la vista y con una zona de toque más grande. */ round?: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };
  const title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  const Icon = theme === 'dark' ? Sun : Moon;
  if (round) {
    return (
      <button onClick={toggle} title={title} aria-label={title} data-testid="theme-quick" className={`group flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${className}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-neutral-400 transition-colors duration-200 group-hover:border-white/35 group-hover:text-white">
          <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={toggle}
      title={title}
      aria-label="Cambiar tema"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold ${className}`}
    >
      <Icon size={16} strokeWidth={2.25} />
    </button>
  );
}
