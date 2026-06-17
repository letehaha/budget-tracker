import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import PaymentReminders from '@models/payment-reminders.model';
import * as Users from '@models/users.model';
import type { CreateTransactionParams } from '@services/transactions/types';

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
 * Validation (account presence, amount availability) lives here so create-mode
 * fails before any row is written.
 */
export async function buildTransactionFromReminder({
  reminder,
  amount,
  time,
}: {
  reminder: PaymentReminders;
  /** Decimal override for the booked amount. Falls back to the reminder's expectedAmount. */
  amount?: number;
  /** Actual payment date override. Falls back to now. */
  time?: Date;
}): Promise<CreateTransactionParams> {
  if (reminder.accountId == null) {
    throw new ValidationError({
      message: t({ key: 'paymentReminders.createTransactionRequiresAccount' }),
    });
  }

  // `expectedAmount` returns null (cast to Money by the getter) when the
  // underlying cents are null, so resolve the decimal explicitly before
  // building a Money instance.
  const resolvedDecimal = amount ?? (reminder.expectedAmount != null ? reminder.expectedAmount.toNumber() : null);
  if (resolvedDecimal == null) {
    throw new ValidationError({
      message: t({ key: 'paymentReminders.createTransactionRequiresAmount' }),
    });
  }

  const categoryId = reminder.categoryId ?? (await Users.getUserDefaultCategory({ id: reminder.userId })) ?? undefined;

  return {
    userId: reminder.userId,
    accountId: reminder.accountId,
    amount: Money.fromDecimal(resolvedDecimal),
    transactionType: TRANSACTION_TYPES.expense,
    paymentType: PAYMENT_TYPES.bankTransfer,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    accountType: ACCOUNT_TYPES.system,
    categoryId,
    time: time ?? new Date(),
    note: reminder.name,
  };
}
