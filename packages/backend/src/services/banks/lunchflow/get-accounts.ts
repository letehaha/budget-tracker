import { API_ERROR_CODES } from '@bt/shared/types';
import { NotFoundError, UnexpectedError } from '@js/errors';
import * as userSettingsService from '@services/user-settings.service';

import { LunchFlowApiClient } from './api-client';

interface GetAccountsParams {
  userId: number;
}

export const getAccounts = async ({ userId }: GetAccountsParams) => {
  const encryptedToken = await userSettingsService.getEncryptedLunchFlowApiToken(userId);

  if (!encryptedToken) {
    throw new NotFoundError({
      message: 'No Lunch Flow API key found. Please connect your account first.',
      code: API_ERROR_CODES.notFound,
    });
  }

  try {
    const client = new LunchFlowApiClient(encryptedToken);
    const { accounts } = await client.getAccounts();

    return { accounts };
  } catch (error) {
    throw new UnexpectedError(API_ERROR_CODES.unexpected, 'Failed to fetch accounts from Lunch Flow');
  }
};
