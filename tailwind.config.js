/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // CSS variable mappings (shadcn/ui convention)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        // Activity type palette
        strength: { DEFAULT: '#3b82f6', soft: '#3b82f620' },
        cardio:   { DEFAULT: '#f97316', soft: '#f9731620' },
        mobility: { DEFAULT: '#a855f7', soft: '#a855f720' },
        sport:    { DEFAULT: '#22c55e', soft: '#22c55e20' },
        pr:       { DEFAULT: '#fbbf24', soft: '#fbbf2420' },
      },
    },
  },
  plugins: [],
};

