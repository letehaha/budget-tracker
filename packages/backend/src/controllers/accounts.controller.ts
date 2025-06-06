import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { NotFoundError, Unauthorized, ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import * as accountsService from '@services/accounts.service';
import { z } from 'zod';

import { createController } from './helpers/controller-factory';

export const getAccounts = createController(z.object({}), async ({ user }) => {
  const { id: userId } = user;
  const accounts = await accountsService.getAccounts({ userId });
  return { data: accounts };
});

export const getAccountById = createController(
  z.object({
    params: z.object({
      id: z.coerce.number(),
    }),
  }),
  async ({ user, params }) => {
    const { id } = params;
    const { id: userId } = user;

    const account = await accountsService.getAccountById({ userId, id });
    return { data: account };
  },
);

export const createAccount = createController(
  z.object({
    body: z.object({
      accountCategory: z.nativeEnum(ACCOUNT_CATEGORIES).default(ACCOUNT_CATEGORIES.general),
      currencyId: z.number(),
      name: z.string(),
      type: z.nativeEnum(ACCOUNT_TYPES).default(ACCOUNT_TYPES.system),
      initialBalance: z.number().optional().default(0),
      creditLimit: z.number().optional().default(0),
    }),
  }),
  async ({ user, body }) => {
    const { accountCategory, currencyId, name, type, initialBalance, creditLimit } = body;
    const { id: userId } = user;

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

    return { data: account };
  },
);

export const updateAccount = createController(
  z.object({
    params: z.object({
      id: z.coerce.number(),
    }),
    body: z.object({
      accountCategory: z.nativeEnum(ACCOUNT_CATEGORIES).optional(),
      name: z.string().optional(),
      creditLimit: z.number().optional(),
      isEnabled: z.boolean().optional(),
      currentBalance: z.number().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const { id } = params;
    const { id: userId } = user;
    const { accountCategory, name, creditLimit, isEnabled, currentBalance } = body;

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

    const result = await accountsService.updateAccount({
      id,
      userId,
      ...removeUndefinedKeys({
        isEnabled,
        accountCategory,
        currentBalance: currentBalance !== undefined ? Number(currentBalance) : undefined,
        name,
        creditLimit: creditLimit !== undefined ? Number(creditLimit) : undefined,
      }),
    });

    return { data: result };
  },
);

export const deleteAccount = createController(
  z.object({
    params: z.object({
      id: z.coerce.number(),
    }),
  }),
  async ({ params }) => {
    const { id } = params;
    await accountsService.deleteAccountById({ id });
  },
);
