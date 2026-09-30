import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import { isTranslation } from './src/lib/i18n-coverage.mjs';

export default defineConfig({
  site: 'https://multipliedtwice.github.io',
  base: '/prisma-sql',
  outDir: '../docs',
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return !pathname.includes('/404') && isTranslation(pathname);
      },
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['ar', 'bn', 'en', 'es', 'fr', 'hi', 'pt', 'ru', 'ur', 'zh'],
    routing: {
      prefixDefaultLocale: false
    }
  }
});
