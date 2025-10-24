/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 8px 30px rgba(2,6,23,0.08)',
      },
      borderRadius: {
        xl: '12px',
      },
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          dark: '#60a5fa',
        },
        surface: {
          light: '#ffffff',
          dark: '#0f172a',
        },
      },
    },
  },
  plugins: [],
}
