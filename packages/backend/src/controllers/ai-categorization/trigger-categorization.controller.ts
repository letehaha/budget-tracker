import { AI_CATEGORIZATION_MAX_TRANSACTIONS_PER_RUN } from '@bt/shared/types';
import { uniqueRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { triggerCategorization } from '@services/ai-categorization';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    // `min: 1` keeps only two inputs representable: omitted (run over every candidate) or at
    // least one id (run over that subset). An empty array would read as a full unscoped run.
    transactionIds: uniqueRecordIds({ min: 1, max: AI_CATEGORIZATION_MAX_TRANSACTIONS_PER_RUN }).optional(),
  }),
});

export const triggerCategorizationController = createController(schema, async ({ user, body }) => {
  const result = await triggerCategorization({ userId: user.id, transactionIds: body.transactionIds });
  return { data: result };
});
