import { createController } from '@controllers/helpers/controller-factory';
import { serializeLoan } from '@root/serializers/loans.serializer';
import { createLoan } from '@services/loans/create-loan.service';
import { projectLoan } from '@services/loans/project-loan';
import { createLoanBodySchema } from '@services/loans/zod-schemas';
import { z } from 'zod';

const schema = z.object({
  body: createLoanBodySchema,
});

export default createController(schema, async ({ user, body }) => {
  const loanDetails = await createLoan({ userId: user.id, ...body });
  const projection = projectLoan({
    loanDetails,
    account: loanDetails.account,
    today: new Date(),
  });

  return { data: serializeLoan({ loanDetails, projection }), statusCode: 201 };
});
