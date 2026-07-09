/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          bg: 'rgb(var(--aura-bg) / <alpha-value>)',
          surface: 'rgb(var(--aura-surface) / <alpha-value>)',
          surfaceSoft: 'rgb(var(--aura-surface-soft) / <alpha-value>)',
          border: 'rgb(var(--aura-border) / <alpha-value>)',
          text: 'rgb(var(--aura-text) / <alpha-value>)',
          muted: 'rgb(var(--aura-muted) / <alpha-value>)',
          dim: 'rgb(var(--aura-dim) / <alpha-value>)',
          accent: 'rgb(var(--aura-accent) / <alpha-value>)',
          accentSoft: 'rgb(var(--aura-accent-soft) / <alpha-value>)',
          reveal: 'rgb(var(--aura-reveal) / <alpha-value>)',
          revealSoft: 'rgb(var(--aura-reveal-soft) / <alpha-value>)',
          danger: 'rgb(var(--aura-danger) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        noise:
          "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 38%), linear-gradient(90deg, rgba(148,163,184,0.018) 1px, transparent 1px), linear-gradient(180deg, rgba(148,163,184,0.014) 1px, transparent 1px)",
      },
      boxShadow: {
        none: 'none',
      },
      transitionTimingFunction: {
        aura: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
