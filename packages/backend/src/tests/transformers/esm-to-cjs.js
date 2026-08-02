/**
 * Jest runs the backend as CommonJS, and `mdb-reader` — the Access/Money file
 * reader behind the .mny importer — is published as ESM only, so Jest's module
 * runtime dies on its first `export` keyword. This compiles the package down to
 * CommonJS so tests exercise the real reader rather than a stub.
 *
 * ts-jest cannot do this job: it compiles through a language service scoped to
 * the backend's tsconfig program, which emits nothing for files outside `src/`.
 *
 * Paired with `transformIgnorePatterns` in `jest.config.base.ts`, which decides
 * which node_modules packages reach this transformer.
 */
const crypto = require('node:crypto');
const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText, {
      fileName: sourcePath,
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
    return crypto.createHash('sha1').update(sourceText).update(sourcePath).digest('hex');
  },
};
