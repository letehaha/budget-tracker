import { currencyCode } from '@common/lib/zod/custom-types';
import { authPool } from '@config/auth';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { invalidateAppUserCache } from '@middlewares/better-auth';
import { ExchangeRatePair } from '@models/user-exchange-rates.model';
import * as userExchangeRates from '@services/user-exchange-rate';
import * as userService from '@services/user.service';
import { deleteUser as deleteUserService } from '@services/user/delete-user.service';
import { UniqueConstraintError } from 'sequelize';
import { z } from 'zod';

export const getUser = createController(z.object({}), async ({ user }) => {
  const userData = await userService.getUser(user.id);

  const isAdmin = (process.env.ADMIN_USERS || '').split(',').some((i) => i === user.username);

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
      // Mirrors slugifyUsername output: lowercase ASCII alphanumerics with single
      // hyphens between alphanumeric runs. 1-64 chars matches the signup-side cap.
      username: z
        .string()
        .trim()
        .min(1, 'Username must not be empty')
        .max(64, 'Username must be 64 characters or fewer')
        .regex(
          /^[a-z0-9]+(-[a-z0-9]+)*$/,
          'Username must contain only lowercase letters, digits, and single hyphens (no leading, trailing, or consecutive hyphens)',
        )
        .optional(),
      email: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      middleName: z.string().optional(),
      avatar: z.string().optional(),
      totalBalance: z.number().optional(),
    }),
  }),
  async ({ user, body }) => {
    try {
      const userData = await userService.updateUser({
        id: user.id,
        ...body,
      });

      // Invalidate cached user so the next request picks up the new username/role
      invalidateAppUserCache({ authUserId: user.authUserId });

      return { data: userData };
    } catch (error) {
      // Surface a 422 instead of a 500 when the new username collides with
      // another user's. Without this, the raw UniqueConstraintError bubbles
      // up as an unexpected error.
      if (error instanceof UniqueConstraintError && error.errors?.some((e) => e.path === 'username') && body.username) {
        throw new ValidationError({
          message: t({ key: 'users.usernameAlreadyTaken', variables: { username: body.username } }),
        });
      }
      throw error;
    }
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
