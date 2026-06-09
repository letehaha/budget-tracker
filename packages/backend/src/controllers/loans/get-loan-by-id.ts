import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeLoan } from '@root/serializers/loans.serializer';
import { getLoanById } from '@services/loans/get-loan-by-id.service';
import { projectLoan } from '@services/loans/project-loan';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const loanDetails = await getLoanById({ userId: user.id, accountId: params.id });
  const projection = projectLoan({
    loanDetails,
    account: loanDetails.account,
    today: new Date(),
  });

  return { data: serializeLoan({ loanDetails, projection }) };
});
