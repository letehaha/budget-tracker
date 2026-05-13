import { TRANSACTION_TYPES } from '@bt/shared/types';
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
  refAmount = Money.zero(),
  prevRefAmount = Money.zero(),
  prevTransactionType = transactionType,
}: {
  accountId: number;
  transactionType: TRANSACTION_TYPES;
  amount?: Money;
  prevAmount?: Money;
  refAmount?: Money;
  prevRefAmount?: Money;
  prevTransactionType?: TRANSACTION_TYPES;
  currencyCode?: string;
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

  const currentBalance = account.currentBalance;
  const refCurrentBalance = account.refCurrentBalance;

  const newAmount = defineCorrectAmountFromTxType({ amount, transactionType });
  const oldAmount = defineCorrectAmountFromTxType({ amount: prevAmount, transactionType: prevTransactionType });
  const newRefAmount = defineCorrectAmountFromTxType({ amount: refAmount, transactionType });
  const oldRefAmount = defineCorrectAmountFromTxType({ amount: prevRefAmount, transactionType: prevTransactionType });

  await Accounts.update(
    {
      currentBalance: calculateNewBalance({ amount: newAmount, previousAmount: oldAmount, currentBalance }),
      refCurrentBalance: calculateNewBalance({
        amount: newRefAmount,
        previousAmount: oldRefAmount,
        currentBalance: refCurrentBalance,
      }),
    },
    { where: { id: accountId } },
  );
}

export const updateAccountBalanceForChangedTx = withTransaction(updateAccountBalanceForChangedTxImpl);
