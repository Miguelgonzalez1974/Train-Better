/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Grotesca de rendimiento para cifras y titulares — el "92 kg", el nombre del día, las etiquetas de bloque.
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Colores resueltos por variable CSS para poder cambiar de tema (oscuro por defecto, claro
        // opcional con [data-theme="light"] en <html>). Los valores viven en `src/index.css`. Solo se
        // redefinen `white` y `neutral 100-600` (casi siempre texto) — el resto de `neutral` y `black`
        // se quedan con el default de Tailwind, que ya funciona en ambos temas.
        white: 'rgb(var(--c-white) / <alpha-value>)',
        neutral: {
          100: 'rgb(var(--c-n-100) / <alpha-value>)',
          200: 'rgb(var(--c-n-200) / <alpha-value>)',
          300: 'rgb(var(--c-n-300) / <alpha-value>)',
          400: 'rgb(var(--c-n-400) / <alpha-value>)',
          500: 'rgb(var(--c-n-500) / <alpha-value>)',
          600: 'rgb(var(--c-n-600) / <alpha-value>)',
        },
        brand: {
          bg: 'rgb(var(--c-brand-bg) / <alpha-value>)',
          surface: 'rgb(var(--c-brand-surface) / <alpha-value>)',
          surfaceMuted: 'rgb(var(--c-brand-surface-muted) / <alpha-value>)',
          border: 'rgb(var(--c-brand-border) / <alpha-value>)',
          orange: { DEFAULT: 'rgb(var(--c-brand-orange) / <alpha-value>)', dark: 'rgb(var(--c-brand-orange-dark) / <alpha-value>)' },
          gold: { DEFAULT: 'rgb(var(--c-brand-gold) / <alpha-value>)', soft: 'rgb(var(--c-brand-gold-soft) / <alpha-value>)' },
          neon: { DEFAULT: 'rgb(var(--c-brand-neon) / <alpha-value>)', soft: 'rgb(var(--c-brand-neon-soft) / <alpha-value>)' },
        },
      },
    },
  },
  plugins: [],
};
