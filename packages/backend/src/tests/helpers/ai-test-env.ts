import { afterEach, beforeEach } from '@jest/globals';

/** Providers the model resolver reads server-side keys for. */
const SERVER_KEY_ENV_VARS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'] as const;

/**
 * Registers hooks that run every test in the suite as a self-hosted instance with no
 * server-side AI keys, restoring the environment afterwards. Two things at once, because
 * custom-endpoint suites need both: the mock endpoints live on hosts that never resolve,
 * so the outbound guard must stand down (self-host), and a server key would answer the
 * feature from the resolver's ladder before the endpoint under test is ever dialled.
 *
 * Call inside a `describe`, before the tests.
 */
export function useSelfHostWithoutServerAiKeys(): void {
  let selfHostFlagBeforeTest: string | undefined;
  const serverKeysBeforeTest = new Map<string, string | undefined>();

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;
    process.env.IS_SELF_HOST = 'true';

    for (const envVar of SERVER_KEY_ENV_VARS) {
      serverKeysBeforeTest.set(envVar, process.env[envVar]);
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    if (selfHostFlagBeforeTest === undefined) {
      delete process.env.IS_SELF_HOST;
    } else {
      process.env.IS_SELF_HOST = selfHostFlagBeforeTest;
    }

    for (const envVar of SERVER_KEY_ENV_VARS) {
      const keyBeforeTest = serverKeysBeforeTest.get(envVar);

      if (keyBeforeTest === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = keyBeforeTest;
      }
    }
  });
}
