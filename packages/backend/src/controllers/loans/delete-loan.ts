import { createController } from '@controllers/helpers/controller-factory';
import { deleteLoan } from '@services/loans/delete-loan.service';
import { loanIdParamsSchema } from '@services/loans/zod-schemas';
import { z } from 'zod';

const schema = z.object({
  params: loanIdParamsSchema,
});

export default createController(schema, async ({ user, params }) => {
  await deleteLoan({ userId: user.id, accountId: params.id });
  return { statusCode: 204 };
});
