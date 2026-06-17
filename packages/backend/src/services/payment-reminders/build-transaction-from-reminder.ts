import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import PaymentReminders from '@models/payment-reminders.model';
import * as Users from '@models/users.model';
import type { CreateTransactionParams } from '@services/transactions/types';

import { convertReminderAmountToAccountCurrency } from './convert-reminder-amount';

/**
 * Translates a payment reminder into the params for `createTransaction`.
 *
 * Scheduled payments only ever book an expense against the reminder's stored
 * account, so the transfer-related fields are fixed: `transferNature` is
 * `not_transfer` and `accountType` is `system` (the manage-transaction HTTP
 * path's default for omitted accountType, see `deserializeCreateTransaction`).
 *
 * `paymentType` has no default on the HTTP create path (the controller schema
 * makes it required), so a scheduled-payment-created transaction picks
 * `bankTransfer` — the closest neutral match for "I paid a recurring bill".
 * The user can reopen the created transaction later to change it.
 *
 * `categoryId` falls back to the user's `defaultCategoryId` when the reminder
 * has none, mirroring how a manually created transaction with no chosen
 * category still lands somewhere sensible. `createTransaction` accepts a
 * null/undefined category, so when neither the reminder nor the user provides
 * one the transaction is simply created uncategorized rather than rejected.
 *
 * The booked transaction is always denominated in the account's currency. When
 * the reminder is billed in a different currency (a USD subscription paid from a
 * UAH account), the amount is resolved as follows:
 *   - an explicit `amount` override is taken verbatim — the pay dialog already
 *     converted the bill to the account currency before sending it;
 *   - otherwise the reminder's `expectedAmount` is converted into the account
 *     currency at `time` via `convertReminderAmountToAccountCurrency`.
 *
 * Validation (account presence, amount availability) lives here so create-mode
 * fails before any row is written.
 */
export async function buildTransactionFromReminder({
  reminder,
  amount,
  time,
}: {
  reminder: PaymentReminders;
  /** Decimal override for the booked amount, expressed in the ACCOUNT's currency. */
  amount?: number;
  /** Actual payment date override. Falls back to now. */
  time?: Date;
}): Promise<CreateTransactionParams> {
  if (reminder.accountId == null) {
    throw new ValidationError({
      message: t({ key: 'paymentReminders.createTransactionRequiresAccount' }),
    });
  }

  const effectiveTime = time ?? new Date();

  let amountMoney: Money;
  if (amount != null) {
    amountMoney = Money.fromDecimal(amount);
  } else {
    const account = await Accounts.getAccountCurrency({ userId: reminder.userId, id: reminder.accountId });
    if (account == null) {
      throw new ValidationError({
        message: t({ key: 'paymentReminders.createTransactionRequiresAccount' }),
      });
    }

    const converted = await convertReminderAmountToAccountCurrency({
      reminder,
      accountCurrencyCode: account.currency.code,
      date: effectiveTime,
    });
    if (converted == null) {
      throw new ValidationError({
        message: t({ key: 'paymentReminders.createTransactionRequiresAmount' }),
      });
    }
    amountMoney = converted;
  }

  const categoryId = reminder.categoryId ?? (await Users.getUserDefaultCategory({ id: reminder.userId })) ?? undefined;

  return {
    userId: reminder.userId,
    accountId: reminder.accountId,
    amount: amountMoney,
    transactionType: TRANSACTION_TYPES.expense,
    paymentType: PAYMENT_TYPES.bankTransfer,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    accountType: ACCOUNT_TYPES.system,
    categoryId,
    time: effectiveTime,
    note: reminder.name,
  };
}
