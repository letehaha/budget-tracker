import { decimalMoney, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransaction } from '@root/serializers';
import { serializeAccount } from '@root/serializers/accounts.serializer';
import { getAccountById } from '@services/accounts.service';
import { adjustAccountBalance } from '@services/accounts/balance-adjustment';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    body: z.object({
      targetBalance: decimalMoney(),
      note: z.string().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const { id: accountId } = params;
    const { id: userId } = user;
    const { targetBalance, note } = body;

    const result = await adjustAccountBalance({
      userId,
      accountId,
      targetBalance,
      note,
    });

    const account = await getAccountById({ id: accountId, userId });

    return {
      data: {
        transaction: result.transaction ? serializeTransaction(result.transaction) : null,
        previousBalance: result.previousBalance.toNumber(),
        newBalance: result.newBalance.toNumber(),
        account: account ? serializeAccount(account) : null,
      },
    };
  },
);
