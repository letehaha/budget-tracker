import { createController } from '@controllers/helpers/controller-factory';
import { serializeLoans } from '@root/serializers/loans.serializer';
import { getLoans } from '@services/loans/get-loans.service';
import { projectLoan } from '@services/loans/project-loan';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const loanRecords = await getLoans({ userId: user.id });
  const today = new Date();

  const decorated = loanRecords.map((loanDetails) => ({
    loanDetails,
    projection: projectLoan({ loanDetails, account: loanDetails.account, today }),
  }));

  return { data: serializeLoans(decorated) };
});
