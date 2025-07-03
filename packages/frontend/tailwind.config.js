const animate = require('tailwindcss-animate');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  safelist: ['dark'],

  content: [
    './pages/**/*.{ts,tsx,vue}',
    './components/**/*.{ts,tsx,vue}',
    './app/**/*.{ts,tsx,vue}',
    './src/**/*.{ts,tsx,vue}',
  ],

  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'rgba(var(--border), <alpha-value>)',
        input: 'rgba(var(--input), <alpha-value>)',
        ring: 'rgba(var(--ring), <alpha-value>)',
        background: 'rgba(var(--background), <alpha-value>)',
        foreground: 'rgba(var(--foreground), <alpha-value>)',
        'base-text': 'rgba(var(--base-text), <alpha-value>)',
        'error-message': 'rgba(var(--error-message), <alpha-value>)',
        primary: {
          DEFAULT: 'rgba(var(--primary), <alpha-value>)',
          foreground: 'rgba(var(--primary-foreground), <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgba(var(--secondary), <alpha-value>)',
          foreground: 'rgba(var(--secondary-foreground), <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgba(var(--destructive), <alpha-value>)',
          foreground: 'rgba(var(--destructive-foreground), <alpha-value>)',
          text: 'rgba(var(--destructive-text), <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgba(var(--muted), <alpha-value>)',
          foreground: 'rgba(var(--muted-foreground), <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgba(var(--accent), <alpha-value>)',
          foreground: 'rgba(var(--accent-foreground), <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgba(var(--popover), <alpha-value>)',
          foreground: 'rgba(var(--popover-foreground), <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgba(var(--card), <alpha-value>)',
          foreground: 'rgba(var(--card-foreground), <alpha-value>)',
        },
        'card-tooltip': {
          DEFAULT: 'rgba(var(--card-tooltip), <alpha-value>)',
          foreground: 'rgba(var(--card-tooltip-foreground), <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgba(var(--success), <alpha-value>)',
          foreground: 'rgba(var(--base-text), <alpha-value>)',
        },
        warning: 'rgba(230, 126, 34, <alpha-value>)',
        'app-income-color': '#2ecc71',
        'app-expense-color': '#e74c3c',
        'app-transfer-color': '#95a5a6',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      screens: {
        xxs: '390px',
        xs: '550px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'collapsible-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-in-out',
        'collapsible-up': 'collapsible-up 0.2s ease-in-out',
      },
      boxShadow: {
        header: '0 0 10px 2px rgba(0, 0, 0, 0.1)',
      },
      zIndex: {
        'over-default': 1,
        modal: 10,
        notifications: 51,
      }
    },
  },
  plugins: [animate, require('@tailwindcss/container-queries')],
};
