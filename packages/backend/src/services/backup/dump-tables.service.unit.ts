import { i18nextReady, t } from '@i18n/index';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { stripConnectionKeys } from './dump-tables.service';

describe('stripConnectionKeys', () => {
  beforeAll(async () => {
    await i18nextReady;
  });

  const keyless = { id: 'c1', provider: 'custom', name: 'Ollama', baseUrl: 'http://ollama:11434/v1', status: 'valid' };
  const keyed = { id: 'c2', provider: 'anthropic', name: 'Claude', keyEncrypted: 'cipher', status: 'valid' };

  it('keeps keyless connections, invalidates keyed ones in the settings locale, and drops legacy keys', () => {
    const result = stripConnectionKeys({
      settings: {
        locale: 'uk',
        ai: {
          connections: [keyless, keyed],
          apiKeys: [{ provider: 'openai', keyEncrypted: 'legacy-cipher' }],
          customEndpoints: [{ id: 'e1', keyEncrypted: 'legacy-cipher' }],
        },
      },
    }) as { ai: Record<string, unknown> & { connections: Record<string, unknown>[] } };

    const lastError = t({ key: 'ai.connectionKeyNotInBackup', locale: 'uk' });
    expect(lastError).not.toBe(t({ key: 'ai.connectionKeyNotInBackup', locale: 'en' }));
    expect(result.ai).toEqual({
      connections: [
        keyless,
        {
          id: 'c2',
          provider: 'anthropic',
          name: 'Claude',
          status: 'invalid',
          invalidatedAt: expect.any(String),
          lastError,
        },
      ],
    });
  });

  it('drops the ai block when connections is not an array', () => {
    expect(stripConnectionKeys({ settings: { locale: 'en', ai: { connections: { c2: keyed } } } })).toEqual({
      locale: 'en',
    });
  });

  it('returns non-object input as is', () => {
    expect(stripConnectionKeys({ settings: null })).toBeNull();
    expect(stripConnectionKeys({ settings: 'oops' })).toBe('oops');
    const aiArray = { ai: [] };
    expect(stripConnectionKeys({ settings: aiArray })).toBe(aiArray);
  });
});
