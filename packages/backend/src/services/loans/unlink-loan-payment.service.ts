import { ACCOUNT_CATEGORIES, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';

interface UnlinkLoanPaymentParams {
  userId: number;
  /** The loan's underlying Account id. */
  accountId: string;
  /** Either leg of the payment pair — the source expense or the loan-side income leg. */
  transactionId: string;
}

/**
 * Reverse a single loan payment: delete the loan-side income leg and clear the
 * source leg's transferNature/transferId, restoring it to a plain expense on
 * its own account. Deleting the income leg fires the loan-balance recompute
 * hook. Unlink keeps the spend on the books — deleting the payment outright
 * (both legs) is the other supported undo.
 */
const unlinkLoanPaymentImpl = async ({ userId, accountId, transactionId }: UnlinkLoanPaymentParams) => {
  const sequelizeTx = namespace.get('transaction');

  // Row-lock the loan account so this unlink serialises against concurrent
  // payment writes (same invariant as `linkLoanPayments`). Removing a payment
  // only moves the balance further from zero, so there's no overpay check.
  const loanAccount = await Accounts.findOne({
    where: { id: accountId, userId },
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
  if (!loanAccount || loanAccount.accountCategory !== ACCOUNT_CATEGORIES.loan) {
    throw new NotFoundError({ message: t({ key: 'loans.loanNotFound' }) });
  }

  const transaction = await Transactions.default.findOne({ where: { id: transactionId, userId } });
  if (!transaction) {
    throw new NotFoundError({ message: t({ key: 'loans.unlinkPaymentNotFound' }) });
  }
  if (transaction.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_to_loan || !transaction.transferId) {
    throw new ValidationError({ message: t({ key: 'loans.unlinkPaymentInvalidSelection' }) });
  }

  // Split the pair by account (the leg on the loan account is the income leg to
  // delete) rather than by the passed id — so the caller may hand us either leg.
  const legs = await Transactions.default.findAll({ where: { transferId: transaction.transferId } });
  const loanLeg = legs.find((leg) => leg.accountId === accountId);
  const sourceLeg = legs.find((leg) => leg.id !== loanLeg?.id);
  if (!loanLeg || !sourceLeg) {
    // The pair isn't a payment on *this* loan — a stale selection or a transferId
    // whose loan-side leg lives on a different loan account.
    throw new ValidationError({ message: t({ key: 'loans.unlinkPaymentInvalidSelection' }) });
  }

  // Restore the source expense first so it never lingers as an orphaned transfer
  // leg, then drop the income leg — its delete fires the loan-balance recompute.
  await Transactions.updateTransactionById({
    id: sourceLeg.id,
    userId: sourceLeg.userId,
    transferId: null,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  });
  await Transactions.deleteTransactionById({ id: loanLeg.id, userId: loanLeg.userId });

  return { restoredTransactionId: sourceLeg.id };
};

export const unlinkLoanPayment = withTransaction(unlinkLoanPaymentImpl);
