/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // NSR brand blue — matches Estimator buttons / Catalog accents
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Dark slate used on the top nav + page headers (Catalog hero)
        ink: {
          DEFAULT: '#1e293b',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      maxWidth: {
        content: '1200px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        'card-hover': '0 8px 24px -8px rgb(15 23 42 / 0.18)',
      },
    },
  },
  plugins: [],
}
