import {
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  SubscriptionMatchingRules,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { enqueueLogoResolutionAfterCommit } from '@services/brand-logos';
import { withTransaction } from '@services/common/with-transaction';

import { validateAccountOwnership, validateCategoryOwnership } from './helpers';
import { assertInstallmentScheduleComplete } from './installments';
import { resolveOpenPeriodStatus } from './resolve-period-status';

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
  /**
   * When present (including null), the new subscription is stamped with this
   * logo domain and `logoSource: 'manual'` so the background resolver treats it
   * as authoritative and never overwrites it. When absent (undefined), the logo
   * fields stay unset and the post-commit resolver auto-resolves them.
   */
  logoDomain?: string | null;
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
    logoDomain,
    ...rest
  }: CreateSubscriptionParams) => {
    if (accountId) {
      await validateAccountOwnership({ accountId, userId });
    }

    if (categoryId) {
      await validateCategoryOwnership({ categoryId, userId });
    }

    // Enforce the installment invariant here too (not just in the controller) so MCP
    // callers, which reach the service directly, fail cleanly rather than on the DB CHECK.
    assertInstallmentScheduleComplete({
      type: rest.type ?? SUBSCRIPTION_TYPES.subscription,
      maxOccurrences: rest.maxOccurrences,
      dueDate,
    });

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
      // A supplied domain (even null) is a manual override; `logoSource: 'manual'`
      // makes the resolver treat it as authoritative.
      ...(logoDomain !== undefined ? { logoDomain, logoSource: 'manual' as const } : {}),
    });

    // When a dueDate is provided, create the first period so the subscription
    // immediately has a trackable payment target. A past dueDate is born overdue
    // (mirrors the cron) instead of showing "in -1 days" until the next cron tick.
    if (dueDate) {
      await SubscriptionPeriods.create({
        subscriptionId: subscription.id,
        dueDate,
        status: resolveOpenPeriodStatus({ dueDate }),
      });
    }

    // Always enqueue: the resolver no-ops on `logoSource: 'manual'` rows, so a
    // manual logo is never clobbered. Deferred to afterCommit so the worker only
    // sees a committed row.
    enqueueLogoResolutionAfterCommit({ entity: 'subscription', id: subscription.id });

    // Surface expectedAmount as a decimal so the response matches GET (the
    // column holds raw cents).
    const plain = subscription.toJSON() as Subscriptions;
    return {
      ...plain,
      expectedAmount: plain.expectedAmount != null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
    };
  },
);
