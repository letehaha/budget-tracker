import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { restorePortfolio } from '@services/investments/portfolios/restore.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const portfolio = await restorePortfolio({
      userId: user.id,
      portfolioId: params.id,
    });

    return { data: portfolio };
  },
);
