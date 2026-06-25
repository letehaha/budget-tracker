import { createController } from '@controllers/helpers/controller-factory';
import { searchBrands } from '@services/brand-logos';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      q: z.string().trim().max(200).optional(),
    })
    .optional(),
});

// Shared brand-logo search backing the manual logo picker for every entity
// (payees, subscriptions). Proxies the logo.dev Brand Search API.
export default createController(schema, async ({ query }) => {
  const q = query?.q ?? '';

  if (!q) {
    return { data: { results: [] } };
  }

  const results = await searchBrands({ query: q });
  return { data: { results } };
});
