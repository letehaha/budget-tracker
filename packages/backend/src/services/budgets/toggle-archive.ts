import { BUDGET_STATUSES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import { withTransaction } from '@services/common/with-transaction';

export const toggleBudgetArchive = withTransaction(
  async ({ id, userId, isArchived }: { id: number; userId: number; isArchived: boolean }) => {
    const budget = await Budgets.findOne({ where: { id, userId } });

    if (!budget) {
      throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
    }

    await budget.update({
      status: isArchived ? BUDGET_STATUSES.archived : BUDGET_STATUSES.active,
    });

    return budget;
  },
);
