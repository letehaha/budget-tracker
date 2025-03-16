import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { ValidationError } from '@js/errors';
import { ExchangeRatePair, UpdateExchangeRatePair } from '@models/UserExchangeRates.model';
import * as userExchangeRates from '@services/user-exchange-rate';
import * as userService from '@services/user.service';

import { errorHandler } from './helpers';

export const getUser = async (req, res: CustomResponse) => {
  const { id } = req.user;

  try {
    const user = await userService.getUser(Number(id));

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: user,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const updateUser = async (req, res: CustomResponse) => {
  const { id } = req.user;
  const {
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
    email: string;
    firstName: string;
    lastName: string;
    middleName: string;
    password: string;
    avatar: string;
    totalBalance: number;
  } = req.body;

  try {
    const user = await userService.updateUser({
      id: Number(id),
      username,
      email,
      firstName,
      lastName,
      middleName,
      password,
      avatar,
      totalBalance,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: user,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const deleteUser = async (req, res: CustomResponse) => {
  const { id } = req.user;

  try {
    await userService.deleteUser(Number(id));

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: {},
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getUserCurrencies = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  try {
    const result = await userService.getUserCurrencies({
      userId: Number(userId),
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getUserBaseCurrency = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  try {
    const result = await userService.getUserBaseCurrency({
      userId: Number(userId),
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const setBaseUserCurrency = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { currencyId } = req.body;

  try {
    const result = await userService.setBaseUserCurrency({
      userId: Number(userId),
      currencyId: Number(currencyId),
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const editUserCurrency = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  const {
    currencyId,
    exchangeRate,
    liveRateUpdate,
  }: {
    currencyId: number;
    exchangeRate?: number;
    liveRateUpdate?: boolean;
  } = req.body;

  // TODO: types validation

  try {
    const result = await userService.editUserCurrency({
      userId,
      currencyId,
      exchangeRate,
      liveRateUpdate,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const setDefaultUserCurrency = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { currencyId }: { currencyId: number } = req.body;

  // TODO: types validation

  try {
    const result = await userService.setDefaultUserCurrency({
      userId,
      currencyId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const deleteUserCurrency = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  const { currencyId }: { currencyId: number } = req.body;

  try {
    await userService.deleteUserCurrency({
      userId,
      currencyId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getCurrenciesExchangeRates = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;

    const data = await userExchangeRates.getUserExchangeRates({ userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const editUserCurrencyExchangeRate = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const { pairs }: { pairs: UpdateExchangeRatePair[] } = req.body;

    if (!pairs) {
      throw new ValidationError({ message: '"pairs" is required.' });
    }

    if (!Array.isArray(pairs)) {
      throw new ValidationError({ message: '"pairs" should be an array.' });
    }

    if (pairs.some((item) => item.baseCode === item.quoteCode)) {
      throw new ValidationError({
        message: 'You cannot edit pair with the same base and quote currency code.',
      });
    }

    pairs.forEach((pair) => {
      if (!pairs.some((item) => item.baseCode === pair.quoteCode)) {
        throw new ValidationError({
          message: "When changing base-qoute pair rate, you need to also change opposite pair's rate.",
        });
      }
    });

    const data = await userExchangeRates.editUserExchangeRates({
      userId,
      pairs,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const removeUserCurrencyExchangeRate = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const { pairs }: { pairs: ExchangeRatePair[] } = req.body;

    if (!pairs) {
      throw new ValidationError({ message: '"pairs" is required.' });
    }

    if (!Array.isArray(pairs)) {
      throw new ValidationError({ message: '"pairs" should be an array.' });
    }

    pairs.forEach((pair) => {
      if (!pairs.some((item) => item.baseCode === pair.quoteCode)) {
        throw new ValidationError({
          message: "When removing base-qoute pair rate, you need to also remove opposite pair's rate.",
        });
      }
    });

    await userExchangeRates.removeUserExchangeRates({ userId, pairs });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
