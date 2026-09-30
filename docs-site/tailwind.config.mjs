/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './src/**/*.astro',
  ],
  safelist: ['bg-gray-400'],
  theme: {
    extend: {
      colors: {
        primary: '#0C344B',
        accent: '#1D7A57',
        paper: '#EEF1EC',
        'paper-2': '#E2E8E1',
        ink: '#0C344B',
        'ink-deep': '#072536',
        fog: '#53677A',
        line: '#C3CEC9',
        amber: '#F2A900',
        pine: '#1D7A57',
        ochre: '#9A6200',
        steel: '#3B6E8F',
        oxide: '#B23E2A',
      },
      fontFamily: {
        sans: [
          '"Bricolage Grotesque Variable"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono Variable"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      maxWidth: {
        page: '78rem',
      },
    },
  },
  plugins: [],
}
