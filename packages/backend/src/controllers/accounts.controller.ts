import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, API_RESPONSE_STATUS, endpointsTypes } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { NotFoundError, Unauthorized, ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import * as accountsService from '@services/accounts.service';

import { errorHandler } from './helpers';

export const getAccounts = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  try {
    const accounts = await accountsService.getAccounts({ userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: accounts,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getAccountById = async (req, res: CustomResponse) => {
  const { id } = req.params;
  const { id: userId } = req.user;

  try {
    const account = await accountsService.getAccountById({ userId, id });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: account,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const createAccount = async (req, res) => {
  const {
    accountCategory = ACCOUNT_CATEGORIES.general,
    currencyId,
    name,
    type = ACCOUNT_TYPES.system,
    initialBalance,
    creditLimit,
  }: endpointsTypes.CreateAccountBody = req.body;
  const { id: userId } = req.user;

  try {
    if (type !== ACCOUNT_TYPES.system && process.env.NODE_ENV === 'production') {
      throw new Unauthorized({
        message: `Only "type: ${ACCOUNT_TYPES.system}" is allowed.`,
      });
    }

    const account = await accountsService.createAccount({
      accountCategory,
      currencyId,
      name,
      type,
      creditLimit,
      initialBalance,
      userId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: account,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const updateAccount = async (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const { accountCategory, name, creditLimit, isEnabled, currentBalance }: endpointsTypes.UpdateAccountBody = req.body;
  try {
    const account = await Accounts.findByPk(id);

    if (!account) {
      throw new NotFoundError({
        message: `Account with id "${id}" doesn't exist.`,
      });
    }

    if (account.type !== ACCOUNT_TYPES.system) {
      if (creditLimit || currentBalance) {
        throw new ValidationError({
          message: `'creditLimit', 'currentBalance' are only allowed to be changed for "${ACCOUNT_TYPES.system}" account type`,
        });
      }
    }

    // If user wants to change currentBalance, he can do it in two ways:
    // 1. Create an adjustment transaction
    // 2. Update `currentBalance` field, which will automatically edit initialBalance and balance history
    const result = await accountsService.updateAccount({
      id,
      userId,
      ...removeUndefinedKeys({
        isEnabled,
        accountCategory,
        currentBalance: Number(currentBalance),
        name,
        creditLimit: Number(creditLimit),
      }),
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const deleteAccount = async (req, res) => {
  const { id } = req.params;

  try {
    await accountsService.deleteAccountById({ id });

    return res.status(200).json({ status: API_RESPONSE_STATUS.success });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
