import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kinochy: {
          canvas: '#1c1f20',
          panel: '#171919',
          cyan: '#24c7f4'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
