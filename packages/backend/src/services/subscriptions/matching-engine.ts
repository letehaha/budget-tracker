import {
  CATEGORIZATION_SOURCE,
  CentsAmount,
  SUBSCRIPTION_MATCH_SOURCE,
  SubscriptionMatchingRule,
  asCents,
} from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import Subscriptions from '@models/Subscriptions.model';
import * as Transactions from '@models/Transactions.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';

interface MatchTransactionParams {
  transaction: Transactions.default;
  userId: number;
}

interface EvaluateRuleParams {
  rule: SubscriptionMatchingRule;
  transaction: Transactions.default;
  userId: number;
}

/**
 * Evaluates a single transaction against all active subscriptions for a user.
 * Collects all matching subscriptions, scores them by amount closeness, and
 * links the best match. Returns the matched subscription or null.
 */
export const matchTransactionToSubscriptions = withTransaction(
  async ({ transaction, userId }: MatchTransactionParams): Promise<Subscriptions | null> => {
    // Check if already linked (active) or previously unlinked (don't re-match)
    const existingLink = await SubscriptionTransactions.findOne({
      where: { transactionId: transaction.id },
    });
    if (existingLink) return null;

    const subscriptions = await Subscriptions.findAll({
      where: { userId, isActive: true },
    });

    // Collect all matching subscriptions with their scores
    const candidates: { subscription: Subscriptions; score: number }[] = [];

    for (const subscription of subscriptions) {
      // If subscription is scoped to an account, skip if transaction is from a different account
      if (subscription.accountId && subscription.accountId !== transaction.accountId) {
        continue;
      }

      const rules = subscription.matchingRules?.rules;
      if (!rules || rules.length === 0) continue;

      // Short-circuit: stop evaluating rules as soon as one fails (avoids unnecessary async work)
      // NOTE: These rule evaluations correspond to the Sequelize WHERE clauses in
      // suggest-historical-matches.ts `buildWhereFromRules`. Keep in sync.
      let allMatch = true;
      for (const rule of rules) {
        if (!(await evaluateRule({ rule, transaction, userId }))) {
          allMatch = false;
          break;
        }
      }

      if (!allMatch) continue;

      // Calculate score based on amount closeness to expectedAmount
      const score = await calculateMatchScore({ subscription, transaction, userId });
      candidates.push({ subscription, score });
    }

    if (candidates.length === 0) return null;

    // Sort by score descending — best match first
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;

    // Link the best match
    await SubscriptionTransactions.create({
      subscriptionId: best.subscription.id,
      transactionId: transaction.id,
      matchSource: SUBSCRIPTION_MATCH_SOURCE.rule,
    });

    // Apply category if subscription has one
    if (best.subscription.categoryId) {
      await Transactions.updateTransactionById({
        id: transaction.id,
        userId,
        categoryId: best.subscription.categoryId,
        categorizationMeta: {
          source: CATEGORIZATION_SOURCE.subscriptionRule,
          subscriptionId: best.subscription.id,
          categorizedAt: new Date().toISOString(),
        },
      });
    }

    logger.info(
      `Subscription "${best.subscription.name}" matched transaction ${transaction.id} (score: ${best.score.toFixed(3)}, candidates: ${candidates.length})`,
    );
    return best.subscription;
  },
);

/**
 * Calculates a match score for a subscription-transaction pair.
 * Higher score = better match.
 *
 * - If subscription has expectedAmount + expectedCurrencyCode:
 *   score = 1 - abs(convertedTxAmount - expectedAmount) / expectedAmount
 * - Otherwise: score = 0 (lowest priority)
 */
async function calculateMatchScore({
  subscription,
  transaction,
  userId,
}: {
  subscription: Subscriptions;
  transaction: Transactions.default;
  userId: number;
}): Promise<number> {
  if (!subscription.expectedAmount || !subscription.expectedCurrencyCode) {
    return 0;
  }

  let txAmountInSubCurrency: number;

  if (transaction.currencyCode === subscription.expectedCurrencyCode) {
    txAmountInSubCurrency = Math.abs(transaction.amount);
  } else {
    try {
      const converted = await calculateRefAmount({
        amount: asCents(Math.abs(transaction.amount)),
        userId,
        date: transaction.time,
        baseCode: transaction.currencyCode,
        quoteCode: subscription.expectedCurrencyCode,
      });
      txAmountInSubCurrency = converted;
    } catch {
      // If conversion fails, give a neutral score
      return 0;
    }
  }

  const expected = subscription.expectedAmount;
  const deviation = Math.abs(txAmountInSubCurrency - expected) / expected;

  // score = 1 - deviation, clamped to [0, 1]
  return Math.max(0, 1 - deviation);
}

async function evaluateRule({ rule, transaction, userId }: EvaluateRuleParams): Promise<boolean> {
  switch (rule.field) {
    case 'note': {
      if (rule.operator !== 'contains_any' || !Array.isArray(rule.value)) return false;
      const note = (transaction.note || '').toLowerCase();
      return (rule.value as string[]).some((v) => note.includes(v.toLowerCase()));
    }
    case 'amount': {
      if (rule.operator !== 'between' || typeof rule.value !== 'object' || Array.isArray(rule.value)) return false;
      const { min, max } = rule.value as { min: number; max: number };
      let amount = Math.abs(transaction.amount);

      // If currencies match or no currency specified, compare directly
      if (!rule.currencyCode || rule.currencyCode === transaction.currencyCode) {
        return amount >= min && amount <= max;
      }

      // Cross-currency: convert transaction amount to rule's currency, then compare with ±5% tolerance
      try {
        const converted = await calculateRefAmount({
          amount: asCents(amount) as CentsAmount,
          userId,
          date: transaction.time,
          baseCode: transaction.currencyCode,
          quoteCode: rule.currencyCode,
        });
        amount = converted;
      } catch {
        // If conversion fails, rule doesn't match
        return false;
      }

      const tolerance = 0.05;
      const tolerantMin = Math.floor(min * (1 - tolerance));
      const tolerantMax = Math.ceil(max * (1 + tolerance));
      return amount >= tolerantMin && amount <= tolerantMax;
    }
    case 'transactionType': {
      if (rule.operator !== 'equals') return false;
      return transaction.transactionType === rule.value;
    }
    case 'accountId': {
      if (rule.operator !== 'equals') return false;
      return transaction.accountId === Number(rule.value);
    }
    default:
      return false;
  }
}
