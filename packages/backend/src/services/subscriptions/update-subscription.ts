import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, SubscriptionMatchingRules } from '@bt/shared/types';
import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow, validateAccountOwnership, validateCategoryOwnership } from './helpers';

export interface UpdateSubscriptionParams {
  id: string;
  userId: number;
  name?: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES;
  startDate?: string;
  endDate?: string | null;
  accountId?: number | null;
  categoryId?: number | null;
  matchingRules?: SubscriptionMatchingRules;
  isActive?: boolean;
  notes?: string | null;
}

export const updateSubscription = withTransaction(async ({ id, userId, ...fields }: UpdateSubscriptionParams) => {
  const subscription = await findSubscriptionOrThrow({ id, userId });

  if (fields.accountId !== undefined && fields.accountId !== null) {
    await validateAccountOwnership({ accountId: fields.accountId, userId });
  }

  if (fields.categoryId !== undefined && fields.categoryId !== null) {
    await validateCategoryOwnership({ categoryId: fields.categoryId, userId });
  }

  await subscription.update(fields);

  return subscription.toJSON();
});
