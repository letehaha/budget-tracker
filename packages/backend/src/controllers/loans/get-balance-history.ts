import { createController } from '@controllers/helpers/controller-factory';
import { getLoanBalanceHistory } from '@services/loans/get-loan-balance-history.service';
import { loanIdParamsSchema } from '@services/loans/zod-schemas';
import { z } from 'zod';

const schema = z.object({
  params: loanIdParamsSchema,
});

export default createController(schema, async ({ user, params }) => {
  const data = await getLoanBalanceHistory({ userId: user.id, accountId: params.id });
  return { data };
});
