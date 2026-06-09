import { createController } from '@controllers/helpers/controller-factory';
import { serializeLoan } from '@root/serializers/loans.serializer';
import { projectLoan } from '@services/loans/project-loan';
import { updateLoan } from '@services/loans/update-loan.service';
import { loanIdParamsSchema, loanNoteEventSchema } from '@services/loans/zod-schemas';
import { z } from 'zod';

const schema = z.object({
  params: loanIdParamsSchema,
  body: loanNoteEventSchema,
});

export default createController(schema, async ({ user, params, body }) => {
  const loanDetails = await updateLoan({
    userId: user.id,
    accountId: params.id,
    appendNote: body.text,
  });
  const projection = projectLoan({
    loanDetails,
    account: loanDetails.account,
    today: new Date(),
  });

  return { data: serializeLoan({ loanDetails, projection }), statusCode: 201 };
});
