import Accounts from '@models/accounts.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import { Op } from 'sequelize';

import type { PortfolioTransferRow } from '../types';
import { resolveRelationName } from './utils';

export async function transformPortfolioTransfers({ userId }: { userId: number }): Promise<PortfolioTransferRow[]> {
  const transfers = await PortfolioTransfers.findAll({ where: { userId }, order: [['date', 'ASC']] });
  if (transfers.length === 0) return [];

  const accountIds = new Set<string>();
  const portfolioIds = new Set<string>();
  for (const t of transfers) {
    if (t.fromAccountId) accountIds.add(String(t.fromAccountId));
    if (t.toAccountId) accountIds.add(String(t.toAccountId));
    if (t.fromPortfolioId) portfolioIds.add(String(t.fromPortfolioId));
    if (t.toPortfolioId) portfolioIds.add(String(t.toPortfolioId));
  }

  // Cross-user guard: filter both account and portfolio lookups by userId
  // so a misdirected from/to FK cannot surface another user's name.
  const [accounts, portfolios] = await Promise.all([
    accountIds.size
      ? Accounts.findAll({ where: { userId, id: { [Op.in]: [...accountIds] } }, attributes: ['id', 'name'] })
      : Promise.resolve([] as Accounts[]),
    portfolioIds.size
      ? Portfolios.findAll({ where: { userId, id: { [Op.in]: [...portfolioIds] } }, attributes: ['id', 'name'] })
      : Promise.resolve([] as Portfolios[]),
  ]);

  const accountNameById = new Map(accounts.map((a) => [String(a.id), a.name]));
  const portfolioNameById = new Map(portfolios.map((p) => [String(p.id), p.name]));

  const resolveSide = ({
    accountId,
    portfolioId,
    side,
    transferId,
  }: {
    accountId: string | null;
    portfolioId: string | null;
    side: 'from' | 'to';
    transferId: string | number;
  }): string => {
    if (accountId) {
      return resolveRelationName({
        id: String(accountId),
        nameById: accountNameById,
        relation: 'account',
        context: `portfolio_transfer ${transferId} ${side}`,
      });
    }
    if (portfolioId) {
      return resolveRelationName({
        id: String(portfolioId),
        nameById: portfolioNameById,
        relation: 'portfolio',
        context: `portfolio_transfer ${transferId} ${side}`,
      });
    }
    return '';
  };

  return transfers.map(
    (transfer): PortfolioTransferRow => ({
      date: transfer.date,
      fromAccount: resolveSide({
        accountId: transfer.fromAccountId,
        portfolioId: transfer.fromPortfolioId,
        side: 'from',
        transferId: transfer.id,
      }),
      toAccount: resolveSide({
        accountId: transfer.toAccountId,
        portfolioId: transfer.toPortfolioId,
        side: 'to',
        transferId: transfer.id,
      }),
      amount: transfer.amount.toNumber(),
      currency: transfer.currencyCode,
      note: transfer.description ?? '',
    }),
  );
}
