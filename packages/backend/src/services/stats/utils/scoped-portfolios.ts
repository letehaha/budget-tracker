import { type RecordId } from '@bt/shared/types';
import Portfolios from '@models/investments/portfolios.model';
import { Op } from 'sequelize';

/**
 * The user's enabled portfolios, optionally narrowed to a requested subset.
 *
 * The requested ids are intersected against the owned-and-enabled set in the DB —
 * that intersection is what enforces ownership, never the caller's list — so a
 * foreign or disabled id can never widen the scope. Empty or absent `portfolioIds`
 * includes every enabled portfolio.
 *
 * Shared by the stats reports that scope to portfolios so the ownership rule has a
 * single definition rather than a copy per report.
 */
export const getScopedEnabledPortfolios = async ({
  userId,
  portfolioIds,
}: {
  userId: number;
  portfolioIds?: RecordId[];
}): Promise<{ id: RecordId; name: string }[]> =>
  (await Portfolios.findAll({
    where: {
      userId,
      isEnabled: true,
      ...(portfolioIds && portfolioIds.length > 0 ? { id: { [Op.in]: portfolioIds } } : {}),
    },
    attributes: ['id', 'name'],
    raw: true,
  })) as { id: RecordId; name: string }[];
