import { createController } from '@controllers/helpers/controller-factory';
import { getPortfoliosAnnualizedReturns } from '@services/investments/portfolios/get-portfolios-annualized-returns.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await getPortfoliosAnnualizedReturns({ userId: user.id });
  return { data };
});
