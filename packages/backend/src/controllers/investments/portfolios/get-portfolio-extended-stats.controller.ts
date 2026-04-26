import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getPortfolioExtendedStats } from '@services/investments/portfolios/extended-stats/get-portfolio-extended-stats.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const stats = await getPortfolioExtendedStats({
    userId: user.id,
    portfolioId: params.id,
  });
  return { data: stats };
});
