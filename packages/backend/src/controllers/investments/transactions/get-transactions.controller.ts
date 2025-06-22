import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getTransactions } from '@services/investments/transactions/get.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({}).optional(),
  query: z.object({
    accountId: recordId().optional(),
    securityId: recordId().optional(),
    category: z.nativeEnum(INVESTMENT_TRANSACTION_CATEGORY).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(20),
    offset: z.coerce.number().min(0).optional().default(0),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const result = await getTransactions({ userId: user.id, ...query });

  return { data: result };
});
