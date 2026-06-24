import {
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_TYPES,
  SubscriptionMatchingRules,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow, validateAccountOwnership, validateCategoryOwnership } from './helpers';

interface UpdateSubscriptionParams {
  id: string;
  userId: number;
  name?: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES;
  startDate?: string;
  endDate?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  matchingRules?: SubscriptionMatchingRules;
  isActive?: boolean;
  notes?: string | null;
  dueDate?: string | null;
  maxOccurrences?: number | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
}

export const updateSubscription = withTransaction(async ({ id, userId, ...fields }: UpdateSubscriptionParams) => {
  const subscription = await findSubscriptionOrThrow({ id, userId });

  if (fields.accountId !== undefined && fields.accountId !== null) {
    await validateAccountOwnership({ accountId: fields.accountId, userId });
  }

  if (fields.categoryId !== undefined && fields.categoryId !== null) {
    await validateCategoryOwnership({ categoryId: fields.categoryId, userId });
  }

  // The API exchanges decimals; the column stores raw cents (no Money getter).
  // Only touch the field when the caller actually sent it, so omitting it leaves
  // the stored amount unchanged. `null` clears the amount.
  if (fields.expectedAmount !== undefined) {
    fields = {
      ...fields,
      expectedAmount: fields.expectedAmount != null ? Money.fromDecimal(fields.expectedAmount).toCents() : null,
    };
  }

  // When a dueDate is being set (not cleared), derive anchorDay so recurring
  // logic can use the calendar day without reparsing the date string.
  if (fields.dueDate != null) {
    fields = { ...fields, anchorDay: new Date(fields.dueDate + 'T00:00:00Z').getUTCDate() } as typeof fields & {
      anchorDay: number;
    };
  }

  await subscription.update(fields);

  // If a dueDate was introduced on a subscription that had no upcoming period,
  // create the first one. Guard against duplicates by checking first.
  if (fields.dueDate != null) {
    const existingUpcoming = await SubscriptionPeriods.findOne({
      where: { subscriptionId: id, status: SUBSCRIPTION_PERIOD_STATUSES.upcoming },
    });

    if (!existingUpcoming) {
      await SubscriptionPeriods.create({
        subscriptionId: id,
        dueDate: fields.dueDate,
        status: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
      });
    }
  }

  // Surface expectedAmount as a decimal so the response matches GET (the
  // column holds raw cents).
  const plain = subscription.toJSON() as Subscriptions;
  return {
    ...plain,
    expectedAmount: plain.expectedAmount != null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
  };
});
