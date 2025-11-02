import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  AccountModel,
  MonobankUserModel,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { ExternalMonobankClientInfoResponse } from '@bt/shared/types/external-services';
import { redisKeyFormatter } from '@common/lib/redis';
import { ForbiddenError, NotFoundError, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import * as Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import * as Currencies from '@models/Currencies.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { redisClient } from '@root/redis-client';
import * as monobankUsersService from '@services/banks/monobank/users';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import axios from 'axios';
import cc from 'currency-codes';

import { withTransaction } from './common/with-transaction';

export const getAccounts = withTransaction(
  async (payload: Accounts.GetAccountsPayload): Promise<AccountModel[]> => Accounts.getAccounts(payload),
);

export const getAccountsByExternalIds = withTransaction(async (payload: Accounts.GetAccountsByExternalIdsPayload) =>
  Accounts.getAccountsByExternalIds(payload),
);

export const getAccountById = withTransaction(
  async (payload: { id: number; userId: number }): Promise<AccountModel | null> => Accounts.getAccountById(payload),
);

const hostname = 'https://api.monobank.ua';

export const createSystemAccountsFromMonobankAccounts = withTransaction(
  async ({
    userId,
    monoAccounts,
  }: {
    userId: number;
    monoAccounts: ExternalMonobankClientInfoResponse['accounts'];
  }) => {
    // Convert numeric currency codes to string codes using currency-codes package
    const numericCurrencyCodes = [...new Set(monoAccounts.map((i) => i.currencyCode))];
    const stringCurrencyCodes = numericCurrencyCodes.map((numericCode) => {
      const currencyInfo = cc.number(numericCode.toString());
      if (!currencyInfo) {
        throw new Error(`Unknown currency code: ${numericCode}`);
      }
      return currencyInfo.code;
    });

    const currencies = (
      await Promise.all(stringCurrencyCodes.map((code) => Currencies.createCurrency({ code })))
    ).filter(Boolean) as Currencies.default[];

    await addUserCurrencies(
      currencies.map((item) => ({
        userId,
        currencyCode: item.code,
      })),
    );

    await Promise.all(
      monoAccounts.map((account) => {
        // Convert numeric currency code to string code for this account
        const currencyInfo = cc.number(account.currencyCode.toString());
        if (!currencyInfo) {
          logger.error(
            { error: new Error(`Unknown currency code when tried to create account: ${account.currencyCode}`) },
            account,
          );
          return;
        }

        return createAccount({
          userId,
          currencyCode: currencyInfo.code,
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          name: account.maskedPan[0] || account.iban,
          externalId: account.id,
          initialBalance: account.balance,
          creditLimit: account.creditLimit,
          externalData: {
            cashbackType: account.cashbackType,
            maskedPan: JSON.stringify(account.maskedPan),
            type: account.type,
            iban: account.iban,
          },
          type: ACCOUNT_TYPES.monobank,
          isEnabled: false,
        });
      }),
    );
  },
);

export const pairMonobankAccount = withTransaction(async (payload: { token: string; userId: number }) => {
  const { token, userId } = payload;

  let user = await monobankUsersService.getUserByToken({ token, userId });
  // If user is found, return
  if (user) {
    return { connected: true };
  }

  const redisToken = redisKeyFormatter(token);

  // Otherwise begin user connection
  const response = await redisClient.get(redisToken);
  let clientInfo: ExternalMonobankClientInfoResponse;

  if (!response) {
    // TODO: setup it later
    // await updateWebhookAxios({ userToken: token });

    try {
      const result = await axios({
        method: 'GET',
        url: `${hostname}/personal/client-info`,
        responseType: 'json',
        headers: {
          'X-Token': token,
        },
      });

      if (!result) {
        throw new NotFoundError({
          message: '"token" (Monobank API token) is most likely invalid because we cannot find corresponding user.',
        });
      }

      clientInfo = result.data;

      await redisClient.set(redisToken, JSON.stringify(response), { EX: 60 });
    } catch (err) {
      // @ts-expect-error TODO: add proper `err` interface
      if (err?.response?.data?.errorDescription === "Unknown 'X-Token'") {
        throw new ForbiddenError({
          code: API_ERROR_CODES.monobankTokenInvalid,
          message: 'Monobank rejected this token!',
        });
      } else {
        throw new ForbiddenError({
          code: API_ERROR_CODES.monobankTokenInvalid,
          message: 'Token is invalid!',
        });
      }
    }
  } else {
    clientInfo = JSON.parse(response);
  }

  user = await monobankUsersService.createUser({
    userId,
    token,
    clientId: clientInfo.clientId,
    name: clientInfo.name,
    webHookUrl: clientInfo.webHookUrl,
  });

  await createSystemAccountsFromMonobankAccounts({
    userId,
    monoAccounts: clientInfo.accounts,
  });

  (
    user as MonobankUserModel & {
      accounts: ExternalMonobankClientInfoResponse['accounts'];
    }
  ).accounts = clientInfo.accounts;

  return user;
});

export const createAccount = withTransaction(
  async (
    payload: Omit<Accounts.CreateAccountPayload, 'refCreditLimit' | 'refInitialBalance'>,
  ): Promise<AccountModel | null> => {
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
    const accountData = await Accounts.default.findByPk(id);

    if (!accountData) {
      throw new NotFoundError({ message: 'Account not found!' });
    }

    const currentBalanceIsChanging =
      payload.currentBalance !== undefined && payload.currentBalance !== accountData.currentBalance;
    let initialBalance = accountData.initialBalance;
    let refInitialBalance = accountData.refInitialBalance;
    let refCurrentBalance = accountData.refCurrentBalance;

    /**
     * If `currentBalance` is changing, it means user want to change current balance
     * but without creating adjustment transaction, so instead we change both `initialBalance`
     * and `currentBalance` on the same diff
     */
    if (currentBalanceIsChanging && payload.currentBalance !== undefined) {
      const diff = payload.currentBalance - accountData.currentBalance;
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
        initialBalance += diff;
        refInitialBalance += refDiff;
      }
      refCurrentBalance += refDiff;
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
      throw new UnexpectedError(API_ERROR_CODES.unexpected, 'Account updation is not successful');
    }

    await Balances.handleAccountChange({
      account: result,
      prevAccount: accountData,
    });

    return result;
  },
);

