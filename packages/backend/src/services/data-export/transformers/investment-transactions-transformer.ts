import { toUtcDateString } from '@common/utils/date';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { Op } from 'sequelize';

import type { ExportDateRange, InvestmentTransactionRow } from '../types';
import { buildDateRangeClause, resolveRelationName } from './utils';

export async function transformInvestmentTransactions({
  userId,
  dateRange,
}: {
  userId: number;
  dateRange?: ExportDateRange;
}): Promise<InvestmentTransactionRow[]> {
  const portfolios = await Portfolios.findAll({ where: { userId }, attributes: ['id', 'name'] });
  if (portfolios.length === 0) return [];

  const portfolioIds = portfolios.map((p) => p.id);
  const portfolioNameById = new Map(portfolios.map((p) => [String(p.id), p.name]));

  const investmentTxs = await InvestmentTransaction.findAll({
    where: {
      portfolioId: { [Op.in]: portfolioIds },
      ...buildDateRangeClause({ field: 'date', dateRange }),
    },
    order: [['date', 'ASC']],
  });
  if (investmentTxs.length === 0) return [];

  const securityIds = [...new Set(investmentTxs.map((t) => t.securityId))];
  const securities = await Securities.findAll({
    where: { id: { [Op.in]: securityIds } },
    attributes: ['id', 'name', 'symbol'],
  });
  const securityLabelById = new Map(securities.map((s) => [String(s.id), s.symbol ?? s.name ?? '']));

  return investmentTxs.map(
    (tx): InvestmentTransactionRow => ({
      // `tx.date` is a TIMESTAMPTZ Date; emit its UTC calendar day so the export
      // stays human-readable and date-only (the row type is a `YYYY-MM-DD` string).
      date: toUtcDateString(tx.date),
      portfolio: resolveRelationName({
        id: String(tx.portfolioId),
        nameById: portfolioNameById,
        relation: 'portfolio',
        context: `investment_transaction ${tx.id}`,
      }),
      security: resolveRelationName({
        id: String(tx.securityId),
        nameById: securityLabelById,
        relation: 'security',
        context: `investment_transaction ${tx.id}`,
      }),
      type: tx.category,
      quantity: tx.quantity.toNumber(),
      price: tx.price.toNumber(),
      fees: tx.fees.toNumber(),
      totalAmount: tx.amount.toNumber(),
      currency: tx.currencyCode,
    }),
  );
}
