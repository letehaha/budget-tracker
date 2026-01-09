import { sentryVitePlugin } from '@sentry/vite-plugin';
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
export default ({ mode }) => {
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

  return defineConfig({
    plugins: [
      vue(),
      tailwind(),
      svgLoader(),
      sentryEnabled &&
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
    ].filter(Boolean),
    build: {
      sourcemap: true,
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
