import { SORT_DIRECTIONS, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import Transactions from '@models/transactions.model';
import { getDismissalsForUser } from '@models/transfer-suggestion-dismissals.model';
import { serializeTransaction, TransactionApiResponse } from '@root/serializers/transactions.serializer';
import * as transactionsService from '@services/transactions';
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns';
import { z } from 'zod';

import { MS_PER_DAY, RECOMMENDATION_DAYS_RANGE, RECOMMENDATION_PERCENT_RANGE } from './constants';

const MAX_MATCHES_PER_EXPENSE = 4;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CONFIDENCE_WEIGHT_AMOUNT = 50;
const CONFIDENCE_WEIGHT_DATE = 30;
const CONFIDENCE_WEIGHT_CURRENCY = 20;

interface BulkScanMatch {
  transaction: TransactionApiResponse;
  confidence: number;
}

interface BulkScanItem {
  expense: TransactionApiResponse;
  matches: BulkScanMatch[];
}

interface BulkScanResponse {
  total: number;
  items: BulkScanItem[];
}

const emptyResponse = (): BulkScanResponse => ({ total: 0, items: [] });

function isEligibleCandidate({
  tx,
  allowedTransferNatures,
}: {
  tx: Transactions;
  allowedTransferNatures: TRANSACTION_TRANSFER_NATURE[];
}): boolean {
  return (
    (!tx.splits || tx.splits.length === 0) &&
    allowedTransferNatures.includes(tx.transferNature as TRANSACTION_TRANSFER_NATURE)
  );
}

function calculateConfidence({
  expenseRefAmountCents,
  matchRefAmountCents,
  expenseTime,
  matchTime,
  expenseCurrency,
  matchCurrency,
}: {
  expenseRefAmountCents: number;
  matchRefAmountCents: number;
  expenseTime: Date;
  matchTime: Date;
  expenseCurrency: string;
  matchCurrency: string;
}): number {
  // Amount proximity: 50% weight
  const maxAmountDiff = expenseRefAmountCents * RECOMMENDATION_PERCENT_RANGE;
  const actualAmountDiff = Math.abs(matchRefAmountCents - expenseRefAmountCents);
  const amountScore =
    maxAmountDiff > 0 ? CONFIDENCE_WEIGHT_AMOUNT * (1 - actualAmountDiff / maxAmountDiff) : CONFIDENCE_WEIGHT_AMOUNT;

  // Date proximity: 30% weight
  const maxDaysDiff = RECOMMENDATION_DAYS_RANGE;
  const actualDaysDiff = Math.abs(expenseTime.getTime() - matchTime.getTime()) / MS_PER_DAY;
  const dateScore = CONFIDENCE_WEIGHT_DATE * (1 - Math.min(actualDaysDiff, maxDaysDiff) / maxDaysDiff);

  // Currency match: 20% weight
  const currencyScore = expenseCurrency === matchCurrency ? CONFIDENCE_WEIGHT_CURRENCY : 0;

  return Math.round(amountScore + dateScore + currencyScore);
}

const schema = z.object({
  body: z
    .object({
      dateFrom: z.string().datetime({ offset: true }),
      dateTo: z.string().datetime({ offset: true }),
      limit: z.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
      offset: z.number().int().min(0).optional().default(0),
      includeOutOfWallet: z.boolean().optional().default(false),
    })
    .refine((data) => new Date(data.dateFrom) <= new Date(data.dateTo), {
      message: 'dateFrom must be before or equal to dateTo',
    }),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { dateFrom, dateTo, limit, offset, includeOutOfWallet } = body;

  const dateFromParsed = startOfDay(new Date(dateFrom));
  const dateToParsed = endOfDay(new Date(dateTo));

  // Transfer natures to include in the scan
  const allowedTransferNatures = [TRANSACTION_TRANSFER_NATURE.not_transfer];
  if (includeOutOfWallet) {
    allowedTransferNatures.push(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
  }

  // 1. Fetch all expense transactions in the date range that are NOT linked transfers/refunds
  // When includeOutOfWallet, we can't use excludeTransfer (it excludes everything except not_transfer),
  // so we skip the filter and post-filter by allowed natures instead.
  const expenses = (await transactionsService.getTransactions({
    userId,
    from: 0,
    limit: Infinity, // fetch all in range — Infinity bypasses the default limit of 20
    transactionType: TRANSACTION_TYPES.expense,
    excludeTransfer: !includeOutOfWallet,
    excludeRefunds: true,
    includeSplits: true,
    startDate: dateFromParsed.toISOString(),
    endDate: dateToParsed.toISOString(),
    order: SORT_DIRECTIONS.desc,
  })) as Transactions[];

  if (expenses.length === 0) {
    return { data: emptyResponse() };
  }

  // Filter out parent transactions with splits and non-allowed transfer natures
  const eligibleExpenses = expenses.filter((tx) => isEligibleCandidate({ tx, allowedTransferNatures }));

  if (eligibleExpenses.length === 0) {
    return { data: emptyResponse() };
  }

  // 2. Fetch all income candidates in expanded date range
  // Expand by ±14 days to catch matches for expenses near the boundaries
  const incomeStartDate = subDays(dateFromParsed, RECOMMENDATION_DAYS_RANGE);
  const incomeEndDate = addDays(dateToParsed, RECOMMENDATION_DAYS_RANGE);

  const incomes = (await transactionsService.getTransactions({
    userId,
    from: 0,
    limit: Infinity,
    transactionType: TRANSACTION_TYPES.income,
    excludeTransfer: !includeOutOfWallet,
    excludeRefunds: true,
    includeSplits: true,
    startDate: incomeStartDate.toISOString(),
    endDate: incomeEndDate.toISOString(),
    order: SORT_DIRECTIONS.desc,
  })) as Transactions[];

  // Filter out parent transactions with splits and non-allowed transfer natures
  const eligibleIncomes = incomes.filter((tx) => isEligibleCandidate({ tx, allowedTransferNatures }));

  // 3. Load dismissed pairs to filter them out (scoped to relevant expenses)
  const eligibleExpenseIds = eligibleExpenses.map((e) => e.id);
  const dismissals = await getDismissalsForUser({ userId, expenseTransactionIds: eligibleExpenseIds });
  const dismissedPairsSet = new Set(dismissals.map((d) => `${d.expenseTransactionId}:${d.incomeTransactionId}`));

  // 4. Match expenses to incomes in-memory
  const results: Array<{
    expense: Transactions;
    matches: Array<{ transaction: Transactions; confidence: number }>;
  }> = [];

  for (const expense of eligibleExpenses) {
    const expenseRefCents = expense.refAmount.toCents();
    const lowerBound = Math.max(0, Math.floor(expenseRefCents * (1 - RECOMMENDATION_PERCENT_RANGE)));
    const upperBound = Math.ceil(expenseRefCents * (1 + RECOMMENDATION_PERCENT_RANGE));
    const expenseTime = new Date(expense.time);

    const matchCandidates: Array<{ transaction: Transactions; confidence: number }> = [];

    for (const income of eligibleIncomes) {
      // Skip dismissed pairs
      if (dismissedPairsSet.has(`${expense.id}:${income.id}`)) continue;

      // Different account
      if (income.accountId === expense.accountId) continue;

      // Amount within ±10%
      const incomeRefCents = income.refAmount.toCents();
      if (incomeRefCents < lowerBound || incomeRefCents > upperBound) continue;

      // Date within ±14 days
      const incomeTime = new Date(income.time);
      const daysDiff = Math.abs(expenseTime.getTime() - incomeTime.getTime()) / MS_PER_DAY;
      if (daysDiff > RECOMMENDATION_DAYS_RANGE) continue;

      const confidence = calculateConfidence({
        expenseRefAmountCents: expenseRefCents,
        matchRefAmountCents: incomeRefCents,
        expenseTime,
        matchTime: incomeTime,
        expenseCurrency: expense.currencyCode ?? '',
        matchCurrency: income.currencyCode ?? '',
      });

      matchCandidates.push({ transaction: income, confidence });
    }

    if (matchCandidates.length > 0) {
      // Sort by confidence descending
      matchCandidates.sort((a, b) => b.confidence - a.confidence);
      results.push({
        expense,
        matches: matchCandidates.slice(0, MAX_MATCHES_PER_EXPENSE),
      });
    }
  }

  // 5. Sort results by expense date descending (newest first)
  results.sort((a, b) => new Date(b.expense.time).getTime() - new Date(a.expense.time).getTime());

  const total = results.length;

  // 6. Apply pagination
  const paginatedResults = results.slice(offset, offset + limit);

  // 7. Serialize
  const items: BulkScanItem[] = paginatedResults.map((result) => ({
    expense: serializeTransaction(result.expense),
    matches: result.matches.map((match) => ({
      transaction: serializeTransaction(match.transaction),
      confidence: match.confidence,
    })),
  }));

  return { data: { total, items } satisfies BulkScanResponse };
});
