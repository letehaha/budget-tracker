import {
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  SubscriptionMatchingRules,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';

import { ensureNextPeriodExists } from './ensure-next-period';
import { findSubscriptionOrThrow, validateAccountOwnership, validateCategoryOwnership } from './helpers';
import { assertInstallmentScheduleComplete, isSubscriptionInstallmentCapReached } from './installments';
import { resolveOpenPeriodStatus } from './resolve-period-status';

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
  /**
   * When present (including null), sets logoDomain to this value and stamps
   * logoSource = 'manual' so the auto-resolver never overwrites the user's
   * choice. null = user explicitly wants no logo, still treated as manual. When
   * absent (undefined), both logo fields are left untouched.
   */
  logoDomain?: string | null;
}

export const updateSubscription = withTransaction(async ({ id, userId, ...fields }: UpdateSubscriptionParams) => {
  const subscription = await findSubscriptionOrThrow({ id, userId });

  if (fields.accountId !== undefined && fields.accountId !== null) {
    await validateAccountOwnership({ accountId: fields.accountId, userId });
  }

  if (fields.categoryId !== undefined && fields.categoryId !== null) {
    await validateCategoryOwnership({ categoryId: fields.categoryId, userId });
  }

  // Validate the merged post-update state (incoming field when sent, else the stored
  // value) so switching to — or keeping — an installment without a count + schedule
  // fails cleanly. Covers MCP callers, which bypass the controller's request schema.
  assertInstallmentScheduleComplete({
    type: fields.type ?? subscription.type,
    maxOccurrences: fields.maxOccurrences !== undefined ? fields.maxOccurrences : subscription.maxOccurrences,
    dueDate: fields.dueDate !== undefined ? fields.dueDate : subscription.dueDate,
  });

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

  // Key present (even null) → user is making a manual override; stamp logoSource
  // so the background resolver never overwrites the user's choice.
  if (fields.logoDomain !== undefined) {
    fields = { ...fields, logoSource: 'manual' } as typeof fields & { logoSource: 'manual' };
  }

  await subscription.update(fields);

  // Seed the first period only when introducing a schedule on a subscription that
  // has no periods at all. Guarding on a zero period count (not "no open period")
  // is what stops a re-sent dueDate from duplicating an already paid/skipped period
  // — e.g. editing a completed installment, whose only period is paid. A past
  // dueDate is born overdue (mirrors the cron).
  if (fields.dueDate != null) {
    const existingPeriodCount = await SubscriptionPeriods.count({ where: { subscriptionId: id } });

    if (existingPeriodCount === 0) {
      await SubscriptionPeriods.create({
        subscriptionId: id,
        dueDate: fields.dueDate,
        status: resolveOpenPeriodStatus({ dueDate: fields.dueDate }),
      });
    }
  }

  // Re-evaluate installment completion after the edit. Raising maxOccurrences past
  // the paid count un-finishes a completed installment: clear the completion,
  // reactivate, and let the schedule generate the next period. ensureNextPeriodExists
  // re-finishes it (via finalizeInstallmentCompletion) if the cap is still reached.
  if (subscription.type === SUBSCRIPTION_TYPES.installment) {
    const capReached = await isSubscriptionInstallmentCapReached({ subscription });
    if (!capReached && subscription.completedAt != null) {
      await subscription.update({ isActive: true, completedAt: null });
    }
    await ensureNextPeriodExists({ subscription });
  } else if (subscription.completedAt != null) {
    // Type changed away from installment — a completion stamp no longer applies.
    await subscription.update({ completedAt: null });
  }

  // Surface expectedAmount as a decimal so the response matches GET (the
  // column holds raw cents).
  const plain = subscription.toJSON() as Subscriptions;
  return {
    ...plain,
    expectedAmount: plain.expectedAmount != null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
  };
});
