import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import { addAccountToGroup } from '@services/account-groups/add-account-to-group';
import { createAccountGroup } from '@services/account-groups/create-account-group';

import { DEMO_CONFIG, type DemoAccountKey } from './demo-config';

/**
 * Account groups for the demo user.
 *
 * Groups stay flat: `getAccountGroups` returns a child group's accounts
 * unhydrated, so the settings page renders every group at one level and names
 * its parent instead of nesting. Seeding a hierarchy would surface that edge.
 */
const DEMO_ACCOUNT_GROUPS: {
  name: string;
  accountKeys?: DemoAccountKey[];
  accountCategories?: ACCOUNT_CATEGORIES[];
}[] = [
  { name: 'Day-to-day', accountKeys: ['main_checking', 'cash'] },
  { name: 'Travel', accountKeys: ['travel_card'] },
  { name: 'Savings & Goals', accountKeys: ['savings'] },
  // Vehicle and loan accounts are created by their own seeders under generated
  // names, so these two match on category rather than naming accounts.
  { name: 'Vehicles', accountCategories: [ACCOUNT_CATEGORIES.vehicle] },
  { name: 'Debt', accountCategories: [ACCOUNT_CATEGORIES.loan] },
];

/**
 * Runs after every account-producing seeder, since it groups the vehicle and
 * loan accounts those create.
 */
export async function setupAccountGroups({ userId }: { userId: number }): Promise<void> {
  const accounts = await Accounts.findAll({
    where: { userId },
    attributes: ['id', 'name', 'accountCategory'],
  });

  // The DB rows carry display names; the config addresses accounts by key.
  const nameByAccountKey = new Map<DemoAccountKey, string>(
    DEMO_CONFIG.accounts.map((account) => [account.key, account.name]),
  );

  let groupedCount = 0;

  for (const groupConfig of DEMO_ACCOUNT_GROUPS) {
    const names = new Set(groupConfig.accountKeys?.map((key) => nameByAccountKey.get(key)));
    const members = accounts.filter(
      (account) => names.has(account.name) || groupConfig.accountCategories?.includes(account.accountCategory),
    );

    if (!members.length) continue;

    const group = await createAccountGroup({ userId, name: groupConfig.name });

    for (const account of members) {
      await addAccountToGroup({ userId, accountId: account.id, groupId: group.id });
      groupedCount += 1;
    }
  }

  logger.info(`Created demo account groups (${groupedCount} accounts grouped) for user ${userId}`);
}
