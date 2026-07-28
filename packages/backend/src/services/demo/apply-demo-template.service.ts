import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import { connection } from '@models/index';
import Transactions from '@models/transactions.model';
import { addMinutes, startOfDay, subDays } from 'date-fns';
import { QueryTypes } from 'sequelize';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';

import { DEMO_CONFIG } from './demo-config';
import { getDemoTemplate } from './demo-template-cache.service';
import { setupAccountGroups } from './seed-account-groups.service';
import {
  createAccounts,
  createBudgets,
  createCategories,
  createTags,
  setupCurrencies,
  setupDashboardSettings,
  setupLoans,
  setupVehicles,
  setupVentures,
} from './seed-demo-data.service';
import { setupInvestments } from './seed-investments.service';
import { seedPayees } from './seed-payees.service';
import { setupSubscriptions } from './seed-subscriptions.service';
import { seedTransactionExtras } from './seed-transaction-extras.service';
import { toBaseCurrencyCents } from './template/fx';
import type { DemoTemplateTransaction } from './template/types';

const ACCOUNT_NAME_TO_KEY: Record<string, string> = {
  'Main Checking': 'main_checking',
  Savings: 'savings',
  'Travel Card': 'travel_card',
  Cash: 'cash',
};

/** How far back the demo's budgets look. Always fully populated, unlike a part-elapsed calendar month. */
const BUDGET_WINDOW_DAYS = 30;

interface TransferReconcilableRow {
  transferId: string | null;
  currencyCode: string;
  amount: number;
  refAmount: number;
}

/**
 * Fast application of the pre-generated demo template to a user.
 *
 * Everything goes in with hooks disabled and balances are recomputed afterwards
 * in raw SQL, because this runs while a visitor waits on the landing page. That
 * choice has one consequence worth remembering: no hook fills anything in, so
 * every id, every `refAmount` and every `transferId` is resolved here by hand.
 */
