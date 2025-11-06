import { createController } from '@controllers/helpers/controller-factory';
import { connectSelectedAccounts } from '@root/services/bank-data-providers/connection/connect-selected-accounts';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    body: z.object({
      accountExternalIds: z.array(z.string()).min(1, 'At least one account must be selected'),
    }),
  }),
  async ({ user, params, body }) => {
    const createdAccounts = await connectSelectedAccounts({
      connectionId: params.connectionId,
      userId: user.id,
      accountExternalIds: body.accountExternalIds,
    });

    return {
      data: {
        syncedAccounts: createdAccounts.map((acc) => ({
          id: acc.id,
          externalId: acc.externalId,
          name: acc.name,
          balance: acc.currentBalance,
          currency: acc.currencyCode,
        })),
        message: `Successfully synced ${createdAccounts.length} account(s)`,
      },
    };
  },
);
