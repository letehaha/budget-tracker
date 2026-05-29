import { PORTFOLIO_TRASH_RETENTION_DAYS } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Portfolios from '@models/investments/portfolios.model';
import { Op } from '@sequelize/core';
import { subDays } from 'date-fns';

import { deletePortfolio } from './delete.service';

interface PurgeDeletedPortfoliosResult {
  purgedCount: number;
  failedCount: number;
}

/**
 * Hard-deletes portfolios that have been soft-deleted for longer than the
 * retention window, cascading to their holdings, transactions, and balances.
 * Called by the daily purge cron.
 *
 * Each portfolio is purged in its own transaction. A single failure (FK blip,
 * locked row, transient DB error) MUST NOT block the rest of the batch — we
 * log per-portfolio and continue, then return a counts breakdown so the cron
 * can surface partial-success in its summary log.
 */
export const purgeDeletedPortfolios = async (): Promise<PurgeDeletedPortfoliosResult> => {
  const cutoff = subDays(new Date(), PORTFOLIO_TRASH_RETENTION_DAYS);

  const expired = await Portfolios.findAll({
    where: { deletedAt: { [Op.lt]: cutoff } },
    paranoid: false,
    attributes: ['id', 'userId'],
  });

  let purgedCount = 0;
  let failedCount = 0;

  for (const row of expired) {
    try {
      await deletePortfolio({ userId: row.userId, portfolioId: row.id, force: true });
      purgedCount += 1;
    } catch (error) {
      failedCount += 1;
      logger.error(
        {
          message: 'Failed to hard-delete portfolio during purge',
          error: error as Error,
        },
        { code: 'PORTFOLIO_PURGE_ITEM_FAILED', portfolioId: row.id, userId: row.userId },
      );
    }
  }

  return { purgedCount, failedCount };
};
