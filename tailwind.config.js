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
        brand: {
          bg: '#0a0908',
          surface: '#171310',
          surfaceMuted: '#1f1a15',
          border: '#2a2420',
          orange: { DEFAULT: '#f97316', dark: '#c2410c' },
          gold: { DEFAULT: '#d4af37', soft: '#e9cf7a' },
          // Verde "hecho / vivo" — antes era neón puro (#39ff14) y chillaba en cada pantalla.
          neon: { DEFAULT: '#4ade80', soft: '#86efac' },
        },
      },
    },
  },
  plugins: [],
};
