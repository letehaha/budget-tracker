import { RemindBeforePreset, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { NotFoundError, ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/subscriptions.model';
import { withTransaction } from '@services/common/with-transaction';

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

  const reminder = await PaymentReminders.findOne({
    where: { id, userId },
  });

  if (!reminder) {
    throw new NotFoundError({ message: 'Payment reminder not found' });
  }

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

  await reminder.update(updateData);

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
