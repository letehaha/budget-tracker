import { API_RESPONSE_STATUS, BalanceModel, endpointsTypes } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import * as statsService from '@services/stats';
import { isBefore, isEqual, isValid } from 'date-fns';

import { errorHandler } from './helpers';

const tryBasicDateValidation = ({ from, to }) => {
  if (from && !isValid(new Date(from))) {
    throw new ValidationError({ message: '"from" is invalid date.' });
  }
  if (to && !isValid(new Date(to))) {
    throw new ValidationError({ message: '"to" is invalid date.' });
  }
  if (from && to && !isEqual(new Date(from), new Date(to)) && !isBefore(new Date(from), new Date(to))) {
    throw new ValidationError({
      message: '"from" cannot be greater than "to" date.',
    });
  }
};

export const getBalanceHistory = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { from, to, accountId }: endpointsTypes.GetBalanceHistoryPayload = req.query;

  try {
    tryBasicDateValidation({ from, to });

    let balanceHistory: BalanceModel[];
    if (accountId) {
      balanceHistory = await statsService.getBalanceHistoryForAccount({
        userId,
        from,
        to,
        accountId,
      });
    } else {
      balanceHistory = await statsService.getBalanceHistory({
        userId,
        from,
        to,
      });
    }

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: balanceHistory,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getTotalBalance = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { date }: endpointsTypes.GetTotalBalancePayload = req.query;

  try {
    if (!isValid(new Date(date))) {
      throw new ValidationError({ message: '"date" is invalid date.' });
    }

    const totalBalance = await statsService.getTotalBalance({
      userId,
      date,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: totalBalance,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getExpensesHistory = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { from, to, accountId }: endpointsTypes.GetSpendingCategoriesPayload = req.query;

  try {
    tryBasicDateValidation({ from, to });

    const result = await statsService.getExpensesHistory(
      removeUndefinedKeys({
        userId,
        from,
        to,
        accountId,
      }),
    );

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getSpendingsByCategories = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { from, to, accountId }: endpointsTypes.GetSpendingCategoriesPayload = req.query;

  try {
    tryBasicDateValidation({ from, to });

    const result = await statsService.getSpendingsByCategories(
      removeUndefinedKeys({
        userId,
        from,
        to,
        accountId,
      }),
    );

    return res.status(200).json<endpointsTypes.GetSpendingsByCategoriesReturnType>({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getExpensesAmountForPeriod = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { from, to, accountId }: endpointsTypes.GetSpendingCategoriesPayload = req.query;

  try {
    tryBasicDateValidation({ from, to });

    const result = await statsService.getExpensesAmountForPeriod(
      removeUndefinedKeys({
        userId,
        from,
        to,
        accountId,
      }),
    );

    return res.status(200).json<number>({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
