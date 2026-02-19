import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { currencyCode } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { NotFoundError, Unauthorized, ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import { serializeAccount, serializeAccounts } from '@root/serializers';
import * as accountsService from '@services/accounts.service';
import { z } from 'zod';

import { createController } from './helpers/controller-factory';

export const getAccounts = createController(z.object({}), async ({ user }) => {
  const { id: userId } = user;
  const accounts = await accountsService.getAccounts({ userId });
  // Serialize: convert cents to decimal for API response
  return { data: serializeAccounts(accounts) };
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
    // Serialize: convert cents to decimal for API response
    return { data: account ? serializeAccount(account) : null };
  },
);

export const createAccount = createController(
  z.object({
    body: z.object({
      accountCategory: z.nativeEnum(ACCOUNT_CATEGORIES).default(ACCOUNT_CATEGORIES.general),
      currencyCode: currencyCode(),
      name: z.string(),
      type: z.nativeEnum(ACCOUNT_TYPES).default(ACCOUNT_TYPES.system),
      // Amount fields now accept decimals - conversion to cents happens below
      initialBalance: z.number().optional().default(0),
      creditLimit: z.number().optional().default(0),
    }),
  }),
  async ({ user, body }) => {
    const { accountCategory, currencyCode, name, type, initialBalance, creditLimit } = body;
    const { id: userId } = user;

    if (type !== ACCOUNT_TYPES.system && process.env.NODE_ENV === 'production') {
      throw new Unauthorized({
        message: `Only "type: ${ACCOUNT_TYPES.system}" is allowed.`,
      });
    }

    // Convert decimal amounts to cents
    const account = await accountsService.createAccount({
      accountCategory,
      currencyCode,
      name,
      type,
      creditLimit: Money.fromDecimal(creditLimit),
      initialBalance: Money.fromDecimal(initialBalance),
      userId,
    });

    // Serialize: convert cents to decimal for API response
    return { data: account ? serializeAccount(account) : null };
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
      // Amount fields now accept decimals - conversion to cents happens below
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

    // Convert decimal amounts to cents
    const result = await accountsService.updateAccount({
      id,
      userId,
      ...removeUndefinedKeys({
        isEnabled,
        accountCategory,
        currentBalance: currentBalance !== undefined ? Money.fromDecimal(currentBalance) : undefined,
        name,
        creditLimit: creditLimit !== undefined ? Money.fromDecimal(creditLimit) : undefined,
      }),
    });

    // Serialize: convert cents to decimal for API response
    return { data: result ? serializeAccount(result) : null };
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
