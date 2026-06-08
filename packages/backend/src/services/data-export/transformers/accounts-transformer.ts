import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroups from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { Op } from 'sequelize';

import type { AccountRow } from '../types';

/**
 * Resolve nested account-group paths into a single string like
 * "Personal / Banking / Checking" so a flat CSV cell can convey the
 * hierarchy without per-level columns.
 */
function buildGroupPath({
  group,
  groupsById,
}: {
  group: AccountGroups | undefined;
  groupsById: Map<string, AccountGroups>;
}): string {
  if (!group) return '';
  const segments: string[] = [];
  let current: AccountGroups | undefined = group;
  const visited = new Set<string>();
  while (current && !visited.has(String(current.id))) {
    visited.add(String(current.id));
    segments.unshift(current.name);
    current = current.parentGroupId ? groupsById.get(String(current.parentGroupId)) : undefined;
  }
  return segments.join(' / ');
}

export async function transformAccounts({ userId }: { userId: number }): Promise<AccountRow[]> {
  const accounts = await Accounts.findAll({ where: { userId }, order: [['name', 'ASC']] });
  if (accounts.length === 0) return [];
  const accountIds = accounts.map((a) => String(a.id));

  const [groups, groupMemberships, providers] = await Promise.all([
    AccountGroups.findAll({ where: { userId } }),
    AccountGrouping.findAll({ where: { accountId: { [Op.in]: accountIds } } }),
    BankDataProviderConnections.findAll({ where: { userId }, attributes: ['id', 'providerType', 'providerName'] }),
  ]);

  const groupsById = new Map<string, AccountGroups>(groups.map((g) => [String(g.id), g]));
  const providerById = new Map<string, BankDataProviderConnections>(providers.map((p) => [String(p.id), p]));

  const groupByAccountId = new Map<string, AccountGroups>();
  for (const link of groupMemberships) {
    const accountId = String((link as unknown as { accountId: string }).accountId);
    const groupId = String((link as unknown as { groupId: string }).groupId);
    const group = groupsById.get(groupId);
    if (group) groupByAccountId.set(accountId, group);
  }

  return accounts.map((account): AccountRow => {
    const provider = account.bankDataProviderConnectionId
      ? providerById.get(String(account.bankDataProviderConnectionId))
      : undefined;
    return {
      name: account.name,
      type: account.type,
      currency: account.currencyCode,
      initialBalance: account.initialBalance.toNumber(),
      currentBalance: account.currentBalance.toNumber(),
      group: buildGroupPath({ group: groupByAccountId.get(String(account.id)), groupsById }),
      excludedFromStats: account.excludeFromStats,
      status: account.status,
      bankProvider: provider ? provider.providerName || provider.providerType : '',
    };
  });
}
