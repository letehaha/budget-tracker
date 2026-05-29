import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@services/categories.service';
import z from 'zod';

const schema = z.object({
  query: z.object({
    // Scope to a single account's owner (per F9 / family-sharing-categories): on a shared
    // account the recipient sees the owner's set, on an owned account it's the caller's
    // own set. Mutually exclusive with `includeAccessible`.
    accountId: recordId().optional(),
    // When true, return the caller's categories plus every category referenced by an
    // account the caller has read access to (i.e. all owners of shared accounts). Used
    // by the dashboard / transaction-list display path so a recipient's UI can resolve
    // category names and icons for txs on shared accounts in one fetch instead of N.
    includeAccessible: z.coerce.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;
  const { accountId, includeAccessible } = query;

  const data = await categoriesService.getCategories({ userId, accountId, includeAccessible });

  return { data };
});
