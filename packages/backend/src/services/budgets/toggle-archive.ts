import { BUDGET_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Budgets from '@models/budget.model';
import { withTransaction } from '@services/common/with-transaction';

export const toggleBudgetArchive = withTransaction(
  async ({ id, userId, isArchived }: { id: number; userId: number; isArchived: boolean }) => {
    const budget = await findOrThrowNotFound({
      query: Budgets.findOne({ where: { id, userId } }),
      message: t({ key: 'budgets.budgetNotFound' }),
    });

    await budget.update({
      status: isArchived ? BUDGET_STATUSES.archived : BUDGET_STATUSES.active,
    });

    return budget;
  },
);
