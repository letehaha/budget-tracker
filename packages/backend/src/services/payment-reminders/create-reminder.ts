import { PAYMENT_REMINDER_STATUSES, RemindBeforePreset, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';

interface CreateReminderParams {
  userId: number;
  name: string;
  dueDate: string;
  subscriptionId?: string;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
  preferredTime?: number;
  timezone?: string;
  categoryId?: number | null;
  notes?: string | null;
}

export const createReminder = withTransaction(async (params: CreateReminderParams) => {
  const {
    userId,
    name,
    dueDate,
    subscriptionId,
    expectedAmount = null,
    currencyCode = null,
    frequency = null,
    remindBefore = [],
    notifyEmail = false,
    preferredTime = 8,
    timezone = 'UTC',
    categoryId = null,
    notes = null,
  } = params;

  let finalName = name;
  let finalAmount = expectedAmount;
  let finalCurrency = currencyCode;
  let finalFrequency = frequency;

  // If linked to subscription, sync fields from it
  if (subscriptionId) {
    const subscription = await findOrThrowNotFound({
      query: Subscriptions.findOne({
        where: { id: subscriptionId, userId },
      }),
      message: 'Subscription not found',
    });

    finalName = subscription.name;
    // Subscription stores expectedAmount via Money (cents column). Convert to decimals here
    // because the params API accepts `number` and we later wrap in Money.fromDecimal.
    finalAmount = subscription.expectedAmount != null ? subscription.expectedAmount.toNumber() : null;
    finalCurrency = subscription.expectedCurrencyCode;
    finalFrequency = subscription.frequency;
  }

  // Validate amount/currency consistency
  if ((finalAmount != null) !== (finalCurrency != null)) {
    throw new ValidationError({
      message: 'Both expectedAmount and currencyCode must be provided together',
    });
  }

  const anchorDay = new Date(dueDate + 'T00:00:00Z').getUTCDate();

  const reminder = await PaymentReminders.create({
    userId,
    subscriptionId: subscriptionId || null,
    name: finalName,
    expectedAmount: (finalAmount != null ? Money.fromDecimal(finalAmount) : null) as Money,
    currencyCode: finalCurrency,
    frequency: finalFrequency,
    anchorDay,
    dueDate,
    remindBefore,
    notifyEmail,
    preferredTime,
    timezone,
    categoryId,
    notes,
    isActive: true,
  });

  // Create the first period
  await PaymentReminderPeriods.create({
    reminderId: reminder.id,
    dueDate,
    status: PAYMENT_REMINDER_STATUSES.upcoming,
  });

  // Reload with periods
  return PaymentReminders.findByPk(reminder.id, {
    include: [{ model: PaymentReminderPeriods, as: 'periods' }],
  }) as Promise<PaymentReminders>;
});
