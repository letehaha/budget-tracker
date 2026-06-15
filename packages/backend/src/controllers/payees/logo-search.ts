import { createController } from '@controllers/helpers/controller-factory';
import { searchBrands } from '@services/payees/logo-provider';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      q: z.string().trim().max(200).optional(),
    })
    .optional(),
});

export default createController(schema, async ({ query }) => {
  const q = query?.q ?? '';

  if (!q) {
    return { data: { results: [] } };
  }

  const results = await searchBrands({ query: q });
  return { data: { results } };
});
