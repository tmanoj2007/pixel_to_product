/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          500: '#3b6cf6',
          600: '#2553e8',
          700: '#1d40c9',
          800: '#1e379f',
          900: '#14204f',
        },
      },
    },
  },
  plugins: [],
}
