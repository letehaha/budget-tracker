import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { deleteHolding } from '@services/investments/holdings/delete-holding.service';
import { getHoldings } from '@services/investments/holdings/get-holdings.service';
import { z } from 'zod';

export const createHoldingController = createController(
  z.object({
    body: z.object({ portfolioId: recordId(), securityId: recordId() }),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { securityId, portfolioId } = body;
    const holding = await createHolding({ userId, portfolioId, securityId });
    return { data: holding, statusCode: 201 };
  },
);

export const getHoldingsController = createController(
  z.object({
    params: z.object({ portfolioId: recordId() }),
    query: z.object({ securityId: recordId().optional() }),
  }),
  async ({ user, params, query }) => {
    const holdings = await getHoldings({
      userId: user.id,
      portfolioId: params.portfolioId,
      securityId: query.securityId,
    });

    return { data: holdings };
  },
);

export const deleteHoldingController = createController(
  z.object({
    body: z.object({ portfolioId: recordId(), securityId: recordId() }),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { portfolioId, securityId } = body;
    await deleteHolding({ userId, portfolioId, securityId });
    return { statusCode: 200 };
  },
);
