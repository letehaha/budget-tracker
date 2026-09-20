import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import { Op } from 'sequelize';

/**
 * Deletes the portfolio transfers funded by (or paid into) accounts that are going away.
 * Must run before the accounts are destroyed: the FK is ON DELETE SET NULL, so afterwards
 * the rows no longer reference the accounts and can't be targeted. Leftovers survive as
 * orphaned contributions and keep counting toward investment stats.
 */
export const removePortfolioTransfersForAccounts = async ({
  userId,
  accountIds,
}: {
  userId: number;
  accountIds: string[];
}) => {
  if (accountIds.length === 0) return;

  await PortfolioTransfers.destroy({
    where: {
      userId,
      [Op.or]: [{ fromAccountId: { [Op.in]: accountIds } }, { toAccountId: { [Op.in]: accountIds } }],
    },
  });
};
