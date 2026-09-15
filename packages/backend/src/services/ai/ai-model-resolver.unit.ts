import { AI_FEATURE } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { hasFeature } from '../entitlements/has-feature';
import { getStoredAiSettings } from '../user-settings/ai-api-key';
import { getFeatureConfig } from '../user-settings/ai-feature-settings';
import { resolveAIConfiguration } from './ai-model-resolver';

jest.mock('../entitlements/has-feature', () => ({ hasFeature: jest.fn() }));
jest.mock('../user-settings/ai-api-key', () => ({
  getStoredAiSettings: jest.fn(),
  decryptStoredApiKey: jest.fn(),
}));
jest.mock('../user-settings/ai-feature-settings', () => ({ getFeatureConfig: jest.fn() }));
jest.mock('../user-settings/ai-custom-endpoint', () => ({
  markCustomEndpointInvalid: jest.fn(),
  readEndpointCredentials: jest.fn(),
}));
jest.mock('@js/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Its default model is a Google one, so GEMINI_API_KEY is what backs the server arm here.
const FEATURE = AI_FEATURE.categorization;
const USER_ID = 1;

const hasFeatureMock = jest.mocked(hasFeature);
const getStoredAiSettingsMock = jest.mocked(getStoredAiSettings);
const getFeatureConfigMock = jest.mocked(getFeatureConfig);

describe('resolveAIConfiguration server-key gating', () => {
  let geminiKeyBeforeTest: string | undefined;

  beforeEach(() => {
    geminiKeyBeforeTest = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'server-key';
    getFeatureConfigMock.mockResolvedValue(null);
    getStoredAiSettingsMock.mockResolvedValue(null);
  });

  afterEach(() => {
    if (geminiKeyBeforeTest === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiKeyBeforeTest;
    jest.resetAllMocks();
  });

  it('leaves the feature unserved when the user lacks operator_ai', async () => {
    hasFeatureMock.mockResolvedValue(false);

    expect(await resolveAIConfiguration({ userId: USER_ID, feature: FEATURE })).toBeNull();
  });

  it('serves the same user from the server key once operator_ai is granted', async () => {
    hasFeatureMock.mockResolvedValue(true);

    expect(await resolveAIConfiguration({ userId: USER_ID, feature: FEATURE })).toMatchObject({
      apiKey: 'server-key',
      usingUserKey: false,
    });
  });
});
