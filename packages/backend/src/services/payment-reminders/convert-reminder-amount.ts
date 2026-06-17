import { Money } from '@common/types/money';
import PaymentReminders from '@models/payment-reminders.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';

/**
 * Converts a reminder's billed amount (`expectedAmount`, in `currencyCode`) into
 * the currency of the account it is paid from, valued at `date`.
 *
 * A scheduled payment can be billed in one currency (e.g. a USD subscription)
 * while paid from an account in another (e.g. a UAH card). The booked expense
 * must be in the account's currency, so the billed amount is converted at
 * payment time. The pay-dialog estimate and the actual booking both call this so
 * the figure the user confirms is exactly the figure that gets booked — they can
 * never disagree.
 *
 * Returns the unchanged `expectedAmount` when the reminder shares the account's
 * currency (or carries no currency), and `null` when there is no `expectedAmount`
 * to convert (a variable-amount reminder).
 */
export async function convertReminderAmountToAccountCurrency({
  reminder,
  accountCurrencyCode,
  date,
}: {
  reminder: PaymentReminders;
  accountCurrencyCode: string;
  date: Date;
}): Promise<Money | null> {
  const expected = reminder.expectedAmount;
  if (expected == null) return null;

  if (!reminder.currencyCode || reminder.currencyCode === accountCurrencyCode) {
    return expected;
  }

  return calculateRefAmount({
    userId: reminder.userId,
    amount: expected,
    baseCode: reminder.currencyCode,
    quoteCode: accountCurrencyCode,
    date,
  });
}
