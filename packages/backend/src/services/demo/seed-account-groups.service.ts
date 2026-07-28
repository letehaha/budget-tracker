import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import { addAccountToGroup } from '@services/account-groups/add-account-to-group';
import { createAccountGroup } from '@services/account-groups/create-account-group';

/**
 * Account groups for the demo user.
 *
 * Groups are flat. A child group's accounts come back unhydrated from
 * `getAccountGroups`, so the settings page renders every group at one level and
 * names its parent rather than nesting. Seeding a hierarchy would only show off
 * that rough edge.
 */
const DEMO_ACCOUNT_GROUPS: { name: string; accountNames?: string[]; accountCategories?: ACCOUNT_CATEGORIES[] }[] = [
  { name: 'Day-to-day', accountNames: ['Main Checking', 'Cash'] },
  { name: 'Travel', accountNames: ['Travel Card'] },
  { name: 'Savings & Goals', accountNames: ['Savings'] },
  // Vehicle and loan accounts are created by their own seeders under generated
  // names, so these two match on category rather than listing names.
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

  let groupedCount = 0;

  for (const groupConfig of DEMO_ACCOUNT_GROUPS) {
    const members = accounts.filter(
      (account) =>
        groupConfig.accountNames?.includes(account.name) ||
        groupConfig.accountCategories?.includes(account.accountCategory),
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
