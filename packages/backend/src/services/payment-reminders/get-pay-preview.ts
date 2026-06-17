import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import * as Accounts from '@models/accounts.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

import { convertReminderAmountToAccountCurrency } from './convert-reminder-amount';

interface ReminderPayPreview {
  /** True when the reminder's billed currency differs from its account's currency. */
  isCrossCurrency: boolean;
  /** ISO code the booked expense will be denominated in (the account's currency), or null when no account is linked. */
  accountCurrencyCode: string | null;
  /** ISO code the reminder is billed in. */
  reminderCurrencyCode: string | null;
  /** Billed amount in the reminder's own currency (decimal), or null for a variable-amount reminder. */
  expectedAmount: number | null;
  /**
   * Billed amount converted into the account currency at today's rate (decimal),
   * used to pre-fill the pay dialog. Null when there is nothing to convert (no
   * account or no expectedAmount).
   */
  convertedAmount: number | null;
}

/**
 * Returns what paying a reminder would book, so the pay dialog can pre-fill the
 * amount. The conversion uses the same `convertReminderAmountToAccountCurrency`
 * that the actual booking uses, guaranteeing the previewed figure matches the
 * booked expense.
 */
export const getReminderPayPreview = withTransaction(
  async ({ userId, reminderId }: { userId: number; reminderId: string }): Promise<ReminderPayPreview> => {
    const reminder = await findOrThrowNotFound({
      query: PaymentReminders.findOne({ where: { id: reminderId, userId } }),
      message: t({ key: 'paymentReminders.reminderNotFound' }),
    });

    const expectedAmount = reminder.expectedAmount != null ? reminder.expectedAmount.toNumber() : null;

    if (reminder.accountId == null) {
      return {
        isCrossCurrency: false,
        accountCurrencyCode: null,
        reminderCurrencyCode: reminder.currencyCode,
        expectedAmount,
        convertedAmount: null,
      };
    }

    const account = await Accounts.getAccountCurrency({ userId, id: reminder.accountId });
    const accountCurrencyCode = account.currency.code;
    const isCrossCurrency = reminder.currencyCode != null && reminder.currencyCode !== accountCurrencyCode;

    const converted = await convertReminderAmountToAccountCurrency({
      reminder,
      accountCurrencyCode,
      date: new Date(),
    });

    return {
      isCrossCurrency,
      accountCurrencyCode,
      reminderCurrencyCode: reminder.currencyCode,
      expectedAmount,
      convertedAmount: converted != null ? converted.toNumber() : null,
    };
  },
);
