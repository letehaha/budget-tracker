import sitemap from '@astrojs/sitemap';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://moneymatter.app',
  trailingSlash: 'never',
  integrations: [
    vue(),
    sitemap({
      // Legal pages render <meta name="robots" content="noindex"> via legal-layout.
      // Sitemaps must only contain canonical, indexable URLs (Google docs).
      filter: (page) => !page.includes('/privacy-policy') && !page.includes('/terms-of-use'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    envDir: '../../',
    envPrefix: 'VITE_',
  },
});
