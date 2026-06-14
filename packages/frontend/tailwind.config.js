/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          inverse: 'var(--surface-inverse)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--border-radius-sm)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
        xl: 'var(--border-radius-xl)',
      },
      boxShadow: {
        soft: 'var(--shadow-sm)',
        card: 'var(--shadow-md)',
        dropdown: 'var(--shadow-lg)',
        modal: 'var(--shadow-xl)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-in-left': 'slideInLeft 0.3s ease forwards',
        'slide-in-right': 'slideInRight 0.3s ease forwards',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed-width)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
