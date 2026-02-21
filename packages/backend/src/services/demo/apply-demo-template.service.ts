import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { roundHalfToEven } from '@common/utils/round-half-to-even';
import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
import { connection } from '@models/index';
import { subDays } from 'date-fns';
import { QueryTypes } from 'sequelize';

import { getDemoTemplate } from './demo-template-cache.service';
import {
  DEMO_CONFIG,
  createAccounts,
  createBudgets,
  createCategories,
  createTags,
  setupCurrencies,
} from './seed-demo-data.service';

const ACCOUNT_NAME_TO_KEY: Record<string, string> = {
  'Main Checking': 'main_checking',
  Savings: 'savings',
  'Travel Card': 'travel_card',
  Cash: 'cash',
};

/**
 * Fast application of the pre-generated demo template to a user.
 * Uses bulk INSERT with hooks disabled and raw SQL for balance computation.
 */
export async function applyDemoTemplate({ userId }: { userId: number }): Promise<void> {
  const startTime = Date.now();
  logger.info(`Applying demo template for user ${userId}...`);

  const template = getDemoTemplate();

  await setupCurrencies({ userId });
  const categoryMap = await createCategories({ userId });
  await createTags({ userId });
  const accounts = await createAccounts({ userId });

  // Build lookup maps from created accounts
  const accountKeyToId: Record<string, number> = {};
  const accountKeyToAccountType: Record<string, ACCOUNT_TYPES> = {};
  const accountKeyToCurrency: Record<string, string> = {};
  for (const account of accounts) {
    const key = ACCOUNT_NAME_TO_KEY[account.name];
    if (key) {
      accountKeyToId[key] = account.id;
      accountKeyToAccountType[key] = account.type;
      accountKeyToCurrency[key] = account.currencyCode;
    }
  }

  const fallbackCategoryId = categoryMap.get('other') || 1;

  const rows = template.transactions.map((tx) => {
    const accountId = accountKeyToId[tx.accountKey];
    const categoryId = categoryMap.get(tx.categoryKey) || fallbackCategoryId;
    const currencyCode = accountKeyToCurrency[tx.accountKey] || DEMO_CONFIG.baseCurrency;
    const accountType = accountKeyToAccountType[tx.accountKey] || ACCOUNT_TYPES.system;
    const time = subDays(template.generatedAt, tx.dayOffset);

    const exchangeRate = DEMO_CONFIG.exchangeRates[currencyCode];
    const refAmount = exchangeRate ? roundHalfToEven(tx.amount / exchangeRate) : tx.amount;

    return {
      userId,
      amount: tx.amount,
      refAmount,
      transactionType: tx.transactionType,
      categoryId,
      accountId,
      currencyCode,
      refCurrencyCode: DEMO_CONFIG.baseCurrency,
      accountType,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      paymentType: tx.paymentType,
      note: tx.note,
      time,
      commissionRate: 0,
      refCommissionRate: 0,
      cashbackAmount: 0,
      refundLinked: false,
    };
  });

  logger.info(`Bulk inserting ${rows.length} demo transactions...`);
  await Transactions.bulkCreate(rows, { hooks: false, validate: false });

  await updateAccountBalances({ userId });
  await rebuildBalancesHistory({ userId });
  await createBudgets({ userId, categoryMap });

  const duration = Date.now() - startTime;
  logger.info(`Demo template applied for user ${userId} in ${duration}ms (${rows.length} transactions)`);
}

/**
 * Update account currentBalance and refCurrentBalance based on actual transactions.
 */
