import { ACCOUNT_STATUSES, ACCOUNT_TYPES, AccountExternalData, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { UnexpectedError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';

import { archiveAccount as performArchiveSideEffects } from './accounts/archive-account';
import { withTransaction } from './common/with-transaction';

type AccountWithRelinkStatus = Accounts.default & { needsRelink?: boolean };

/**
 * Check if an Enable Banking account needs to be re-linked.
 * This is true when the account has rawAccountData with identification_hash,
 * but the externalId doesn't match (meaning it was created with uid instead).
 */
function checkNeedsRelink(account: Accounts.default): boolean {
  // Only check accounts linked to a bank connection
  if (!account.bankDataProviderConnectionId) return false;

  switch (account.type) {
    case ACCOUNT_TYPES.enableBanking: {
      const externalData = account.externalData as AccountExternalData | null;
      if (!externalData) {
        // No externalData means very old account created before we stored raw data
        return true;
      }

      const rawAccountData = externalData.rawAccountData as { identification_hash?: string } | undefined;
      if (!rawAccountData?.identification_hash) {
        // No identification_hash means that account uses old schema – need to be updated
        return true;
      }

      // Account needs re-link if externalId doesn't match the stable identification_hash
      return account.externalId !== rawAccountData.identification_hash;
    }
    default:
      return false;
  }
}

/**
 * Add needsRelink flag to accounts.
 * Uses Object.assign (not spread) to preserve the Sequelize model prototype and Money getters.
 */
function addNeedsRelinkFlag(accounts: Accounts.default[]): AccountWithRelinkStatus[] {
  return accounts.map((account) =>
    Object.assign(account, {
      needsRelink: checkNeedsRelink(account),
    }),
  );
}

export const getAccounts = withTransaction(
  async (payload: Accounts.GetAccountsPayload): Promise<AccountWithRelinkStatus[]> => {
    const accounts = await Accounts.getAccounts(payload);
    return addNeedsRelinkFlag(accounts);
  },
);

export const getAccountById = withTransaction(
  async (payload: { id: number; userId: number }): Promise<AccountWithRelinkStatus | null> => {
    const account = await Accounts.getAccountById({ ...payload });

    if (!account) return null;

    return Object.assign(account, {
      needsRelink: checkNeedsRelink(account),
    });
  },
);

export const createAccount = withTransaction(
  async (
    payload: Omit<Accounts.CreateAccountPayload, 'refCreditLimit' | 'refInitialBalance'>,
  ): Promise<Accounts.default | null> => {
    try {
      const { userId, creditLimit, currencyCode, initialBalance } = payload;

      await UsersCurrencies.addCurrency({ userId, currencyCode });

      const refCreditLimit = await calculateRefAmount({
        userId: userId,
        amount: creditLimit,
        baseCode: currencyCode,
        date: new Date(),
      });

      const refInitialBalance = await calculateRefAmount({
        userId,
        amount: initialBalance,
        baseCode: currencyCode,
        date: new Date(),
      });

      return Accounts.createAccount({
        ...payload,
        refCreditLimit,
        refInitialBalance,
      });
    } catch (e) {
      console.log('account error', e);
      throw e;
    }
  },
);

export const updateAccount = withTransaction(
  async ({
    id,
    externalId,
    ...payload
  }: Accounts.UpdateAccountByIdPayload &
    (Pick<Accounts.UpdateAccountByIdPayload, 'id'> | Pick<Accounts.UpdateAccountByIdPayload, 'externalId'>)) => {
    const accountData = await findOrThrowNotFound({
      query: Accounts.default.findByPk(id),
      message: t({ key: 'accounts.accountNotFound' }),
    });

    // Handle archive side effects when transitioning to archived status
    const isArchiving =
      payload.status === ACCOUNT_STATUSES.archived && accountData.status !== ACCOUNT_STATUSES.archived;
    if (isArchiving) {
      await performArchiveSideEffects({ account: accountData, userId: accountData.userId });
    }

    const currentBalanceIsChanging =
      payload.currentBalance !== undefined && !payload.currentBalance.equals(accountData.currentBalance);
    let initialBalance: Money = accountData.initialBalance;
    let refInitialBalance: Money = accountData.refInitialBalance;
    let refCurrentBalance: Money = accountData.refCurrentBalance;

    /**
     * If `currentBalance` is changing, it means user want to change current balance
     * but without creating adjustment transaction, so instead we change both `initialBalance`
     * and `currentBalance` on the same diff
     */
    if (currentBalanceIsChanging && payload.currentBalance !== undefined) {
      const diff = payload.currentBalance.subtract(accountData.currentBalance);
      const refDiff = await calculateRefAmount({
        userId: accountData.userId,
        amount: diff,
        baseCode: accountData.currencyCode,
        date: new Date(),
      });

      // --- for system accounts
      // change currentBalance => change initialBalance
      // change currentBalance => recalculate refInitialBalance
      // --- for all accounts
      // change currentBalance => recalculate refCurrentBalance
      if (accountData.type === ACCOUNT_TYPES.system) {
        initialBalance = initialBalance.add(diff);
        refInitialBalance = refInitialBalance.add(refDiff);
      }
      refCurrentBalance = refCurrentBalance.add(refDiff);
    }

    const result = await Accounts.updateAccountById({
      id,
      externalId,
      initialBalance,
      refInitialBalance,
      refCurrentBalance,
      ...payload,
    });

    if (!result) {
      throw new UnexpectedError({ message: t({ key: 'accounts.accountUpdateFailed' }) });
    }

    await Balances.handleAccountChange({
      account: result,
      prevAccount: accountData,
    });

    return result;
  },
);

const calculateNewBalance = (amount: Money, previousAmount: Money, currentBalance: Money): Money => {
  return currentBalance.add(amount.subtract(previousAmount));
};

const defineCorrectAmountFromTxType = (amount: Money, transactionType: TRANSACTION_TYPES): Money => {
  return transactionType === TRANSACTION_TYPES.income ? amount : amount.negate();
};

// At least one of pair (amount + refAmount) OR (prevAmount + prefRefAmount) should be passed
// It is NOT allowed to pass 1 or 3 amount-related arguments

/** For **CREATED** transactions. When only (amount + refAmount) passed */
// export async function updateAccountBalanceForChangedTxImpl(
//   {
//     accountId,
//     userId,
//     transactionType,
//     amount,
//     refAmount,
//     currencyCode,
//   }: updateAccountBalanceRequiredFields & { amount: number; refAmount: number },
// ): Promise<void>;

// /** For **DELETED** transactions. When only (prevAmount + prefRefAmount) passed */
// export async function updateAccountBalanceForChangedTxImpl({
//   accountId,
//   userId,
//   transactionType,
//   prevAmount,
//   prevRefAmount,
//   currencyCode,
// }: updateAccountBalanceRequiredFields & {
//   prevAmount: number;
//   prevRefAmount: number;
// }): Promise<void>;

// /** For **UPDATED** transactions. When both pairs passed */
// export async function updateAccountBalanceForChangedTxImpl({
//   accountId,
//   userId,
//   transactionType,
//   amount,
//   prevAmount,
//   refAmount,
//   prevRefAmount,
//   currencyCode,
//   prevTransactionType,
// }: updateAccountBalanceRequiredFields & {
//   amount: number;
//   prevAmount: number;
//   refAmount: number;
//   prevRefAmount: number;
//   prevTransactionType: TRANSACTION_TYPES;
// }): Promise<void>;

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
  const account = await getAccountById({ id: accountId, userId });

  if (!account) return undefined;

  const currentBalance = account.currentBalance;
  const refCurrentBalance = account.refCurrentBalance;

  const newAmount = defineCorrectAmountFromTxType(amount, transactionType);
  const oldAmount = defineCorrectAmountFromTxType(prevAmount, prevTransactionType);
  const newRefAmount = defineCorrectAmountFromTxType(refAmount, transactionType);
  const oldRefAmount = defineCorrectAmountFromTxType(prevRefAmount, prevTransactionType);

  await Accounts.updateAccountById({
    id: accountId,
    userId,
    currentBalance: calculateNewBalance(newAmount, oldAmount, currentBalance),
    refCurrentBalance: calculateNewBalance(newRefAmount, oldRefAmount, refCurrentBalance),
  });
}

export const updateAccountBalanceForChangedTx = withTransaction(updateAccountBalanceForChangedTxImpl);

export const deleteAccountById = async ({ id }: { id: number }) => {
  return Accounts.deleteAccountById({ id });
};

export { unlinkAccountFromBankConnection } from './accounts/unlink-from-bank-connection';
export { linkAccountToBankConnection } from './accounts/link-to-bank-connection';
