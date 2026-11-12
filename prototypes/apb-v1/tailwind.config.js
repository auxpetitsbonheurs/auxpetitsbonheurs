/** @type {import('tailwindcss').Config} */
// Brand v0.3 · burgundy (Cherry Tart), cream (Creme brulee) & antique gold (2026-11-12). Values mirror docs/design/tokens.json and src/app/app.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FBF3E8', dark: '#F6EAD8', muted: '#EBD3BE', logo: '#FCEAD8' }, // page, soft cream band, muted text on burgundy
        paper: '#FFFBF5', // cards, text on burgundy buttons
        ink: { DEFAULT: '#3B1512', soft: '#6E4A44', line: '#8C6E66' }, // text, muted text, input borders (>= 3:1)
        wine: {
          100: '#F3E2D0', 200: '#EAD6BC', 300: '#EFDCC6', // selected surface, hairline, image placeholder (never text)
          600: '#660C0C', 700: '#520909', 800: '#3D0707', // bands/buttons/focus, links/hover, link hover
        },
        gold: { DEFAULT: '#BA8430', light: '#E2B66E' }, // DEFAULT: decorative hairlines only; light: text/badge on burgundy (6.4:1)
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
        subhead: ['"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: { card: '14px', photo: '10px', band: '16px' },
      boxShadow: { soft: '0 1px 2px 0 #3b15120f' }, // shadow.sm token: no heavy shadows
    },
  },
  plugins: [],
}
