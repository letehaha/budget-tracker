import { ACCOUNT_CATEGORIES, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';

import { withTransaction } from '../common/with-transaction';

/**
 * Account balance recalculation triggered by Sequelize hooks on `Transactions`. Lives
 * in its own file (not in `services/accounts.service.ts`) deliberately: the broader
 * accounts service imports the share-aware account lookup helpers, which transitively
 * import models. Pulling that in from `transactions.model.ts` would create a circular
 * import cycle that ts-node hits at startup (`models.map(m => m.prototype)` crashes on
 * an undefined entry). This file imports only the `Accounts` model and shared utilities,
 * so transactions.model can require it without re-entering the model loader.
 */

const calculateNewBalance = ({
  amount,
  previousAmount,
  currentBalance,
}: {
  amount: Money;
  previousAmount: Money;
  currentBalance: Money;
}): Money => {
  return currentBalance.add(amount.subtract(previousAmount));
};

const defineCorrectAmountFromTxType = ({
  amount,
  transactionType,
}: {
  amount: Money;
  transactionType: TRANSACTION_TYPES;
}): Money => {
  return transactionType === TRANSACTION_TYPES.income ? amount : amount.negate();
};

async function updateAccountBalanceForChangedTxImpl({
  accountId,
  transactionType,
  amount = Money.zero(),
  prevAmount = Money.zero(),
  prevTransactionType = transactionType,
}: {
  accountId: string;
  transactionType: TRANSACTION_TYPES;
  amount?: Money;
  prevAmount?: Money;
  prevTransactionType?: TRANSACTION_TYPES;
}): Promise<void> {
  // Lookup is account-scoped, not user-scoped: post-S4 the service layer has already
  // authorized the write (owner or recipient with `write`/`manage`), so balance updates
  // must run against the account regardless of who created the transaction. Filtering
  // by `userId` here silently dropped recipient-authored balance updates and let
  // `Accounts.currentBalance` drift out of sync with the underlying tx ledger.
  const account = await Accounts.findOne({ where: { id: accountId } });

  if (!account) {
    // Hook runs after the tx row already committed. A missing account here means the
    // balance silently drifts — fire-and-forget no-op would hide it, so report instead.
    logger.error(
      {
        message: 'Account missing when applying balance update for changed transaction',
        error: new Error(`Accounts.findOne returned null for accountId=${accountId}`),
      },
      {
        code: 'ACCOUNT_BALANCE_UPDATE_MISSING_ACCOUNT',
        accountId,
      },
    );
    return undefined;
  }

  // Loan balances are recomputed from the anchor snapshot by recomputeLoanBalance,
  // never deltad here — a delta would double-apply and ignore the anchor boundary.
  if (account.accountCategory === ACCOUNT_CATEGORIES.loan) return undefined;

  const newAmount = defineCorrectAmountFromTxType({ amount, transactionType });
  const oldAmount = defineCorrectAmountFromTxType({ amount: prevAmount, transactionType: prevTransactionType });

  const newCurrentBalance = calculateNewBalance({
    amount: newAmount,
    previousAmount: oldAmount,
    currentBalance: account.currentBalance,
  });

  // `refCurrentBalance` is a spot measure (native balance × latest rate), never a
  // running sum of per-transaction `refAmount`s: those carry historical tx-date
  // rates, and accumulating them leaves the base-currency balance at a blend of
  // old rates — an account drained back to zero would keep a nonzero ref residue.
  //
  // Dynamic import for the same reason this file exists at all (see the module
  // comment): `calculate-ref-amount.service` transitively loads other models and
  // the exchange-rate provider stack, which must not be required while
  // `transactions.model.ts` is still inside the model loader.
  const { calculateRefAmount } = await import('@services/calculate-ref-amount.service');
  const refCurrentBalance = await calculateRefAmount({
    // Owner of the account, not the transaction author — ref balances are stored
    // in the owner's base currency (shared accounts can be written by recipients).
    userId: account.userId,
    amount: newCurrentBalance,
    baseCode: account.currencyCode,
    date: new Date(),
    bypassCache: true,
  });

  await Accounts.update({ currentBalance: newCurrentBalance, refCurrentBalance }, { where: { id: accountId } });
}

export const updateAccountBalanceForChangedTx = withTransaction(updateAccountBalanceForChangedTxImpl);
