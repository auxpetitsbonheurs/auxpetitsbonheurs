/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FFF8F0', dark: '#F7EBDD' },
        ink: { DEFAULT: '#3B2F2F', soft: '#6F6060' },
        rose: {
          50: '#FFF3F5', 100: '#FDE4E9', 200: '#F8CBD4', 300: '#F2A8B6',
          400: '#E88598', 500: '#D96A80', 600: '#B94762', 700: '#99344E',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces Variable"', 'Georgia', 'serif'],
      },
      boxShadow: { soft: '0 2px 14px rgba(120, 70, 60, 0.10)' },
    },
  },
  plugins: [],
}
