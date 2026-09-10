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

/** Botón sol/luna — alterna tema claro/oscuro y lo recuerda por navegador. Oscuro es el defecto. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-label="Cambiar tema"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold ${className}`}
    >
      {theme === 'dark' ? <Sun size={16} strokeWidth={2.25} /> : <Moon size={16} strokeWidth={2.25} />}
    </button>
  );
}
