import { TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import * as Accounts from '@models/accounts.model';

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
  userId,
  transactionType,
  amount = Money.zero(),
  prevAmount = Money.zero(),
  refAmount = Money.zero(),
  prevRefAmount = Money.zero(),
  prevTransactionType = transactionType,
}: {
  accountId: number;
  userId: number;
  transactionType: TRANSACTION_TYPES;
  amount?: Money;
  prevAmount?: Money;
  refAmount?: Money;
  prevRefAmount?: Money;
  prevTransactionType?: TRANSACTION_TYPES;
  currencyCode?: string;
}): Promise<void> {
  // Model-level lookup, not the service-level `getAccountById`: balance updates only
  // run for the account's actual owner (writes by recipients are not supported in
  // Stage A; S4 will route shared writes through the auth service and update by id).
  const account = await Accounts.getAccountById({ id: accountId, userId });

  if (!account) return undefined;

  const currentBalance = account.currentBalance;
  const refCurrentBalance = account.refCurrentBalance;

  const newAmount = defineCorrectAmountFromTxType({ amount, transactionType });
  const oldAmount = defineCorrectAmountFromTxType({ amount: prevAmount, transactionType: prevTransactionType });
  const newRefAmount = defineCorrectAmountFromTxType({ amount: refAmount, transactionType });
  const oldRefAmount = defineCorrectAmountFromTxType({ amount: prevRefAmount, transactionType: prevTransactionType });

  await Accounts.updateAccountById({
    id: accountId,
    userId,
    currentBalance: calculateNewBalance({ amount: newAmount, previousAmount: oldAmount, currentBalance }),
    refCurrentBalance: calculateNewBalance({
      amount: newRefAmount,
      previousAmount: oldRefAmount,
      currentBalance: refCurrentBalance,
    }),
  });
}

export const updateAccountBalanceForChangedTx = withTransaction(updateAccountBalanceForChangedTxImpl);
