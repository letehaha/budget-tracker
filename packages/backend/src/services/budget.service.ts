import { BUDGET_STATUSES, BudgetModel } from '@bt/shared/types';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { withTransaction } from './common/with-transaction';
import {
  BudgetShareContext,
  buildOwnerBudgetShareContext,
  getSharedBudgetById,
  getSharedBudgetsForUser,
} from './sharing/get-shared-budgets.service';

type BudgetWithCategories = Budgets & {
  categories: Pick<Categories, 'id' | 'name' | 'color' | 'parentId'>[];
};

type BudgetWithShareContext = BudgetWithCategories & { _shareContext?: BudgetShareContext };

const includeCategories = {
  model: Categories,
  as: 'categories',
  attributes: ['id', 'name', 'color', 'parentId'],
};

const filterByStatus = ({ statuses }: { statuses?: BUDGET_STATUSES[] }) =>
  statuses?.length ? { status: { [Op.in]: statuses } } : {};

/**
 * Returns every budget the caller can read: budgets they own (with an owner share
 * context) merged with budgets shared with them (with a recipient share context).
 *
 * Status filter applies to both halves so a caller asking for `active` budgets sees
 * active owned and active shared budgets together.
 */
export const getBudgets = withTransaction(
  async ({ userId, statuses }: { userId: number; statuses?: BUDGET_STATUSES[] }): Promise<BudgetWithShareContext[]> => {
    const [ownedBudgets, sharedBudgets, ownerUser] = await Promise.all([
      Budgets.findAll({
        where: { userId, ...filterByStatus({ statuses }) },
        include: [includeCategories],
      }),
      getSharedBudgetsForUser({ userId }),
      Users.findByPk(userId),
    ]);

    const ownerContext = ownerUser ? await buildOwnerBudgetShareContext({ ownerUser }) : null;

    const ownedWithContext: BudgetWithShareContext[] = ownedBudgets.map((budget) => {
      if (ownerContext) {
        Object.assign(budget, { _shareContext: ownerContext });
      }
      return budget as BudgetWithShareContext;
    });

    // Shared budgets are filtered post-load — `getSharedBudgetsForUser` doesn't filter by
    // status (the share context isn't status-aware), so apply the same predicate here
    // before merging. Also hydrate `categories` for shared rows so the serializer doesn't
    // emit empty category arrays for shared budgets.
    const sharedIds = sharedBudgets.map((b) => b.id);
    const sharedWithCategories = sharedIds.length
      ? await Budgets.findAll({
          where: { id: { [Op.in]: sharedIds }, ...filterByStatus({ statuses }) },
          include: [includeCategories],
        })
      : [];
    const shareContextById = new Map(sharedBudgets.map((b) => [b.id, b._shareContext]));
    const sharedFiltered: BudgetWithShareContext[] = sharedWithCategories.map((budget) => {
      const ctx = shareContextById.get(budget.id);
      if (ctx) {
        Object.assign(budget, { _shareContext: ctx });
      }
      return budget as BudgetWithShareContext;
    });

    return [...ownedWithContext, ...sharedFiltered];
  },
);

export const getBudgetById = withTransaction(
  async ({
    userId,
    id,
  }: {
    userId: BudgetModel['userId'];
    id: BudgetModel['id'];
  }): Promise<BudgetWithShareContext | null> => {
    const owned = await Budgets.findOne({
      where: { userId, id },
      include: [includeCategories],
    });

    if (owned) {
      const ownerUser = await Users.findByPk(userId);
      if (ownerUser) {
        Object.assign(owned, { _shareContext: await buildOwnerBudgetShareContext({ ownerUser }) });
      }
      return owned as BudgetWithShareContext;
    }

    // Not owned — fall through to the shared lookup. `getSharedBudgetById` runs the
    // central auth check and returns the budget with a recipient share context attached.
    // Categories are not eagerly loaded by the shared path, so re-hydrate here.
    const shared = await getSharedBudgetById({ userId, id });
    if (!shared) return null;

    const withCategories = await Budgets.findOne({
      where: { id },
      include: [includeCategories],
    });
    if (!withCategories) return null;

    Object.assign(withCategories, { _shareContext: shared._shareContext });
    return withCategories as BudgetWithShareContext;
  },
);
