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
        // Fixes default import issues
        // Initially was added to resolve issues with `p-queue` import
        // Without this setting the "import PQueue from 'p-queue';" works incorrectly
        // in the way that PQueue doesn't become a constructor, but an object that contains
        // .default field. TS wasn't able to spot this, so it caused errors in production
        interop: 'auto',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    // Disable minifaction to keep logs readable and prevent Sequelize class-based
    // relations being corrupted by obfuscation
    minify: false,
  },
});
