import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import path from 'path';
import tailwind from 'tailwindcss';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import svgLoader from 'vite-svg-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, path.resolve(__dirname, '../../'), '') };

  return defineConfig({
    plugins: [vue(), svgLoader()],
    server: {
      port: process.env.PORT,
      host: process.env.HOST,
    },
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
        plugins: [tailwind(), autoprefixer()],
      },
      preprocessorOptions: {
        scss: {
          additionalData: '@import "./src/styles/resources/index.scss";',
        },
      },
    },
  });
};
