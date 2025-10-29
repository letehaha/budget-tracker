import { API_ERROR_CODES } from '@bt/shared/types';
import { encryptToken } from '@common/utils/encryption';
import { ValidationError } from '@js/errors';
import * as userSettingsService from '@services/user-settings.service';

import { LunchFlowApiClient } from './api-client';

interface StoreApiKeyParams {
  userId: number;
  apiKey: string;
}

export const storeApiKey = async ({ userId, apiKey }: StoreApiKeyParams) => {
  // Test the API key by making a request
  try {
    const encryptedKey = encryptToken(apiKey);
    const client = new LunchFlowApiClient(encryptedKey);
    await client.getAccounts(); // Verify it works
  } catch (error) {
    throw new ValidationError({
      message: 'Invalid API key or Lunch Flow API error',
      code: API_ERROR_CODES.BadRequest,
    });
  }

  await userSettingsService.storeLunchFlowApiToken(userId, apiKey);

  return {
    message: 'API key stored successfully',
  };
};
