import { ACCOUNT_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import Transactions from '@models/Transactions.model';
import { getBaseCurrency, updateCurrencies } from '@models/UsersCurrencies.model';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmountFromParams } from '@services/calculate-ref-amount.service';
import { withLock } from '@services/common/lock';
import * as userExchangeRateService from '@services/user-exchange-rate';
import { Transaction as SequelizeTransaction } from 'sequelize';

/**
 * What is covered:
 * 1. Accounts
 * Accounts.refIniaitlBalance
 * Accounts.refCurrentBalance
 * Accounts.refCreditLimit
 * 2. Transactions
 * Transactions.refAmount
 * Transactions.refCurrencyCode
 * Transactions.refCommissionRate
 * 3. Holdings
 * Holdings.refCostBasis
 * 4. InvestmentTransaction
 * InvestmentTransaction.refAmount
 * InvestmentTransaction.refFees
 * InvestmentTransaction.refPrice
 * 5. PortfolioBalances
 * PortfolioBalances.refAvailableCash
 * PortfolioBalances.refTotalCash
 * 6. PortfolioTransfers
 * PortfolioTransfers.refAmount
 *
 * TODO: There's a big room for performance optimizations:
 * 1. N+1 Query Problem - Exchange Rate Fetching.
 *    Current problem:
 *    - Individual DB queries for each exchange rate lookup
 *    - Potential external API calls if rates are missing
 *    - Redis cache lookups per transaction
 *    Possible fix:
 *    - Pre-fetch all unique currency pairs and dates before processing
 *    - Build an in-memory cache of exchange rates for the operation
 *    - Batch process records using the pre-loaded rates
 *
 * 2. Sequential Processing Instead of Batching.
 *    Current problem:
 *    - Each record is updated individually in a loop with await
 *    - Results in N separate DB update queries
 *    Possible fix:
 *    - Pre-calculate all values first
 *    - Use bulkUpdate with batching (e.g., 500 records at a time)
 *    - Parallelize independent calculations
 *
 * 3. Redundant Portfolio Queries.
 *    Current problem:
 *    - Fetching portfolios 3 separate times for the same user
 *    - In recalculateInvestmentTransactions, recalculateHoldings, and recalculatePortfolioBalances
 *    Possible fix:
 *    - Fetch portfolios once at the beginning
 *    - Pass portfolio data to all functions that need it
 *
 * 4. Inefficient Account Balance Calculation.
 *    Current problem:
 *    - For system accounts, loading ALL transactions with account
 *    - Then iterating through them in memory to calculate balance
 *    Possible fix:
 *    - Use database aggregation with SUM and CASE
 *    - Eliminate in-memory transaction iteration
 *    - Don't load transaction data unnecessarily
 *
 * 5. Missing Batch Size Limits.
 *    Current problem:
 *    - Loading ALL records at once with findAll (no limit)
 *    - For users with 100k+ transactions, this could cause memory issues
 *    Possible fix:
 *    - Implement cursor-based pagination or batch processing
 *    - Process records in chunks (e.g., 1000 at a time)
 */

interface ChangeBaseCurrencyParams {
  userId: number;
  newCurrencyCode: string;
}

interface RecalculateResult {
  transactionsUpdated: number;
  accountsUpdated: number;
  balancesRebuilt: number;
  investmentTransactionsUpdated: number;
  portfolioTransfersUpdated: number;
  holdingsUpdated: number;
  portfolioBalancesUpdated: number;
}

/**
 * Internal implementation of changeBaseCurrency.
 * This is wrapped by the exported function with a distributed lock.
 */
