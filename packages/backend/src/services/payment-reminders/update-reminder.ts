import { PAYMENT_REMINDER_STATUSES, RemindBeforePreset, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { ensureNextPeriodExists } from './ensure-next-period';

interface UpdateReminderParams {
  userId: number;
  id: string;
  name?: string;
  dueDate?: string;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
  preferredTime?: number;
  timezone?: string;
  categoryId?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export const updateReminder = withTransaction(async (params: UpdateReminderParams) => {
  const { userId, id, ...updates } = params;

  const reminder = await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id, userId },
    }),
    message: 'Payment reminder not found',
  });

  // If linked to subscription, don't allow updating synced fields
  if (reminder.subscriptionId) {
    if (
      updates.name !== undefined ||
      updates.expectedAmount !== undefined ||
      updates.currencyCode !== undefined ||
      updates.frequency !== undefined
    ) {
      throw new ValidationError({
        message:
          'Cannot update name, amount, currency, or frequency on a subscription-linked reminder. Update the subscription instead.',
      });
    }
  }

  // Validate amount/currency consistency
  const finalAmount = updates.expectedAmount !== undefined ? updates.expectedAmount : reminder.expectedAmount;
  const finalCurrency = updates.currencyCode !== undefined ? updates.currencyCode : reminder.currencyCode;

  if ((finalAmount != null) !== (finalCurrency != null)) {
    throw new ValidationError({
      message: 'Both expectedAmount and currencyCode must be provided together',
    });
  }

  // If dueDate changed, update anchorDay
  const updateData: Record<string, unknown> = { ...updates };
  if (updates.dueDate) {
    updateData.anchorDay = new Date(updates.dueDate + 'T00:00:00Z').getUTCDate();
  }
  // Convert decimal amount to Money so moneySetCents stores cents correctly
  if (updates.expectedAmount !== undefined) {
    updateData.expectedAmount = updates.expectedAmount != null ? Money.fromDecimal(updates.expectedAmount) : null;
  }

  const previousFrequency = reminder.frequency;

  await reminder.update(updateData);

  // When frequency changes from one-time (null) to recurring, ensure a new
  // upcoming period is created. Without this, a one-time reminder whose only
  // period was already paid/skipped would have no upcoming period after
  // becoming recurring.
  if (!previousFrequency && reminder.frequency) {
    await ensureNextPeriodExists({ reminder });
  }

  // When frequency changes from recurring to one-time, remove upcoming periods
  // if any paid/skipped period exists (the auto-created "next cycle" period is
  // no longer relevant). If nothing has been paid yet, keep the upcoming period
  // as the one-time payment the user still owes.
  if (previousFrequency && !reminder.frequency) {
    const hasCompletedPeriod = await PaymentReminderPeriods.findOne({
      where: {
        reminderId: id,
        status: { [Op.in]: [PAYMENT_REMINDER_STATUSES.paid, PAYMENT_REMINDER_STATUSES.skipped] },
      },
    });

    if (hasCompletedPeriod) {
      await PaymentReminderPeriods.destroy({
        where: {
          reminderId: id,
          status: PAYMENT_REMINDER_STATUSES.upcoming,
        },
      });
    }
  }

  return PaymentReminders.findByPk(id, {
    include: [
      {
        model: PaymentReminderPeriods,
        as: 'periods',
      },
      {
        model: Subscriptions,
        as: 'subscription',
        attributes: ['id', 'name'],
        required: false,
      },
    ],
    order: [[{ model: PaymentReminderPeriods, as: 'periods' }, 'dueDate', 'ASC']],
  }) as Promise<PaymentReminders>;
});
