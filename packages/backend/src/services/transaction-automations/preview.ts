import {
  ACCOUNT_TYPES,
  type AutomationConditions,
  type AutomationPreviewMatch,
  type AutomationPreviewResult,
  type RecordId,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroups from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import { findTransactions } from '@models/transactions-query';
import { Op, WhereOptions } from 'sequelize';

import { type AutomationResolvers, buildAutomationContext, resolveGroupAncestry } from './build-context';
import { buildEligibilityWhere } from './eligibility';
import { evaluateConditions } from './evaluate-conditions';

// ponytail: account/type items are pushed to SQL under match:'all'; everything else is an
// in-memory scan of the last 1 000 eligible rows. Add a date-range prefilter if large histories complain.

const SCAN_LIMIT = 1000;
const MATCHES_RETURNED = 5;

/**
 * Under `all` every item must hold, so narrowing on one of them can only drop rows that
 * would fail it anyway — a second item of the same field overwriting the key stays correct.
 * `payee not_in` is left in memory: SQL `NOT IN` drops NULL payees, which the evaluator matches.
 */
const sqlPrefilter = ({ conditions }: { conditions: AutomationConditions }): WhereOptions => {
  const where: Record<string, unknown> = {};
  if (conditions.match !== 'all') return where;

  for (const item of conditions.items) {
    if (item.field === 'account') where.accountId = { [item.operator === 'in' ? Op.in : Op.notIn]: item.value };
    if (item.field === 'payee' && item.operator === 'in') where.payeeId = { [Op.in]: item.value };
    if (item.field === 'transactionType') where.transactionType = item.value;
  }

  return where;
};

export const previewAutomation = async ({
  userId,
  conditions,
}: {
  userId: number;
  conditions: AutomationConditions;
}): Promise<AutomationPreviewResult> => {
  const accounts = await Accounts.findAll({
    where: { userId },
    attributes: ['id', 'type', 'bankDataProviderConnectionId'],
  });
  const bankAccountIds = accounts.filter((account) => account.type !== ACCOUNT_TYPES.system).map(({ id }) => id);
  const rows = await findTransactions({
    planned: 'exclude',
    access: { creator: userId },
    balanceAdjustments: 'exclude',
    transfers: { natures: [TRANSACTION_TRANSFER_NATURE.not_transfer] },
    completeness: { cap: { limit: SCAN_LIMIT, onTruncated: 'log', context: { userId } } },
    order: [
      ['time', 'DESC'],
      ['id', 'DESC'],
    ],
    attributes: [
      'id',
      'time',
      'note',
      'externalData',
      'payeeId',
      'amount',
      'refAmount',
      'currencyCode',
      'transactionType',
      'accountId',
      'categoryId',
    ],
    where: {
      ...buildEligibilityWhere({ bankAccountIds }),
      ...sqlPrefilter({ conditions }),
    },
  });

  if (!rows.length) return { matchedCount: 0, scannedCount: 0, matches: [] };

  const accountIds = [...new Set(rows.map((row) => row.accountId))];

  const [groups, memberships] = await Promise.all([
    AccountGroups.findAll({ where: { userId }, attributes: ['id', 'parentGroupId'] }),
    AccountGrouping.findAll({ where: { accountId: accountIds }, attributes: ['accountId', 'groupId'] }),
  ]);

  const groupIdsByAccount = new Map<RecordId, RecordId[]>(
    accountIds.map((accountId) => [
      accountId,
      resolveGroupAncestry({ groups, memberships: memberships.filter((row) => row.accountId === accountId) }),
    ]),
  );
  const connectionByAccount = new Map(
    accounts.map((account) => [account.id, account.bankDataProviderConnectionId ?? null]),
  );

  const resolvers: AutomationResolvers = {
    accountGroupIds: async (accountId) => groupIdsByAccount.get(accountId) ?? [],
    bankConnectionId: async (accountId) => connectionByAccount.get(accountId) ?? null,
  };

  const matches: AutomationPreviewMatch[] = [];
  let matchedCount = 0;

  for (const row of rows) {
    const ctx = buildAutomationContext({ transaction: row, userId, resolvers });
    const { matched } = await evaluateConditions({ ctx, conditions });

    if (!matched) continue;
    matchedCount += 1;

    if (matches.length < MATCHES_RETURNED) {
      matches.push({
        id: row.id,
        time: row.time.toISOString(),
        note: row.note,
        accountId: row.accountId,
        categoryId: row.categoryId,
        amount: row.amount.toNumber(),
        currencyCode: row.currencyCode,
        transactionType: row.transactionType,
      });
    }
  }

  return { matchedCount, scannedCount: rows.length, matches };
};
