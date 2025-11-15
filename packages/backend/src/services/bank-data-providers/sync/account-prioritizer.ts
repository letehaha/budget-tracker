import Transactions from '@models/Transactions.model';

import { setAccountPriority } from './sync-status-tracker';

interface AccountWithPriority {
  accountId: number;
  priority: number;
  transactionCount: number;
  frequencyScore: number;
}

/**
 * Calculate transaction frequency score for an account
 * Fetches last 20 transactions and analyzes how frequent they are
 * Returns a score between 0-100 (higher = more frequent activity)
 */
async function calculateFrequencyScore(accountId: number): Promise<{
  score: number;
  transactionCount: number;
}> {
  // Fetch last 20 transactions for this account
  const transactions = await Transactions.findAll({
    where: { accountId },
    order: [['time', 'DESC']],
    limit: 20,
    attributes: ['time'],
  });

  const transactionCount = transactions.length;

  if (transactionCount === 0) {
    return { score: 0, transactionCount: 0 };
  }

  if (transactionCount === 1) {
    return { score: 10, transactionCount: 1 };
  }

  // Extract unique dates
  const uniqueDates = new Set<string>();
  transactions.forEach((tx) => {
    const date = new Date(tx.time).toISOString().split('T')[0];
    uniqueDates.add(date!);
  });

  const uniqueDaysWithActivity = uniqueDates.size;

  // Calculate the time span
  const oldestTx = transactions[transactions.length - 1]!;
  const newestTx = transactions[0]!;
  const timeSpanMs = new Date(newestTx.time).getTime() - new Date(oldestTx.time).getTime();
  const timeSpanDays = Math.max(1, Math.ceil(timeSpanMs / (1000 * 60 * 60 * 24)));

  // Calculate frequency ratio (days with activity / total days span)
  const frequencyRatio = uniqueDaysWithActivity / timeSpanDays;

  // Calculate score:
  // - Base score from frequency ratio (0-70 points)
  // - Bonus for transaction count (0-30 points, capped at 20 transactions)
  const baseScore = Math.min(70, frequencyRatio * 100);
  const countBonus = Math.min(30, (transactionCount / 20) * 30);
  const score = baseScore + countBonus;

  return {
    score: Math.round(score),
    transactionCount,
  };
}

/**
 * Prioritize accounts based on transaction frequency
 * Returns accounts sorted by priority (highest first)
 */
export async function prioritizeAccounts(accountIds: number[]): Promise<AccountWithPriority[]> {
  const accountsWithPriority: AccountWithPriority[] = [];

  // Calculate priority for each account
  for (const accountId of accountIds) {
    const { score, transactionCount } = await calculateFrequencyScore(accountId);

    accountsWithPriority.push({
      accountId,
      priority: score,
      transactionCount,
      frequencyScore: score,
    });

    // Store in Redis for tracking
    await setAccountPriority(accountId, score);
  }

  // Sort by priority (highest first)
  return accountsWithPriority.sort((a, b) => b.priority - a.priority);
}
