import { RESOURCE_TYPES } from '@bt/shared/types';
import Budgets from '@models/budget.model';

import { type ShareableResource, buildPerResourceSource } from '../share-context-resolver';

/**
 * Per-resource share source for budgets: explicit `ResourceShares` row of type
 * `budget`. For now the only source — budgets-via-household will land as a
 * *selective* (owner-picks-which-budgets) source rather than the all-of-grantor's-
 * resources fall-through that accounts use. When that lands it slots into
 * `budgetShareable.sources` without resolver changes.
 */
const budgetPerResourceSource = buildPerResourceSource<Budgets>({
  resourceType: RESOURCE_TYPES.budget,
});

export const budgetShareable: ShareableResource<Budgets> = {
  model: Budgets,
  resourceType: RESOURCE_TYPES.budget,
  sources: [budgetPerResourceSource],
};
