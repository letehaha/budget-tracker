import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import { Op } from 'sequelize';

import type { BalanceHistoryRow } from '../types';
import { resolveRelationName, toDateOnly } from './utils';

export async function transformBalancesHistory({ userId }: { userId: number }): Promise<BalanceHistoryRow[]> {
  const accounts = await Accounts.findAll({ where: { userId }, attributes: ['id', 'name'] });
  if (accounts.length === 0) return [];

  const accountNameById = new Map(accounts.map((a) => [String(a.id), a.name]));
  const accountIds = [...accountNameById.keys()];

  const balances = await Balances.findAll({
    where: { accountId: { [Op.in]: accountIds } },
    order: [
      ['accountId', 'ASC'],
      ['date', 'ASC'],
    ],
  });

  return balances.map(
    (balance): BalanceHistoryRow => ({
      account: resolveRelationName({
        id: String(balance.accountId),
        nameById: accountNameById,
        relation: 'account',
        context: `balance ${balance.id}`,
      }),
      date: toDateOnly({ value: balance.date }),
      balanceInBaseCurrency: balance.amount.toNumber(),
    }),
  );
}
