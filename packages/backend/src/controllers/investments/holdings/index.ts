import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { deleteHolding } from '@services/investments/holdings/delete-holding.service';
import { getHoldings } from '@services/investments/holdings/get-holdings.service';
import { z } from 'zod';

export const createHoldingController = createController(
  z.object({
    body: z.object({ accountId: recordId(), securityId: recordId() }),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { securityId, accountId } = body;
    const holding = await createHolding({ userId, accountId, securityId });
    return { data: holding, statusCode: 201 };
  },
);

export const getHoldingsController = createController(
  z.object({
    params: z.object({ accountId: recordId() }),
  }),
  async ({ user, params }) => {
    const holdings = await getHoldings(params.accountId, user.id);

    return { data: holdings };
  },
);

export const deleteHoldingController = createController(
  z.object({
    body: z.object({ accountId: recordId(), securityId: recordId() }),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { accountId, securityId } = body;
    await deleteHolding({ userId, accountId, securityId });
    return { statusCode: 200 };
  },
);
