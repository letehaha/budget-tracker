import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';

import pkg from './package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const externalDeps = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`), // for Node.js 18+ compatibility
  ...Object.keys(pkg.dependencies || {}),
  /\.node$/, // native addons
];

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: 'node23',
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/app.ts'),
      formats: ['cjs'],
    },
    rollupOptions: {
      external: externalDeps,
      output: {
        entryFileNames: 'app.js',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  }
});
