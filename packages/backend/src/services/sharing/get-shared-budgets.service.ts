import Budgets from '@models/budget.model';
import Users from '@models/users.model';
import type { Includeable, WhereOptions } from '@sequelize/core';

import { ShareContext, buildOwnerContext, loadSharedByIdFor, loadSharedFor } from './share-context-resolver';
import { budgetShareable } from './shareables/budget.shareable';

/**
 * Per-budget share context attached to model instances by the budgets service so the
 * serializer can emit the public-facing `share` block.
 *
 * Identical shape to `AccountShareContext` — the recipient-facing payload is
 * resource-agnostic on the frontend, so keeping the shape identical lets the same UI
 * components consume both. Budgets currently never carry a household `accessSource`
 * (explicit-share only), but the field stays typed against the full `AccessSource`
 * union so a future selective-household-budget source doesn't need a type widening.
 */
export type BudgetShareContext = ShareContext;

/**
 * Build the share context for a budget the requesting user owns. Permission is
 * implicit `manage`.
 */
export const buildOwnerBudgetShareContext = async ({ ownerUser }: { ownerUser: Users }): Promise<BudgetShareContext> =>
  buildOwnerContext({ ownerUser });

/**
 * Returns budgets the user has been granted access to (accepted shares only) along
 * with the recipient share context. Callers may pass `where` to push status filters
 * down and `include` to hydrate associations (e.g. categories) in the same query —
 * avoids the post-load re-fetch pattern that used to exist in the budgets service.
 */
export const getSharedBudgetsForUser = ({
  userId,
  where,
  include,
}: {
  userId: number;
  where?: WhereOptions;
  include?: Includeable[];
}): Promise<Array<Budgets & { _shareContext: BudgetShareContext }>> =>
  loadSharedFor({
    userId,
    shareable: budgetShareable,
    where,
    include,
  });

/**
 * Looks up a single shared budget by id for the calling user. Returns `null` when the
 * caller is the owner (caller handles the owner branch separately) or has no accepted
 * share. Callers may pass `include` to hydrate associations in the same query.
 */
export const getSharedBudgetById = ({
  userId,
  id,
  include,
}: {
  userId: number;
  id: string;
  include?: Includeable[];
}): Promise<(Budgets & { _shareContext: BudgetShareContext }) | null> =>
  loadSharedByIdFor({
    userId,
    shareable: budgetShareable,
    id,
    include,
  });
