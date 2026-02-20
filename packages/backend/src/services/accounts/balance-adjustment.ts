import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import type Transactions from '@models/Transactions.model';
import { getUserDefaultCategory } from '@models/Users.model';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';

interface AdjustAccountBalanceParams {
  userId: number;
  accountId: number;
  targetBalance: Money;
  note?: string;
}

interface AdjustAccountBalanceResult {
  transaction: Transactions | null;
  previousBalance: Money;
  newBalance: Money;
}

export const adjustAccountBalance = withTransaction(
  async ({
    userId,
    accountId,
    targetBalance,
    note,
  }: AdjustAccountBalanceParams): Promise<AdjustAccountBalanceResult> => {
    const account = await Accounts.findByPk(accountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundError({
        message: t({ key: 'balanceAdjustment.accountNotFound', variables: { accountId } }),
      });
    }

    const previousBalance = account.currentBalance;
    const diff = targetBalance.subtract(previousBalance);

    if (diff.isZero()) {
      return {
        transaction: null,
        previousBalance,
        newBalance: previousBalance,
      };
    }

    const transactionType = diff.isPositive() ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense;

    const defaultCategoryId = await getUserDefaultCategory({ id: userId });

    const [transaction] = await createTransaction({
      userId,
      accountId,
      amount: diff.abs(),
      transactionType,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      accountType: ACCOUNT_TYPES.system,
      paymentType: PAYMENT_TYPES.bankTransfer,
      note: note ?? t({ key: 'balanceAdjustment.defaultNote' }),
      categoryId: defaultCategoryId,
      time: new Date(),
    });

    return {
      transaction: transaction ?? null,
      previousBalance,
      newBalance: targetBalance,
    };
  },
);
