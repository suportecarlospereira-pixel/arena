import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { boxShadow: { glow: '0 0 40px rgba(44,255,160,.12)' } } },
  plugins: [],
} satisfies Config;
