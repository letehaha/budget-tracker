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
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import { Op } from 'sequelize';

import { ensureNextPeriodExists, reconcileInstallmentCompletion } from './ensure-next-period';
import {
  assertAmountCurrencyConsistent,
  assertAutoRecordConsistent,
  findSubscriptionOrThrow,
  validateAccountOwnership,
  validateCategoryOwnership,
} from './helpers';
import { assertInstallmentScheduleComplete, assertMaxOccurrencesNotBelowConsumed } from './installments';
import { resolveOpenPeriodStatus } from './resolve-period-status';

/** Statuses that count as a live, un-consumed period. */
const OPEN_PERIOD_STATUSES = [SUBSCRIPTION_PERIOD_STATUSES.upcoming, SUBSCRIPTION_PERIOD_STATUSES.overdue];

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
  autoRecord?: boolean;
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

  // Validate the merged amount/currency pairing (only null-ness matters, so the
  // stored cents vs. the incoming decimal is irrelevant). Covers MCP callers that
  // send a partial payload the controller's request schema can't reconcile.
  assertAmountCurrencyConsistent({
    expectedAmount: fields.expectedAmount !== undefined ? fields.expectedAmount : subscription.expectedAmount,
    expectedCurrencyCode:
      fields.expectedCurrencyCode !== undefined ? fields.expectedCurrencyCode : subscription.expectedCurrencyCode,
  });

  // Auto-record requires the booking inputs and excludes matching rules. Apply
  // against the merged post-update state so a PATCH that only flips the toggle
  // still validates against the eventually-stored account/amount/rules.
  assertAutoRecordConsistent({
    autoRecord: fields.autoRecord !== undefined ? fields.autoRecord : subscription.autoRecord,
    accountId: fields.accountId !== undefined ? fields.accountId : subscription.accountId,
    expectedAmount: fields.expectedAmount !== undefined ? fields.expectedAmount : subscription.expectedAmount,
    expectedCurrencyCode:
      fields.expectedCurrencyCode !== undefined ? fields.expectedCurrencyCode : subscription.expectedCurrencyCode,
    matchingRules: fields.matchingRules !== undefined ? fields.matchingRules : subscription.matchingRules,
  });

  // Refuse lowering the payment count below the periods already paid/skipped —
  // that history is immutable, so the plan can't shrink beneath it.
  await assertMaxOccurrencesNotBelowConsumed({
    subscriptionId: id,
    maxOccurrences: fields.maxOccurrences !== undefined ? fields.maxOccurrences : subscription.maxOccurrences,
  });

  // The summary endpoint converts expectedAmount into the user's base currency,
  // which requires a UsersCurrencies row for the subscription's currency —
  // connect it (idempotent) whenever the currency is set or changed. Lives in
  // the service so MCP callers get the same guarantee as HTTP ones.
  if (fields.expectedCurrencyCode) {
    await ensureUserCurrencyConnected({ userId, currencyCode: fields.expectedCurrencyCode });
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
  // logic can use the calendar day without reparsing the date string. Clearing
  // the dueDate clears the anchor with it (no schedule to anchor to).
  if (fields.dueDate != null) {
    fields = { ...fields, anchorDay: new Date(fields.dueDate + 'T00:00:00Z').getUTCDate() } as typeof fields & {
      anchorDay: number;
    };
  } else if (fields.dueDate === null) {
    fields = { ...fields, anchorDay: null } as typeof fields & { anchorDay: number | null };
  }

  // Key present (even null) → user is making a manual override; stamp logoSource
  // so the background resolver never overwrites the user's choice.
  if (fields.logoDomain !== undefined) {
    fields = { ...fields, logoSource: 'manual' } as typeof fields & { logoSource: 'manual' };
  }

  // Remember the pre-edit type and dueDate before `update` overwrites them. The
  // type lets a change away from installment be detected below; the dueDate lets
  // us tell a genuine reschedule from the edit form re-sending the unchanged
  // (stored) anchor.
  const wasInstallment = subscription.type === SUBSCRIPTION_TYPES.installment;
  const previousDueDate = subscription.dueDate;

  await subscription.update(fields);

  // Keep the live schedule in step with an edited due date. Realigning only fires
  // when the due date ACTUALLY changed (`fields.dueDate !== previousDueDate`). The
  // edit form always re-sends the stored dueDate, even on edits that don't touch
  // the schedule (e.g. linking an account). subscriptions.dueDate is the static
  // anchor — it never advances as periods are paid — so once the schedule has
  // moved on, the open period sits ahead of the anchor. Comparing the re-sent
  // anchor against the open period (rather than the pre-edit anchor) would read it
  // as a reschedule and drag the open period backwards onto an already-consumed
  // date, spawning a duplicate overdue period.
  //  - dueDate changed: shift the single open (upcoming/overdue) period onto the
  //    new date and re-resolve its status, so the shown/reminded date and the
  //    next-cycle anchor track the schedule the user just set. Paid/skipped periods
  //    are immutable history and are never moved.
  //  - no open period yet (first time a schedule is added): seed one. Guarding on a
  //    zero TOTAL count stops a re-anchored finished installment (whose only periods
  //    are paid) from duplicating history. A past dueDate is born overdue (mirrors
  //    the cron).
  //  - dueDate cleared to null: the subscription becomes detection-only, so drop any
  //    open period (nothing left to fall due).
  if (fields.dueDate != null && fields.dueDate !== previousDueDate) {
    const openPeriod = await SubscriptionPeriods.findOne({
      where: { subscriptionId: id, status: { [Op.in]: OPEN_PERIOD_STATUSES } },
      order: [['dueDate', 'ASC']],
    });

    if (openPeriod) {
      await openPeriod.update({
        dueDate: fields.dueDate,
        status: resolveOpenPeriodStatus({ dueDate: fields.dueDate }),
      });
    } else {
      const existingPeriodCount = await SubscriptionPeriods.count({ where: { subscriptionId: id } });

      if (existingPeriodCount === 0) {
        await SubscriptionPeriods.create({
          subscriptionId: id,
          dueDate: fields.dueDate,
          status: resolveOpenPeriodStatus({ dueDate: fields.dueDate }),
        });
      }
    }
  } else if (fields.dueDate === null) {
    await SubscriptionPeriods.destroy({
      where: { subscriptionId: id, status: { [Op.in]: OPEN_PERIOD_STATUSES } },
    });
  }

  // Re-evaluate completion/scheduling now that the fields and the open period are
  // up to date.
  if (subscription.type === SUBSCRIPTION_TYPES.installment) {
    // Raising the cap reopens a finished plan and continues the schedule; lowering
    // it to/below the consumed count finalizes the plan and prunes any surplus open
    // period. Both directions handled here.
    await reconcileInstallmentCompletion({ subscription });
  } else if (wasInstallment) {
    // Converting away from installment: the finite-plan cap and completion no longer
    // apply. Drop maxOccurrences so the recurring schedule generates indefinitely.
    // A set `completedAt` means the installment had finished — which forced
    // isActive=false — so reactivate it (a subscription/bill has no "finished" state),
    // then ensure an open period exists to fall due.
    const wasFinished = subscription.completedAt != null;
    await subscription.update({
      maxOccurrences: null,
      ...(wasFinished ? { completedAt: null, isActive: true } : {}),
    });
    // Only continue the schedule if one still exists — a same-edit dueDate clear
    // makes it detection-only.
    if (subscription.dueDate != null) {
      await ensureNextPeriodExists({ subscription });
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
