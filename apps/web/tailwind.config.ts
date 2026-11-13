import type { Config } from 'tailwindcss'

export default {
  // O `dist` do pacote entra no scan: as classes das bolhas, do composer e das linhas da inbox só
  // existem lá, e sem isto o Tailwind não gera nenhuma delas. Os dois caminhos porque o `file:`
  // resolve na raiz do monorepo ou aqui, conforme quem instalou.
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@adatechnology/conversations-ui/dist/**/*.js',
    '../../node_modules/@adatechnology/conversations-ui/dist/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // A cor de cada restaurante entra por variável CSS (src/lib/branding.ts): nada de cor de
        // marca fixa aqui, para o mesmo build servir qualquer restaurante.
        brand: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700].map((shade) => [shade, `rgb(var(--brand-${shade}) / <alpha-value>)`])
        ),
      },
    },
  },
  plugins: [],
} satisfies Config
