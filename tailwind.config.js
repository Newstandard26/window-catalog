/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // NSR Elite accent — bright sky blue. The whole `brand` ramp maps to it
        // so any brand-* utility renders the accent; 50/100 are dark tints for
        // subtle accent fills, 800 is the hover.
        brand: {
          50: '#0e2a35',
          100: '#123a49',
          200: '#17455a',
          300: '#2aa5d8',
          400: '#51c5f4',
          500: '#51c5f4',
          600: '#51c5f4',
          700: '#51c5f4',
          800: '#38b6e8',
          900: '#2aa5d8',
        },
        // Near-black surfaces for the nav + page-header band.
        ink: {
          DEFAULT: '#0a0a0c',
          700: '#15151a',
          800: '#0a0a0c',
          900: '#000000',
        },
        // Dark theme: the `slate` ramp is inverted so the app's existing
        // text-slate-900 (headings) reads white and bg-slate-50 reads near-black,
        // recoloring every page through tokens instead of per-component edits.
        slate: {
          50: '#0c0c0e',
          100: '#17171b',
          200: '#242428',
          300: '#2e2e33',
          400: '#8a9097',
          500: '#9aa0a6',
          600: '#aeb4ba',
          700: '#d2d5d9',
          800: '#eceef0',
          900: '#ffffff',
          950: '#ffffff',
        },
      },
      maxWidth: {
        // Full-width layout with comfortable gutters, capped so text lines stay
        // readable on ultra-wide monitors (~1536px = Tailwind's 2xl).
        content: '1536px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        'card-hover': '0 8px 24px -8px rgb(15 23 42 / 0.18)',
      },
    },
  },
  plugins: [],
}
