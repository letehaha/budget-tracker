import { AI_NATIVE_PROVIDERS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { createProviderModel } from './ai-client-factory';

describe('createProviderModel', () => {
  it.each(AI_NATIVE_PROVIDERS)('refuses to build a %s client without a key', (provider) => {
    expect(() => createProviderModel({ provider, model: 'x', apiKey: '' })).toThrow();
  });
});
