/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0a0908',
          surface: '#171310',
          surfaceMuted: '#1f1a15',
          border: '#2a2420',
          orange: { DEFAULT: '#f97316', dark: '#c2410c' },
          gold: { DEFAULT: '#d4af37', soft: '#e9cf7a' },
          neon: { DEFAULT: '#39ff14', soft: '#8dff6b' },
        },
      },
    },
  },
  plugins: [],
};