const calculateNewBalance = (amount: number, previousAmount: number, currentBalance: number) => {
  if (amount > previousAmount) {
    return currentBalance + (amount - previousAmount);
  } else if (amount < previousAmount) {
    return currentBalance - (previousAmount - amount);
  }

  return currentBalance;
};

const defineCorrectAmountFromTxType = (amount: number, transactionType: TRANSACTION_TYPES) => {
  return transactionType === TRANSACTION_TYPES.income ? amount : amount * -1;
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

export async function updateAccountBalanceForChangedTxImpl({
  accountId,
  userId,
  transactionType,
  amount = 0,
  prevAmount = 0,
  refAmount = 0,
  prevRefAmount = 0,
  prevTransactionType = transactionType,
}: {
  accountId: number;
  userId: number;
  transactionType: TRANSACTION_TYPES;
  amount?: number;
  prevAmount?: number;
  refAmount?: number;
  prevRefAmount?: number;
  prevTransactionType?: TRANSACTION_TYPES;
  currencyCode?: string;
}): Promise<void> {
  const account = await getAccountById({ id: accountId, userId });

  if (!account) return undefined;

  const { currentBalance, refCurrentBalance } = account;

  const newAmount = defineCorrectAmountFromTxType(amount, transactionType);
  const oldAmount = defineCorrectAmountFromTxType(prevAmount, prevTransactionType);
  const newRefAmount = defineCorrectAmountFromTxType(refAmount, transactionType);
  const oldRefAmount = defineCorrectAmountFromTxType(prevRefAmount, prevTransactionType);

  // TODO: for now keep that deadcode, cause it doesn't really work. But when have time, recheck it past neednes
  // if (currencyCode !== accountCurrencyCode) {
  //   const { rate } = await userExchangeRateService.getExchangeRate({
  //     userId,
  //     baseCode: currencyCode,
  //     quoteCode: accountCurrencyCode,
  //   }, { transaction });

  //   newAmount = defineCorrectAmountFromTxType(amount * rate, transactionType)
  // }

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
