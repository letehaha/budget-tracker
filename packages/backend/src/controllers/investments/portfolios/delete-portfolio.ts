import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deletePortfolio } from '@services/investments/portfolios/delete.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    body: z
      .object({
        force: booleanQuery().optional(),
      })
      .optional(),
  }),
  async ({ user, params, body }) => {
    const result = await deletePortfolio({
      userId: user.id,
      portfolioId: params.id,
      force: body?.force,
    });

    return { data: result };
  },
);
