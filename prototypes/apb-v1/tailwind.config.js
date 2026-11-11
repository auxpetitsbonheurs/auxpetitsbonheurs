/** @type {import('tailwindcss').Config} */
// D4 · Honey & cream (brand guide v0.2). Values mirror docs/design/tokens.json and src/app/app.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FAF5EC', dark: '#F1E3C8' }, // page background, soft band
        paper: '#FFFDF8', // cards, text on honey buttons
        ink: { DEFAULT: '#3A2A1C', soft: '#5E4C3A', line: '#8C7862' }, // text, muted text, input borders (>= 3:1)
        honey: {
          100: '#F7ECD9', 200: '#F1E3C8', 300: '#EFDDBD',
          600: '#8C5A1E', 700: '#7D4F17', 800: '#5C390F',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Libre Caslon Display"', 'ui-serif', 'Georgia', 'serif'],
        subhead: ['"Libre Caslon Text"', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: { card: '14px', photo: '10px', band: '16px' },
      boxShadow: { soft: '0 1px 2px 0 #3a2a1c0f' }, // shadow.sm token: no heavy shadows
    },
  },
  plugins: [],
}
