import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

import { serializePayeeWithStats } from './serializer';

const schema = z.object({
  query: z
    .object({
      q: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional(),
      sortBy: z.enum(['lastSeen', 'name', 'netFlow', 'transactionCount']).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, query }) => {
  const rows = await payeesService.listPayees({
    userId: user.id,
    q: query?.q,
    limit: query?.limit,
    offset: query?.offset,
    sortBy: query?.sortBy,
    sortDir: query?.sortDir,
  });
  return { data: rows.map((row) => serializePayeeWithStats(row)) };
});
