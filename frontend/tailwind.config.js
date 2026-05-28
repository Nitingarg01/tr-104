/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#2e5bff', 600: '#1d4ed8' },
        secondary: { DEFAULT: '#8b5cf6', 600: '#7c3aed' },
        emerald: { DEFAULT: '#10b981', 600: '#059669' },
        danger: { DEFAULT: '#ef4444', 600: '#dc2626' },
        warning: { DEFAULT: '#f59e0b', 600: '#d97706' },
        surface: {
          DEFAULT: '#0b1326',
          panel: '#0f172a',
          container: '#171f33',
          elevated: '#1e293b',
          highest: '#2d3449',
        },
      },
      boxShadow: {
        'md-soft': '0 8px 24px rgba(0,0,0,.5)',
        'glow-blue': '0 0 0 3px rgba(46, 91, 255, 0.2)',
      },
      borderRadius: {
        '4': '4px',
        '8': '8px',
        '12': '12px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      spacing: {
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
      }
    }
  },
  plugins: [],
}
