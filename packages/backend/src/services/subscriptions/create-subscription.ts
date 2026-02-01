import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, SubscriptionMatchingRules } from '@bt/shared/types';
import Subscriptions from '@models/Subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';

import { validateAccountOwnership, validateCategoryOwnership } from './helpers';

export interface CreateSubscriptionParams {
  userId: number;
  name: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: string;
  endDate?: string | null;
  accountId?: number | null;
  categoryId?: number | null;
  matchingRules?: SubscriptionMatchingRules;
  notes?: string | null;
}

export const createSubscription = withTransaction(
  async ({
    userId,
    accountId = null,
    categoryId = null,
    matchingRules = { rules: [] },
    expectedAmount = null,
    expectedCurrencyCode = null,
    endDate = null,
    notes = null,
    ...rest
  }: CreateSubscriptionParams) => {
    if (accountId) {
      await validateAccountOwnership({ accountId, userId });
    }

    if (categoryId) {
      await validateCategoryOwnership({ categoryId, userId });
    }

    const subscription = await Subscriptions.create({
      userId,
      accountId,
      categoryId,
      matchingRules,
      expectedAmount,
      expectedCurrencyCode,
      endDate,
      notes,
      ...rest,
    });

    return subscription.toJSON();
  },
);
