import { ACCOUNT_TYPES, API_ERROR_CODES } from '@bt/shared/types';
import { UnexpectedError, ValidationError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';
import * as Currencies from '@models/Currencies.model';
import * as ExchangeRates from '@models/ExchangeRates.model';
import * as Transactions from '@models/Transactions.model';
import * as Users from '@models/Users.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';

import { withTransaction } from './common/with-transaction';
import { addUserCurrencies } from './currencies/add-user-currency';

export const getUser = withTransaction(async (id: number) => {
  const user = await Users.getUserById({ id });

  return user;
});

export const createUser = withTransaction(
  async ({
    username,
    email,
    firstName,
    lastName,
    middleName,
    password,
    avatar,
    totalBalance,
  }: {
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    password: string;
    avatar?: string;
    totalBalance?: number;
  }) => {
    const user = await Users.createUser({
      username,
      email,
      firstName,
      lastName,
      middleName,
      password,
      avatar,
      totalBalance,
    });

    return user;
  },
);

export const getUserByCredentials = withTransaction(
  async ({ username, email }: { username?: string; email?: string }) => {
    const user = await Users.getUserByCredentials({ username, email });

    return user;
  },
);

export const updateUser = withTransaction(
  async ({
    id,
    username,
    email,
    firstName,
    lastName,
    middleName,
    password,
    avatar,
    totalBalance,
    defaultCategoryId,
  }: {
    id: number;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    password?: string;
    avatar?: string;
    totalBalance?: number;
    defaultCategoryId?: number;
  }) => {
    const user = await Users.updateUserById({
      id,
      username,
      email,
      firstName,
      lastName,
      middleName,
      password,
      avatar,
      totalBalance,
      defaultCategoryId,
    });

    return user;
  },
);

export const deleteUser = withTransaction(async (id: number) => {
  await Users.default.destroy({ where: { id } });
});

export const getUserCurrencies = withTransaction(async ({ userId }: { userId: number }) => {
  const list = await UsersCurrencies.getCurrencies({ userId });

  return list;
});

export const getUserBaseCurrency = withTransaction(({ userId }: { userId: number }) => {
  return UsersCurrencies.getBaseCurrency({ userId });
});

export const setBaseUserCurrency = withTransaction(
  async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
    const existingBaseCurrency = await getUserBaseCurrency({ userId });

    if (existingBaseCurrency) {
      throw new ValidationError({ message: 'Base currency already exists!' });
    }

    const currency = await Currencies.getCurrency({ code: currencyCode });

    if (!currency) {
      throw new ValidationError({
        message: 'Currency with passed code does not exist.',
      });
    }

    const [exchangeRate] = await ExchangeRates.getRatesForCurrenciesPairs([
      { baseCode: currency.code, quoteCode: currency.code },
    ]);

    if (!exchangeRate) {
      throw new ValidationError({
        message: 'No exchange rate for current pair!',
      });
    }

    await addUserCurrencies([
      {
        userId,
        currencyCode,
        exchangeRate: exchangeRate.rate,
      },
    ]);

    const result = await setDefaultUserCurrency({ userId, currencyCode });

    return result;
  },
);

export const editUserCurrency = withTransaction(
  async ({
    userId,
    currencyCode,
    exchangeRate,
    liveRateUpdate,
  }: {
    userId: number;
    currencyCode: string;
    exchangeRate?: number;
    liveRateUpdate?: boolean;
  }) => {
    const passedCurrency = await UsersCurrencies.getCurrency({
      userId,
      currencyCode,
    });

    if (!passedCurrency) {
      throw new ValidationError({
        message: `Currency with code "${currencyCode}" does not exist.`,
      });
    }

    const result = await UsersCurrencies.updateCurrency({
      userId,
      currencyCode,
      exchangeRate,
      liveRateUpdate,
    });

    return result;
  },
);

export const setDefaultUserCurrency = withTransaction(
  async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
    const passedCurrency = await UsersCurrencies.getCurrency({
      userId,
      currencyCode,
    });

    if (!passedCurrency) {
      throw new ValidationError({
        message: `Currency with code "${currencyCode}" does not exist.`,
      });
    }

    // Make all curerncies not default
    await UsersCurrencies.updateCurrencies({
      userId,
      isDefaultCurrency: false,
    });

    const result = await UsersCurrencies.updateCurrency({
      userId,
      currencyCode,
      isDefaultCurrency: true,
    });

    const currency = await Currencies.getCurrency({ code: currencyCode });

    await Transactions.updateTransactions(
      {
        refCurrencyCode: currency.code,
      },
      { userId, accountType: ACCOUNT_TYPES.system },
    );

    return result;
  },
);

export const deleteUserCurrency = withTransaction(
  async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
    const passedCurrency = await UsersCurrencies.getCurrency({
      userId,
      currencyCode,
    });

    if (!passedCurrency) {
      throw new ValidationError({
        message: `Currency with code "${currencyCode}" does not exist.`,
      });
    }

    if (passedCurrency.isDefaultCurrency) {
      throw new ValidationError({
        message: 'It is not allowed to delete default currency. Unmake it default first.',
      });
    }

    const accounts = await Accounts.getAccountsByCurrency({
      userId,
      currencyCode,
    });

    if (accounts.length) {
      throw new ValidationError({
        message: `
          It is not allowed to delete currency associated with any accounts. Delete accounts first.
          Accounts names: "${accounts.map((item) => item.name)}".
        `,
        details: {
          accounts,
        },
      });
    }

    const defaultCurrency = await UsersCurrencies.getCurrency({
      userId,
      isDefaultCurrency: true,
    });

    if (!defaultCurrency) {
      throw new UnexpectedError(
        API_ERROR_CODES.unexpected,
        'Cannot delete currency. Default currency is not present in the system',
      );
    }

    await Transactions.updateTransactions(
      {
        currencyCode: defaultCurrency.currencyCode,
      },
      { userId, currencyCode: passedCurrency.currencyCode },
    );

    await UsersCurrencies.deleteCurrency({
      userId,
      currencyCode,
    });
  },
);
