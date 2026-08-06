/**
 * Jest runs the backend as CommonJS, so ESM-only dependencies — `mdb-reader`
 * (the Access/Money file reader behind the .mny importer) and `unpdf`'s pdf.js
 * bundle — die on their first `export` keyword or `await import()`. This compiles
 * them down to CommonJS so tests exercise the real libraries rather than stubs.
 *
 * ts-jest cannot do this job: it compiles through a language service scoped to
 * the backend's tsconfig program, which emits nothing for files outside `src/`.
 *
 * Paired with `transformIgnorePatterns` in `jest.config.base.ts`, which decides
 * which node_modules packages reach this transformer.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');

/** Any change here must invalidate Jest's transform cache. */
const TRANSFORMER_SOURCE = fs.readFileSync(__filename, 'utf8');

/** TypeScript keeps `.mjs` files as ESM whatever `module` says, so lie about the extension. */
const asCommonJsFileName = (sourcePath) => sourcePath.replace(/\.(mjs|cjs)$/, '.js');

/** `import.meta` is a syntax error in CommonJS; the CJS equivalent of its `url`. */
const IMPORT_META_URL_REPLACEMENT = 'require("node:url").pathToFileURL(__filename).href';

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText.replaceAll('import.meta.url', IMPORT_META_URL_REPLACEMENT), {
      fileName: asCommonJsFileName(sourcePath),
      compilerOptions: {
        allowJs: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });

    return { code: outputText };
  },
  getCacheKey(sourceText, sourcePath) {
    return crypto.createHash('sha1').update(sourceText).update(sourcePath).update(TRANSFORMER_SOURCE).digest('hex');
  },
};
