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

import { validateAccountOwnership, validateCategoryOwnership } from './helpers';

interface CreateSubscriptionParams {
  userId: number;
  name: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: string;
  endDate?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  matchingRules?: SubscriptionMatchingRules;
  notes?: string | null;
  dueDate?: string | null;
  maxOccurrences?: number | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
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
    dueDate = null,
    ...rest
  }: CreateSubscriptionParams) => {
    if (accountId) {
      await validateAccountOwnership({ accountId, userId });
    }

    if (categoryId) {
      await validateCategoryOwnership({ categoryId, userId });
    }

    // Derive the calendar day from dueDate so recurring logic can anchor
    // future periods to the same day-of-month without reparsing the date.
    const anchorDay = dueDate ? new Date(dueDate + 'T00:00:00Z').getUTCDate() : null;

    // The API exchanges decimals; the column stores raw cents (no Money getter).
    const expectedAmountCents = expectedAmount != null ? Money.fromDecimal(expectedAmount).toCents() : null;

    const subscription = await Subscriptions.create({
      userId,
      accountId,
      categoryId,
      matchingRules,
      expectedAmount: expectedAmountCents,
      expectedCurrencyCode,
      endDate,
      notes,
      dueDate,
      anchorDay,
      ...rest,
    });

    // When a dueDate is provided, create the first upcoming period so the
    // subscription immediately has a trackable payment target.
    if (dueDate) {
      await SubscriptionPeriods.create({
        subscriptionId: subscription.id,
        dueDate,
        status: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
      });
    }

    // Surface expectedAmount as a decimal so the response matches GET (the
    // column holds raw cents).
    const plain = subscription.toJSON() as Subscriptions;
    return {
      ...plain,
      expectedAmount: plain.expectedAmount != null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
    };
  },
);
