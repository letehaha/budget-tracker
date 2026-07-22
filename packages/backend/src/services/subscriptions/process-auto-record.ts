import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { Op } from 'sequelize';

import { markPeriodPaid } from './mark-period-paid';

interface ProcessResult {
  /** Periods successfully booked + marked paid this tick. */
  booked: number;
  /** Periods that threw (e.g. FX missing, account deleted). Cron logs each and keeps going. */
  failed: number;
}

/**
 * Walks every auto-record subscription and books the expense for any period
 * that has fallen due since the last tick. One call to `markPeriodPaid` per
 * period (CREATE mode), reusing the same path the pay-now dialog runs through —
 * so the auto path stays in lockstep with manual: same validation, same balance
 * update, same logo/category fallbacks, same period advancement.
 *
 * Forward-only semantics: the filter is `status='upcoming'` (never 'overdue').
 * Existing overdue periods sitting on a subscription when the user enables
 * auto-record stay manual; only periods that come due under the auto-record
 * regime are booked. The race with the every-2h reminders cron (which flips
 * past-due upcoming periods to overdue) is acceptable — auto-record runs hourly,
 * so a normal-uptime period is processed long before the overdue marker reaches
 * it. A multi-day outage that lets the marker win first leaves the slipped
 * periods for the user to pay manually, matching the no-backfill promise.
 *
 * Per-period try/catch: one failing subscription (FX rate missing, account
 * deleted, etc.) must not stop the cron from processing the rest. Each error
 * is logged with the period id so it shows up in the same place a manual pay
 * failure would.
 */
export async function processAutoRecordPeriods(): Promise<ProcessResult> {
  const today = new Date().toISOString().split('T')[0]!;

  const subscriptions = await Subscriptions.findAll({
    where: {
      autoRecord: true,
      isActive: true,
      completedAt: null,
    },
    include: [
      {
        model: SubscriptionPeriods,
        as: 'periods',
        required: true,
        where: {
          status: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
          dueDate: { [Op.lte]: today },
        },
      },
    ],
  });

  let booked = 0;
  let failed = 0;

  // A user mid base-currency migration has their ref* amounts owned by the
  // recalc; booking a period would compute refAmount against the wrong base.
  // Skip that user's subscriptions this tick — the hourly cron retries once the
  // lock clears. Cached per user so one Redis GET covers all their subscriptions.
  const lockedUserCache = new Map<number, boolean>();

  for (const subscription of subscriptions) {
    let userLocked = lockedUserCache.get(subscription.userId);
    if (userLocked === undefined) {
      userLocked = await isBaseCurrencyChangeLocked({ userId: subscription.userId });
      lockedUserCache.set(subscription.userId, userLocked);
    }
    if (userLocked) continue;

    for (const period of subscription.periods) {
      try {
        await markPeriodPaid({
          userId: subscription.userId,
          subscriptionId: subscription.id,
          periodId: period.id,
          createTransaction: true,
          // The booked transaction is dated at the period's dueDate (start of
          // day UTC) rather than "now", so the user's history reads the way
          // they scheduled it: the bill is dated when it was supposed to fall,
          // not when the cron happened to run.
          time: new Date(period.dueDate + 'T00:00:00Z'),
        });
        booked += 1;
      } catch (error) {
        failed += 1;
        logger.error({
          message: `[Subscription Auto-record] Failed to book period ${period.id} on subscription ${subscription.id}`,
          error: error as Error,
        });
      }
    }
  }

  if (booked > 0 || failed > 0) {
    logger.info(`[Subscription Auto-record] Booked ${booked} period(s), ${failed} failed`);
  }

  return { booked, failed };
}
