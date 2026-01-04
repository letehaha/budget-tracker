import { currencyCode } from '@common/lib/zod/custom-types';
import { authPool } from '@config/auth';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { ExchangeRatePair, UpdateExchangeRatePair } from '@models/UserExchangeRates.model';
import * as userExchangeRates from '@services/user-exchange-rate';
import * as userService from '@services/user.service';
import { deleteUser as deleteUserService } from '@services/user/delete-user.service';
import { z } from 'zod';

export const getUser = createController(z.object({}), async ({ user }) => {
  const userData = await userService.getUser(user.id);

  const isAdmin = (process.env.ADMIN_USERS as string).split(',').some((i) => i === user.username);

  // Fetch email from better-auth's ba_user table
  let email: string | null = null;
  if (userData?.authUserId) {
    const result = await authPool.query('SELECT email FROM ba_user WHERE id = $1', [userData.authUserId]);
    if (result.rows.length > 0) {
      email = result.rows[0].email;
    }
  }

  return { data: { ...userData, email, isAdmin } };
});

export const updateUser = createController(
  z.object({
    body: z.object({
      username: z.string().optional(),
      email: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      middleName: z.string().optional(),
      password: z.string().optional(),
      avatar: z.string().optional(),
      totalBalance: z.number().optional(),
    }),
  }),
  async ({ user, body }) => {
    const userData = await userService.updateUser({
      id: user.id,
      ...body,
    });
    return { data: userData };
  },
);

export const deleteUser = createController(z.object({}), async ({ user }) => {
  await deleteUserService({ userId: user.id });
});

export const getUserCurrencies = createController(z.object({}), async ({ user }) => {
  const result = await userService.getUserCurrencies({
    userId: user.id,
  });
  return { data: result };
});

export const getUserBaseCurrency = createController(z.object({}), async ({ user }) => {
  const result = await userService.getUserBaseCurrency({
    userId: user.id,
  });
  return { data: result };
});

export const setBaseUserCurrency = createController(
  z.object({
    body: z.object({
      currencyCode: currencyCode(),
    }),
  }),
  async ({ user, body }) => {
    const result = await userService.setBaseUserCurrency({
      userId: user.id,
      currencyCode: body.currencyCode,
    });
    return { data: result };
  },
);

export const editUserCurrency = createController(
  z.object({
    body: z.object({
      currencyCode: currencyCode(),
      exchangeRate: z.number().optional(),
      liveRateUpdate: z.boolean().optional(),
    }),
  }),
  async ({ user, body }) => {
    const result = await userService.editUserCurrency({
      userId: user.id,
      currencyCode: body.currencyCode,
      exchangeRate: body.exchangeRate,
      liveRateUpdate: body.liveRateUpdate,
    });
    return { data: result };
  },
);

export const setDefaultUserCurrency = createController(
  z.object({
    body: z.object({
      currencyCode: currencyCode(),
    }),
  }),
  async ({ user, body }) => {
    const result = await userService.setDefaultUserCurrency({
      userId: user.id,
      currencyCode: body.currencyCode,
    });
    return { data: result };
  },
);

export const deleteUserCurrency = createController(
  z.object({
    body: z.object({
      currencyCode: currencyCode(),
    }),
  }),
  async ({ user, body }) => {
    await userService.deleteUserCurrency({
      userId: user.id,
      currencyCode: body.currencyCode,
    });
  },
);

export const getCurrenciesExchangeRates = createController(z.object({}), async ({ user }) => {
  const data = await userExchangeRates.getUserExchangeRates({ userId: user.id });
  return { data };
});

const exchangeRatePairSchema = z.object({
  baseCode: z.string(),
  quoteCode: z.string(),
  rate: z.number().optional(),
});

export const editUserCurrencyExchangeRate = createController(
  z.object({
    body: z.object({
      pairs: z.array(exchangeRatePairSchema),
    }),
  }),
  async ({ user, body }) => {
    const { pairs } = body;

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
      userId: user.id,
      pairs: pairs as UpdateExchangeRatePair[],
    });

    return { data };
  },
);

export const removeUserCurrencyExchangeRate = createController(
  z.object({
    body: z.object({
      pairs: z.array(exchangeRatePairSchema),
    }),
  }),
  async ({ user, body }) => {
    const { pairs } = body;

    pairs.forEach((pair) => {
      if (!pairs.some((item) => item.baseCode === pair.quoteCode)) {
        throw new ValidationError({
          message: "When removing base-qoute pair rate, you need to also remove opposite pair's rate.",
        });
      }
    });

    await userExchangeRates.removeUserExchangeRates({
      userId: user.id,
      pairs: pairs as ExchangeRatePair[],
    });

    return {};
  },
);
