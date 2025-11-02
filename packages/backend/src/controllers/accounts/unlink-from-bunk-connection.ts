import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountsService from '@services/accounts.service';
import z from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const account = await accountsService.unlinkAccountFromBankConnection({
      accountId: params.id,
      userId: user.id,
    });

    return { data: account };
  },
);