async function changeBaseCurrencyImpl(params: ChangeBaseCurrencyParams): Promise<RecalculateResult> {
  const { userId, newCurrencyCode } = params;

  // Get current base currency
  const oldBaseCurrency = await getBaseCurrency({ userId });

  if (!oldBaseCurrency) {
    throw new ValidationError({
      message: t({ key: 'currencies.noBaseCurrency' }),
    });
  }

  if (oldBaseCurrency.currencyCode === newCurrencyCode) {
    throw new ValidationError({
      message: t({ key: 'currencies.alreadyBaseCurrency' }),
    });
  }

  // Start database transaction for atomicity
  const result = await Transactions.sequelize!.transaction(async (t: SequelizeTransaction) => {
    logger.info(
      `Starting base currency change for user ${userId} from ${oldBaseCurrency.currencyCode} to ${newCurrencyCode}`,
    );

    // Step 1: Recalculate all transactions
    const transactionsUpdated = await rebuildTransactions({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 2: Recalculate all accounts
    const accountsUpdated = await recalculateAccounts({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 3: Rebuild balance history
    const balancesRebuilt = await rebuildBalances({
      userId,
      oldCurrencyCode: oldBaseCurrency.currencyCode,
      newCurrencyCode,
      transaction: t,
    });

    // Step 4: Recalculate investment transactions
    const investmentTransactionsUpdated = await recalculateInvestmentTransactions({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 5: Recalculate portfolio transfers
    const portfolioTransfersUpdated = await recalculatePortfolioTransfers({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 6: Recalculate holdings
    const holdingsUpdated = await recalculateHoldings({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 7: Recalculate portfolio balances
    const portfolioBalancesUpdated = await recalculatePortfolioBalances({
      userId,
      newCurrencyCode,
      transaction: t,
    });

    // Step 8: Update the base currency flag
    await updateCurrencies({
      userId,
      isDefaultCurrency: false,
    });

    await updateCurrencies({
      userId,
      currencyCodes: [newCurrencyCode],
      isDefaultCurrency: true,
    });

    // Step 9: Clear Redis cache for this user
    await clearUserCache(userId);

    logger.info(`Base currency change completed for user ${userId}`);

    return {
      transactionsUpdated,
      accountsUpdated,
      balancesRebuilt,
      investmentTransactionsUpdated,
      portfolioTransfersUpdated,
      holdingsUpdated,
      portfolioBalancesUpdated,
    };
  });

  return result;
}

export const buildLockKey = (userId: number) => `change-base-currency:user:${userId}`;

/**
 * Changes the user's base currency and recalculates all ref- amounts using historical exchange rates.
 * This operation is atomic - either all changes succeed or all are rolled back.
 *
 * Protected by a distributed Redis lock to prevent concurrent executions for the same user.
 * The lock has a TTL of 4 hour to handle long-running operations.
 *
 * @param params - Object containing userId and newCurrencyCode
 * @returns Promise<RecalculateResult> - Statistics about the recalculation
 * @throws ValidationError if the currency is already the base currency
 * @throws LockedError if another base currency change operation is already in progress for this user
 */
export const changeBaseCurrency = (params: ChangeBaseCurrencyParams): Promise<RecalculateResult> => {
  const lockedFn = withLock(buildLockKey(params.userId), changeBaseCurrencyImpl, { ttl: 60 * 60 * 4 }); // 4 hour TTL
  return lockedFn(params);
};

const localCalculateRefAmount = async ({
  amount,
  useFloorAbs,
  ...exchangeRateParams
}: {
  userId: number;
  date: string | Date;
  baseCode: string;
  quoteCode: string;
  amount: Money;
  useFloorAbs?: boolean;
}) => {
  const { rate } = await userExchangeRateService.getExchangeRate({
    ...exchangeRateParams,
    date: new Date(exchangeRateParams.date),
  });

  return calculateRefAmountFromParams({ amount, rate, useFloorAbs });
};

/**
 * Recalculates all ref-amounts using historical exchange rates based on transaction dates.
 * Updates all ref-related information as well, such as refCurrencyCode
 */
async function rebuildTransactions(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  const transactions = await Transactions.findAll({
    where: { userId },
    transaction,
  });

  logger.info(`Recalculating ${transactions.length} transactions for user ${userId}`);

  for (const tx of transactions) {
    // Calculate new refAmount using the transaction's original date
    const newRefAmount = await localCalculateRefAmount({
      amount: tx.amount,
      userId,
      baseCode: tx.currencyCode,
      quoteCode: newCurrencyCode,
      date: tx.time,
    });

    // Calculate new refCommissionRate if commission exists
    let newRefCommissionRate: Money = Money.zero();
    if (!tx.commissionRate.isZero()) {
      newRefCommissionRate = await localCalculateRefAmount({
        amount: tx.commissionRate,
        userId,
        baseCode: tx.currencyCode,
        quoteCode: newCurrencyCode,
        date: tx.time,
      });
    }

    // Use instance.save() instead of Model.update() because static update()
    // triggers the getter (which returns Money) during SQL generation, and
    // Sequelize can't serialize Money to an integer for the DB column.
    tx.refAmount = newRefAmount;
    tx.refCommissionRate = newRefCommissionRate;
    tx.refCurrencyCode = newCurrencyCode;
    await tx.save({ transaction, hooks: false });
  }

  return transactions.length;
}

/**
 * Recalculates refInitialBalance, refCurrentBalance, and refCreditLimit for all user accounts.
 * System accounts have their currentBalance recalculated from transactions.
 * Bank accounts use today's exchange rate for currentBalance.
 */
async function recalculateAccounts(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  const accounts = await Accounts.findAll({
    where: { userId },
    include: [
      {
        model: Transactions,
        required: false,
      },
    ],
    transaction,
  });

  logger.info(`Recalculating ${accounts.length} accounts for user ${userId}`);

  const today = new Date();

  for (const account of accounts) {
    // Recalculate initial balance (use today's rate - creation date unknown)
    const newRefInitialBalance = await localCalculateRefAmount({
      amount: account.initialBalance,
      userId,
      baseCode: account.currencyCode,
      quoteCode: newCurrencyCode,
      date: today,
    });

    // Recalculate credit limit (use today's rate)
    const newRefCreditLimit = await localCalculateRefAmount({
      amount: account.creditLimit,
      userId,
      baseCode: account.currencyCode,
      quoteCode: newCurrencyCode,
      date: today,
    });

    let newRefCurrentBalance: Money;

    if (account.type === ACCOUNT_TYPES.system) {
      // For system accounts: calculate from transactions (most accurate)
      newRefCurrentBalance = newRefInitialBalance;

      if (account.transactions && account.transactions.length > 0) {
        // Sum all transaction refAmounts (already recalculated in previous step)
        for (const tx of account.transactions) {
          if (tx.transactionType === TRANSACTION_TYPES.income) {
            newRefCurrentBalance = newRefCurrentBalance.add(tx.refAmount);
          } else {
            newRefCurrentBalance = newRefCurrentBalance.subtract(tx.refAmount);
          }
        }
      }
    } else {
      // For bank accounts: convert using today's rate
      newRefCurrentBalance = await localCalculateRefAmount({
        amount: account.currentBalance,
        userId,
        baseCode: account.currencyCode,
        quoteCode: newCurrencyCode,
        date: today,
      });
    }

    account.refInitialBalance = newRefInitialBalance;
    account.refCurrentBalance = newRefCurrentBalance;
    account.refCreditLimit = newRefCreditLimit;
    await account.save({ transaction, hooks: false });
  }

  return accounts.length;
}

/**
 * Recalculates all balance amounts by converting from old base currency to new base currency.
 * Much simpler than rebuilding from scratch - just recalculates the amounts using exchange rates.
 *
 * Key insight: Balances.amount is ALWAYS stored in the base currency.
 * So we convert from OLD base → NEW base for each balance record.
 */
async function rebuildBalances(params: {
  userId: number;
  oldCurrencyCode: string;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, oldCurrencyCode, newCurrencyCode, transaction } = params;

  // Get all user accounts with their balances
  const accounts = await Accounts.findAll({
    where: { userId },
    transaction,
  });

  logger.info(`Recalculating balances for ${accounts.length} accounts for user ${userId}`);

  let totalBalancesRecalculated = 0;

  for (const account of accounts) {
    const balances = await Balances.findAll({
      where: { accountId: account.id },
      transaction,
    });

    // For each existing balance record, recalculate the amount
    // Balance amounts are in OLD base currency, convert to NEW base currency
    for (const balance of balances) {
      // Convert: OLD base currency → NEW base currency
      const newAmount = await localCalculateRefAmount({
        amount: balance.amount, // This is in OLD base currency
        userId,
        baseCode: oldCurrencyCode,
        quoteCode: newCurrencyCode,
        date: balance.date,
      });

      balance.amount = newAmount;
      await balance.save({ transaction, hooks: false });

      totalBalancesRecalculated++;
    }
  }

  return totalBalancesRecalculated;
}

/**
 * Recalculates refAmount, refFees, refPrice for all investment transactions.
 * Investment transactions are accessed through portfolios owned by the user.
 */
async function recalculateInvestmentTransactions(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  // Get all portfolios for this user
  const portfolios = await Portfolios.findAll({
    where: { userId },
    transaction,
  });

  const portfolioIds = portfolios.map((p) => p.id);

  if (portfolioIds.length === 0) {
    return 0;
  }

  // Get all investment transactions for user's portfolios
  const investmentTxs = await InvestmentTransaction.findAll({
    where: { portfolioId: portfolioIds },
    transaction,
  });

  logger.info(`Recalculating ${investmentTxs.length} investment transactions for user ${userId}`);

  for (const tx of investmentTxs) {
    // Calculate new refAmount
    const newRefAmount = await localCalculateRefAmount({
      amount: tx.amount,
      userId,
      baseCode: tx.currencyCode,
      quoteCode: newCurrencyCode,
      date: tx.date,
      useFloorAbs: false,
    });

    // Calculate new refFees
    const newRefFees = await localCalculateRefAmount({
      amount: tx.fees,
      userId,
      baseCode: tx.currencyCode,
      quoteCode: newCurrencyCode,
      date: tx.date,
      useFloorAbs: false,
    });

    // Calculate new refPrice
    const newRefPrice = await localCalculateRefAmount({
      amount: tx.price,
      userId,
      baseCode: tx.currencyCode,
      quoteCode: newCurrencyCode,
      date: tx.date,
      useFloorAbs: false,
    });

    tx.refAmount = newRefAmount;
    tx.refFees = newRefFees;
    tx.refPrice = newRefPrice;
    await tx.save({ transaction, hooks: false });
  }

  return investmentTxs.length;
}

/**
 * Recalculates refAmount for all portfolio transfers.
 */
async function recalculatePortfolioTransfers(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  const transfers = await PortfolioTransfers.findAll({
    where: { userId },
    transaction,
  });

  logger.info(`Recalculating ${transfers.length} portfolio transfers for user ${userId}`);

  for (const transfer of transfers) {
    const newRefAmount = await localCalculateRefAmount({
      amount: Money.fromDecimal(transfer.amount),
      userId,
      baseCode: transfer.currencyCode,
      quoteCode: newCurrencyCode,
      date: transfer.date,
    });

    transfer.refAmount = newRefAmount;
    await transfer.save({ transaction, hooks: false });
  }

  return transfers.length;
}

/**
 * Recalculates refCostBasis for all holdings.
 * Holdings are accessed through portfolios owned by the user.
 */
async function recalculateHoldings(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  // Get all portfolios for this user
  const portfolios = await Portfolios.findAll({
    where: { userId },
    transaction,
  });

  const portfolioIds = portfolios.map((p) => p.id);

  if (portfolioIds.length === 0) {
    return 0;
  }

  const holdings = await Holdings.findAll({
    where: { portfolioId: portfolioIds },
    transaction,
  });

  logger.info(`Recalculating ${holdings.length} holdings for user ${userId}`);

  const today = new Date();

  for (const holding of holdings) {
    // Calculate new refCostBasis (use today's rate - historical cost basis date unknown)
    const newRefCostBasis = await localCalculateRefAmount({
      amount: holding.costBasis,
      userId,
      baseCode: holding.currencyCode,
      quoteCode: newCurrencyCode,
      date: today,
    });

    holding.refCostBasis = newRefCostBasis;
    await holding.save({ transaction, hooks: false });
  }

  return holdings.length;
}

/**
 * Recalculates refAvailableCash and refTotalCash for all portfolio balances.
 * Portfolio balances are accessed through portfolios owned by the user.
 */
async function recalculatePortfolioBalances(params: {
  userId: number;
  newCurrencyCode: string;
  transaction: SequelizeTransaction;
}): Promise<number> {
  const { userId, newCurrencyCode, transaction } = params;

  // Get all portfolios for this user
  const portfolios = await Portfolios.findAll({
    where: { userId },
    transaction,
  });

  const portfolioIds = portfolios.map((p) => p.id);

  if (portfolioIds.length === 0) {
    return 0;
  }

  const portfolioBalances = await PortfolioBalances.findAll({
    where: { portfolioId: portfolioIds },
    transaction,
  });

  logger.info(`Recalculating ${portfolioBalances.length} portfolio balances for user ${userId}`);

  const today = new Date();

  for (const balance of portfolioBalances) {
    // Calculate new refAvailableCash
    const newRefAvailableCash = await localCalculateRefAmount({
      amount: balance.availableCash,
      userId,
      baseCode: balance.currencyCode,
      quoteCode: newCurrencyCode,
      date: today,
    });

    // Calculate new refTotalCash
    const newRefTotalCash = await localCalculateRefAmount({
      amount: balance.totalCash,
      userId,
      baseCode: balance.currencyCode,
      quoteCode: newCurrencyCode,
      date: today,
    });

    balance.refAvailableCash = newRefAvailableCash;
    balance.refTotalCash = newRefTotalCash;
    await balance.save({ transaction, hooks: false });
  }

  return portfolioBalances.length;
}

/**
 * Clears Redis cache entries for ref_amount calculations.
 * After changing base currency, all cached ref_amount values are invalid
 * because they were calculated with the OLD base currency.
 *
 * Uses Redis SCAN to safely iterate and delete all ref_amount keys for this user.
 */
async function clearUserCache(userId: number): Promise<void> {
  logger.info(`Clearing ref_amount cache for user ${userId}`);

  try {
    const cache = new CacheClient({ logPrefix: 'clearUserCache' });

    // Delete all ref_amount cache keys for this user using pattern matching
    // Pattern: ref_amount:${userId}:*
    const pattern = `ref_amount:${userId}:*`;
    await cache.delete(pattern, true); // isPattern=true triggers SCAN-based deletion

    logger.info(`Successfully cleared ref_amount cache for user ${userId}`);
  } catch (error) {
    logger.error({ message: `Error clearing cache for user ${userId}`, error: error as Error });
    // Don't throw - cache clearing failure shouldn't break the main operation
  }
}