export async function applyDemoTemplate({ userId }: { userId: number }): Promise<void> {
  const startTime = Date.now();
  logger.info(`Applying demo template for user ${userId}...`);

  const template = getDemoTemplate();

  await setupCurrencies({ userId });
  const categoryMap = await createCategories({ userId });
  const tagMap = await createTags({ userId });
  const accounts = await createAccounts({ userId });
  const payeeMap = await seedPayees({ userId, categoryMap });

  const accountKeyToId: Record<string, string> = {};
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

  const fallbackCategoryId = categoryMap.get('other') || undefined;

  // Rows that take part in a refund pair carry the flag at insert time, which
  // saves a second UPDATE pass over the whole table.
  const refundLinkedRefs = new Set(template.refunds.flatMap((pair) => [pair.originalRef, pair.refundRef]));

  const idByRef = new Map<string, string>();
  const transferIdByKey = new Map<string, string>();

  const resolveTime = (tx: DemoTemplateTransaction): Date => {
    const time = addMinutes(startOfDay(subDays(template.generatedAt, tx.dayOffset)), tx.minuteOfDay);
    // A time-of-day on today's row can otherwise land after the moment the
    // template was generated, dating a demo transaction in the future.
    return time > template.generatedAt ? template.generatedAt : time;
  };

  const rows = template.transactions.map((tx) => {
    const id = uuidv7();
    if (tx.ref) idByRef.set(tx.ref, id);

    let transferId: string | null = null;
    if (tx.transferKey) {
      transferId = transferIdByKey.get(tx.transferKey) ?? uuidv4();
      transferIdByKey.set(tx.transferKey, transferId);
    }

    const currencyCode = accountKeyToCurrency[tx.accountKey] || DEMO_CONFIG.baseCurrency;

    return {
      id,
      userId,
      amount: tx.amount,
      refAmount: toBaseCurrencyCents({
        amount: tx.amount,
        currencyCode,
        dayOffset: tx.dayOffset,
        spotRate: DEMO_CONFIG.exchangeRates[currencyCode],
      }),
      transactionType: tx.transactionType,
      categoryId: categoryMap.get(tx.categoryKey) || fallbackCategoryId,
      accountId: accountKeyToId[tx.accountKey],
      payeeId: tx.merchantName ? (payeeMap.get(tx.merchantName) ?? null) : null,
      currencyCode,
      refCurrencyCode: DEMO_CONFIG.baseCurrency,
      accountType: accountKeyToAccountType[tx.accountKey] || ACCOUNT_TYPES.system,
      transferNature: tx.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer,
      transferId,
      paymentType: tx.paymentType,
      note: tx.note,
      time: resolveTime(tx),
      commissionRate: 0,
      refCommissionRate: 0,
      cashbackAmount: 0,
      refundLinked: tx.ref ? refundLinkedRefs.has(tx.ref) : false,
    };
  });

  reconcileTransferRefAmounts({ rows });

  logger.info(`Bulk inserting ${rows.length} demo transactions...`);
  await Transactions.bulkCreate(rows, { hooks: false, validate: false });

  const refAmountById = new Map(rows.map((row) => [row.id, row.refAmount]));
  const amountById = new Map(rows.map((row) => [row.id, row.amount]));

  await seedTransactionExtras({
    userId,
    splits: template.splits.flatMap((split) => {
      const transactionId = idByRef.get(split.transactionRef);
      const categoryId = categoryMap.get(split.categoryKey);
      if (!transactionId || !categoryId) return [];

      // Splits are stored in both the account currency and the base currency.
      // Scaling the parent's own converted total keeps the two consistent with
      // whatever rate that day used.
      const parentAmount = amountById.get(transactionId) ?? split.amount;
      const parentRefAmount = refAmountById.get(transactionId) ?? split.amount;

      return [
        {
          transactionId,
          categoryId,
          amount: split.amount,
          refAmount: Math.round((split.amount / parentAmount) * parentRefAmount),
          note: split.note,
        },
      ];
    }),
    refunds: template.refunds.flatMap((pair) => {
      const originalTxId = idByRef.get(pair.originalRef);
      const refundTxId = idByRef.get(pair.refundRef);
      return originalTxId && refundTxId ? [{ originalTxId, refundTxId }] : [];
    }),
    // Most tagged rows never need a `ref`, so these resolve by position:
    // `rows` is built one-for-one from `template.transactions`.
    tagLinks: template.transactions.flatMap((tx, index) => {
      const transactionId = rows[index]?.id;
      if (!transactionId || !tx.tagKeys?.length) return [];

      return tx.tagKeys.flatMap((tagKey) => {
        const tagId = tagMap.get(tagKey);
        return tagId ? [{ tagId, transactionId }] : [];
      });
    }),
    groups: template.groups.flatMap((group) => {
      const transactionIds = group.transactionRefs
        .map((ref) => idByRef.get(ref))
        .filter((id): id is string => id !== undefined);

      return transactionIds.length >= 2 ? [{ name: group.name, note: group.note, transactionIds }] : [];
    }),
  });

  // Runs before the balance recompute below, because it puts its own
  // portfolio-funding transactions on the savings account.
  const savingsAccountId = accountKeyToId['savings'];
  if (savingsAccountId) {
    await setupInvestments({ userId, referenceDate: template.generatedAt, savingsAccountId });
  }

  await updateAccountBalances({ userId });
  await rebuildBalancesHistory({ userId });

  const windowEnd = template.generatedAt;
  const windowStart = subDays(windowEnd, BUDGET_WINDOW_DAYS);
  await createBudgets({
    userId,
    categoryMap,
    spendByCategoryKey: sumSpendByCategoryKey({
      template,
      windowStart,
      currencyByAccountKey: accountKeyToCurrency,
    }),
    windowStart,
    windowEnd,
  });

  const mainCheckingAccountId = accountKeyToId['main_checking'];
  if (mainCheckingAccountId) {
    await setupSubscriptions({
      userId,
      accountId: mainCheckingAccountId,
      categoryMap,
      referenceDate: template.generatedAt,
      payments: template.subscriptionPayments.flatMap((payment) => {
        const transactionId = idByRef.get(payment.transactionRef);
        if (!transactionId) return [];

        return [
          {
            subscriptionName: payment.subscriptionName,
            transactionId,
            dueDate: subDays(template.generatedAt, payment.dueDayOffset),
          },
        ];
      }),
    });
  }

  await setupDashboardSettings({ userId, categoryMap });
  await setupVehicles({ userId, referenceDate: template.generatedAt });
  await setupLoans({ userId, referenceDate: template.generatedAt });
  await setupVentures({ userId, referenceDate: template.generatedAt });
  await setupAccountGroups({ userId });

  const duration = Date.now() - startTime;
  logger.info(`Demo template applied for user ${userId} in ${duration}ms (${rows.length} transactions)`);
}

