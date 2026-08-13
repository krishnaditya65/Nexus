import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // A deliberately small, high-contrast palette (checked against the
        // 4.5:1 text-contrast rule in docs/FRONTEND_STANDARDS.md) rather
        // than a large ad-hoc one that's easy to drift out of compliance.
        surface: '#0f1117',
        'surface-raised': '#171a23',
        border: '#2a2e3a',
        accent: '#5b8def',
        'accent-hover': '#4a7bdc',
        danger: '#e5484d',
        warn: '#f5a524',
        success: '#3dd68c',
        'text-primary': '#f2f3f5',
        'text-secondary': '#a1a6b3',
      },
    },
  },
  plugins: [],
};
export default config;
