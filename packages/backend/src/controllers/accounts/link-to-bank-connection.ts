import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountsService from '@services/accounts.service';
import z from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    body: z.object({
      connectionId: z.number(),
      externalAccountId: z.string(),
    }),
  }),
  async ({ user, params, body }) => {
    const result = await accountsService.linkAccountToBankConnection({
      accountId: params.id,
      connectionId: body.connectionId,
      externalAccountId: body.externalAccountId,
      userId: user.id,
    });

    return {
      data: {
        account: result.account,
        balanceDifference: result.balanceDifference,
        balanceAdjustmentTransaction: result.balanceAdjustmentTransaction || null,
        message: result.balanceAdjustmentTransaction
          ? `Account linked successfully. Balance adjusted by ${result.balanceDifference}.`
          : 'Account linked successfully.',
      },
    };
  },
);
