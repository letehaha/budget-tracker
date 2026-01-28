import tailwind from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import svgLoader from 'vite-svg-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default async ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, path.resolve(__dirname, '../../'), '') };

  const certPath = path.resolve(__dirname, '../../docker/dev/certs/cert.pem');
  const keyPath = path.resolve(__dirname, '../../docker/dev/certs/key.pem');

  // Only enable HTTPS if certs exist (skip on CI)
  const httpsConfig =
    fs.existsSync(certPath) && fs.existsSync(keyPath)
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined;

  const serverConfig = {
    port: process.env.PORT,
    host: process.env.HOST,
    ...(httpsConfig && { https: httpsConfig }),
    hmr: process.env.HMR_HOST ? { host: process.env.HMR_HOST } : true,
  };

  // Only add Sentry plugin in production build when auth token is available
  const sentryEnabled = mode === 'production' && process.env.SENTRY_AUTH_TOKEN;

  // Dynamically import Sentry plugin only when needed
  let sentryPlugin = null;
  if (sentryEnabled) {
    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    sentryPlugin = sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    });
  }

  // Configure prerender plugin for static pages (landing, legal pages)
  // Only prerender when ENABLE_PRERENDER=true (set in Docker build where Chrome is available)
  // This prevents CI builds from failing when Chrome/Puppeteer isn't installed
  let prerenderPlugin = null;
  if (mode === 'production' && process.env.ENABLE_PRERENDER === 'true') {
    const [{ default: prerender }, { default: PuppeteerRenderer }] = await Promise.all([
      import('@prerenderer/rollup-plugin'),
      import('@prerenderer/renderer-puppeteer'),
    ]);
    prerenderPlugin = prerender({
      routes: ['/', '/privacy-policy', '/terms-of-use'],
      renderer: new PuppeteerRenderer({
        // Wait 3 seconds for Vue to render the page
        // This is more reliable than waiting for a custom event
        renderAfterTime: 3000,
        timeout: 60000,
        headless: true,
      }),
    });
  }

  return defineConfig({
    plugins: [vue(), tailwind(), svgLoader(), sentryPlugin, prerenderPlugin].filter(Boolean),
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          // Split large vendor libraries into separate chunks
          manualChunks: {
            // Analytics - can be deferred
            posthog: ['posthog-js'],
            // Error tracking - separate but still loaded early
            sentry: ['@sentry/vue'],
          },
        },
      },
    },
    server: serverConfig,
    resolve: {
      alias: [
        {
          find: '@',
          replacement: path.resolve(__dirname, 'src'),
        },
        {
          find: '@bt/shared',
          replacement: path.resolve(__dirname, '../shared/src'),
        },
        {
          find: '@tests',
          replacement: path.resolve(__dirname, 'tests'),
        },
      ],
    },
    test: {
      globals: true,
      include: ['src/**/?(*.)+(spec|test).[jt]s?(x)'],
      environment: 'jsdom',
      watch: false,
    },
    css: {
      postcss: {
        plugins: [autoprefixer()],
      },
    },
  });
};
