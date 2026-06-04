import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const rows = await payeesService.listPayeeIgnoredNames({ userId: user.id });
  return {
    data: rows.map((row) => ({
      id: row.id,
      normalizedName: row.normalizedName,
      rawSample: row.rawSample,
      createdAt: row.createdAt.toISOString(),
    })),
  };
});
