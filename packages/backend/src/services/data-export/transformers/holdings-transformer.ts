import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { Op } from 'sequelize';

import type { HoldingRow } from '../types';
import { resolveRelationName } from './utils';

const UNRESOLVED_SECURITY_SENTINEL = '(unresolved security)';

export async function transformHoldings({ userId }: { userId: number }): Promise<HoldingRow[]> {
  const portfolios = await Portfolios.findAll({ where: { userId }, attributes: ['id', 'name'] });
  if (portfolios.length === 0) return [];

  const portfolioIds = portfolios.map((p) => p.id);
  const portfolioNameById = new Map(portfolios.map((p) => [String(p.id), p.name]));

  const holdings = await Holdings.findAll({
    where: { portfolioId: { [Op.in]: portfolioIds } },
    order: [
      ['portfolioId', 'ASC'],
      ['securityId', 'ASC'],
    ],
  });
  if (holdings.length === 0) return [];

  const securityIds = [...new Set(holdings.map((h) => h.securityId))];
  const securities = await Securities.findAll({
    where: { id: { [Op.in]: securityIds } },
    attributes: ['id', 'name', 'symbol'],
  });
  // Single lookup so a dangling security FK logs and sentinels both columns
  // exactly once per holding (the prior two-map shape logged twice – once
  // for ticker, once for name – when the FK pointed nowhere).
  const securityById = new Map(securities.map((s) => [String(s.id), s]));

  return holdings.map((holding): HoldingRow => {
    const quantity = holding.quantity.toNumber();
    const costBasis = holding.costBasis.toNumber();
    const securityIdStr = String(holding.securityId);
    const security = securityById.get(securityIdStr);
    let securityTicker: string;
    let securityName: string;
    if (!security) {
      logger.warn(
        `Data export: security reference ${securityIdStr} could not be resolved (context=holding ${holding.id}); emitting unresolved sentinel.`,
      );
      securityTicker = UNRESOLVED_SECURITY_SENTINEL;
      securityName = UNRESOLVED_SECURITY_SENTINEL;
    } else {
      securityTicker = security.symbol ?? '';
      securityName = security.name ?? '';
    }
    return {
      portfolio: resolveRelationName({
        id: String(holding.portfolioId),
        nameById: portfolioNameById,
        relation: 'portfolio',
        context: `holding ${holding.id}`,
      }),
      securityTicker,
      securityName,
      quantity,
      costBasis,
      // Null for closed positions: emitting `0` would hide a residual cost
      // basis with no shares to amortize it against. Writers render null as
      // an empty cell.
      costBasisPerUnit: quantity === 0 ? null : costBasis / quantity,
    };
  });
}