/**
 * Forces both legs of a transfer to report the same base-currency value.
 *
 * Each leg is converted independently at the day's rate, so a cross-currency
 * pair would otherwise arrive worth slightly more or less than it left and
 * invent net worth out of rounding. Mirrors what the real transfer service does:
 * when one leg is already in the base currency, that leg's own amount is the
 * transfer's value.
 */
function reconcileTransferRefAmounts({ rows }: { rows: TransferReconcilableRow[] }): void {
  const legsByTransferId = new Map<string, TransferReconcilableRow[]>();

  for (const row of rows) {
    if (!row.transferId) continue;
    const legs = legsByTransferId.get(row.transferId) ?? [];
    legs.push(row);
    legsByTransferId.set(row.transferId, legs);
  }

  for (const legs of legsByTransferId.values()) {
    const baseLeg = legs.find((leg) => leg.currencyCode === DEMO_CONFIG.baseCurrency);
    if (!baseLeg) continue;

    for (const leg of legs) {
      leg.refAmount = baseLeg.amount;
    }
  }
}

/**
 * Base-currency spend per category key over the budget window.
 *
 * Mirrors how category-budget stats read the same rows: a transaction that has
 * splits is skipped and its split rows counted instead, so a limit derived here
 * matches the number the budget card will show.
 */
function sumSpendByCategoryKey({
  template,
  windowStart,
  currencyByAccountKey,
}: {
  template: ReturnType<typeof getDemoTemplate>;
  windowStart: Date;
  currencyByAccountKey: Record<string, string>;
}): Map<string, number> {
  const windowOffset = Math.floor((template.generatedAt.getTime() - windowStart.getTime()) / 86400000);
  const splitRefs = new Set(template.splits.map((split) => split.transactionRef));
  const spend = new Map<string, number>();

  // Budget stats compare `refAmount`, so euro and zloty spending has to be
  // converted here too. Summing raw amounts would count a zloty as a dollar and
  // inflate every limit drawn from a category those accounts touch.
  const toBase = ({ tx, amount }: { tx: DemoTemplateTransaction; amount: number }) => {
    const currencyCode = currencyByAccountKey[tx.accountKey] ?? DEMO_CONFIG.baseCurrency;
    return toBaseCurrencyCents({
      amount,
      currencyCode,
      dayOffset: tx.dayOffset,
      spotRate: DEMO_CONFIG.exchangeRates[currencyCode],
    });
  };

  const add = ({ categoryKey, amount }: { categoryKey: string; amount: number }) => {
    spend.set(categoryKey, (spend.get(categoryKey) ?? 0) + amount);
  };

  const inWindowByRef = new Map<string, DemoTemplateTransaction>();

  for (const tx of template.transactions) {
    if (tx.dayOffset > windowOffset) continue;
    if (tx.transactionType !== TRANSACTION_TYPES.expense) continue;
    if ((tx.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer) !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
      continue;
    }

    if (tx.ref) inWindowByRef.set(tx.ref, tx);
    if (tx.ref && splitRefs.has(tx.ref)) continue;

    add({ categoryKey: tx.categoryKey, amount: toBase({ tx, amount: tx.amount }) });
  }

  for (const split of template.splits) {
    const parent = inWindowByRef.get(split.transactionRef);
    if (!parent) continue;
    add({ categoryKey: split.categoryKey, amount: toBase({ tx: parent, amount: split.amount }) });
  }

  return spend;
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
  const accountsWithBalances: { accountId: string }[] = await sequelize.query(
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