async function updateAccountBalances({ userId }: { userId: number }): Promise<void> {
  const sequelize = connection.sequelize;

  await sequelize.query(
    `
    UPDATE "Accounts" SET
      "currentBalance" = "initialBalance" + COALESCE((
        SELECT SUM(
          CASE WHEN t."transactionType" = :incomeType THEN t.amount ELSE -t.amount END
        ) FROM "Transactions" t WHERE t."accountId" = "Accounts".id
      ), 0),
      "refCurrentBalance" = "refInitialBalance" + COALESCE((
        SELECT SUM(
          CASE WHEN t."transactionType" = :incomeType THEN t."refAmount" ELSE -t."refAmount" END
        ) FROM "Transactions" t WHERE t."accountId" = "Accounts".id
      ), 0)
    WHERE "userId" = :userId
    `,
    {
      replacements: { userId, incomeType: TRANSACTION_TYPES.income },
      type: QueryTypes.UPDATE,
    },
  );
}

/**
 * Rebuild the Balances history table for a user's accounts.
 * Deletes initial balance records created by account creation hooks,
 * then rebuilds with running balances including first-of-month entries.
 */
async function rebuildBalancesHistory({ userId }: { userId: number }): Promise<void> {
  const sequelize = connection.sequelize;

  // Get account IDs for this user
  const accounts = await Accounts.findAll({
    where: { userId },
    attributes: ['id'],
    raw: true,
  });
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length === 0) return;

  // Delete initial balance records (will be replaced by full rebuild)
  await sequelize.query(`DELETE FROM "Balances" WHERE "accountId" IN (:accountIds)`, {
    replacements: { accountIds },
    type: QueryTypes.DELETE,
  });

  // Rebuild with running balances for accounts that have transactions
  await sequelize.query(
    `
    WITH tx_dates AS (
      SELECT "accountId", DATE("time") as "date"
      FROM "Transactions" WHERE "userId" = :userId
      GROUP BY "accountId", DATE("time")
      UNION
      SELECT "accountId", DATE_TRUNC('month', "time")::date as "date"
      FROM "Transactions" WHERE "userId" = :userId
      GROUP BY "accountId", DATE_TRUNC('month', "time")
    ),
    daily_deltas AS (
      SELECT
        d."accountId", d."date",
        COALESCE(SUM(
          CASE WHEN t."transactionType" = :incomeType THEN t."refAmount" ELSE -t."refAmount" END
        ), 0) as delta
      FROM tx_dates d
      LEFT JOIN "Transactions" t
        ON t."accountId" = d."accountId"
        AND DATE(t."time") = d."date"
        AND t."userId" = :userId
      GROUP BY d."accountId", d."date"
    ),
    running AS (
      SELECT
        dd."accountId", dd."date",
        a."refInitialBalance" + SUM(dd.delta) OVER (
          PARTITION BY dd."accountId" ORDER BY dd."date"
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as amount
      FROM daily_deltas dd
      JOIN "Accounts" a ON a.id = dd."accountId"
    )
    INSERT INTO "Balances" ("accountId", "date", "amount", "createdAt", "updatedAt")
    SELECT "accountId", "date", amount, NOW(), NOW() FROM running
    `,
    {
      replacements: { userId, incomeType: TRANSACTION_TYPES.income },
      type: QueryTypes.INSERT,
    },
  );

  // Re-insert balance records for accounts with no transactions (e.g. Savings).
  // The rebuild CTE only covers accounts that appear in the Transactions table.
  const accountsWithBalances: { accountId: number }[] = await sequelize.query(
    `SELECT DISTINCT "accountId" FROM "Balances" WHERE "accountId" IN (:accountIds)`,
    { replacements: { accountIds }, type: QueryTypes.SELECT },
  );

  const idsWithBalances = new Set(accountsWithBalances.map((r) => r.accountId));
  const accountsMissingBalances = accountIds.filter((id) => !idsWithBalances.has(id));

  if (accountsMissingBalances.length > 0) {
    await sequelize.query(
      `INSERT INTO "Balances" ("accountId", "date", "amount", "createdAt", "updatedAt")
       SELECT id, CURRENT_DATE, "refInitialBalance", NOW(), NOW()
       FROM "Accounts" WHERE id IN (:ids)`,
      { replacements: { ids: accountsMissingBalances }, type: QueryTypes.INSERT },
    );
  }
}
