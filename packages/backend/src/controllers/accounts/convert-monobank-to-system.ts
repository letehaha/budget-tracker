import { ACCOUNT_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { NotAllowedError, NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import z from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const account = await Accounts.findOne({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!account) {
      throw new NotFoundError({ message: 'Account not found' });
    }

    if (account.type !== ACCOUNT_TYPES.monobank) {
      throw new NotAllowedError({ message: 'Only monobank accounts can be converted to system accounts' });
    }

    if (account.bankDataProviderConnectionId) {
      throw new NotAllowedError({
        message: 'This account is already linked to a bank connection. Use the unlink endpoint instead.',
      });
    }

    // Convert to system account
    await account.update({
      type: ACCOUNT_TYPES.system,
      externalId: null,
      externalData: null,
    });

    return {
      data: {
        id: account.id,
        name: account.name,
        type: account.type,
      },
    };
  },
);
