import { CentsAmount, SubscriptionMatchingRule, asCents } from '@bt/shared/types';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import * as Transactions from '@models/Transactions.model';
import { serializeTransactions } from '@root/serializers/transactions.serializer';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { subMonths } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

const HISTORICAL_MONTHS = 12;
const MAX_SUGGESTIONS = 100;
const CROSS_CURRENCY_TOLERANCE = 0.05; // 5% tolerance for cross-currency matching

export const suggestHistoricalMatches = async ({
  subscriptionId,
  userId,
}: {
  subscriptionId: string;
  userId: number;
}) => {
  const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

  const { matchingRules } = subscription;
  if (!matchingRules?.rules?.length) {
    return [];
  }

  const cutoffDate = subMonths(new Date(), HISTORICAL_MONTHS);

  // Separate rules into SQL-applicable and post-processing rules
  // NOTE: This builds Sequelize WHERE clauses for the same rule types that
  // matching-engine.ts evaluates at runtime via `evaluateRule`. Keep in sync.
  const { sqlConditions, crossCurrencyAmountRules } = buildWhereFromRules({
    rules: matchingRules.rules,
  });

  // If no SQL conditions and no cross-currency rules, nothing to match
  if (sqlConditions.length === 0 && crossCurrencyAmountRules.length === 0) {
    return [];
  }

  // Get IDs of transactions already linked to this subscription (exclude from suggestions)
  const excludedIds = (
    await SubscriptionTransactions.findAll({
      attributes: ['transactionId'],
      where: { subscriptionId },
    })
  ).map((l) => l.transactionId);

  const baseWhere: WhereOptions = {
    userId,
    time: { [Op.gte]: cutoffDate },
    ...(sqlConditions.length > 0 && { [Op.and]: sqlConditions }),
    ...(excludedIds.length > 0 && { id: { [Op.notIn]: excludedIds } }),
    ...(subscription.accountId && { accountId: subscription.accountId }),
  };

  // Fetch more transactions if we need to post-filter by cross-currency amount
  // We fetch more because some will be filtered out after conversion
  const fetchLimit = crossCurrencyAmountRules.length > 0 ? MAX_SUGGESTIONS * 3 : MAX_SUGGESTIONS;

  let transactions = await Transactions.default.findAll({
    where: baseWhere,
    order: [['time', 'DESC']],
    limit: fetchLimit,
  });

  // Apply cross-currency amount filtering in memory
  if (crossCurrencyAmountRules.length > 0 && transactions.length > 0) {
    transactions = await filterByCrossCurrencyAmount({
      transactions,
      rules: crossCurrencyAmountRules,
      userId,
    });
  }

  // Limit to MAX_SUGGESTIONS after filtering
  return serializeTransactions(transactions.slice(0, MAX_SUGGESTIONS));
};

interface AmountRuleWithCurrency {
  min: number;
  max: number;
  currencyCode: string;
}

interface BuildWhereResult {
  sqlConditions: WhereOptions[];
  crossCurrencyAmountRules: AmountRuleWithCurrency[];
}

function buildWhereFromRules({ rules }: { rules: SubscriptionMatchingRule[] }): BuildWhereResult {
  const sqlConditions: WhereOptions[] = [];
  const crossCurrencyAmountRules: AmountRuleWithCurrency[] = [];

  for (const rule of rules) {
    switch (rule.field) {
      case 'note': {
        if (rule.operator === 'contains_any' && Array.isArray(rule.value)) {
          const patterns = (rule.value as string[]).map((v) => ({
            [Op.iLike]: `%${v}%`,
          }));
          sqlConditions.push({ note: { [Op.or]: patterns } });
        }
        break;
      }
      case 'amount': {
        if (rule.operator === 'between' && typeof rule.value === 'object' && !Array.isArray(rule.value)) {
          const { min, max } = rule.value as { min: number; max: number };

          if (rule.currencyCode) {
            // Cross-currency amount rules need post-processing
            crossCurrencyAmountRules.push({
              min,
              max,
              currencyCode: rule.currencyCode,
            });
          } else {
            // Same-currency amount rules can use SQL
            sqlConditions.push({
              amount: { [Op.between]: [min, max] },
            });
          }
        }
        break;
      }
      case 'transactionType': {
        if (rule.operator === 'equals') {
          sqlConditions.push({ transactionType: rule.value as string });
        }
        break;
      }
      case 'accountId': {
        if (rule.operator === 'equals') {
          sqlConditions.push({ accountId: rule.value as number });
        }
        break;
      }
    }
  }

  return { sqlConditions, crossCurrencyAmountRules };
}

/**
 * Filter transactions by cross-currency amount rules.
 * Converts each transaction's amount to the rule's currency and checks if it falls within the range.
 * Uses the same tolerance (5%) as matching-engine.ts for consistency.
 */
async function filterByCrossCurrencyAmount({
  transactions,
  rules,
  userId,
}: {
  transactions: Transactions.default[];
  rules: AmountRuleWithCurrency[];
  userId: number;
}): Promise<Transactions.default[]> {
  const results: Transactions.default[] = [];

  for (const tx of transactions) {
    let matchesAllRules = true;

    for (const rule of rules) {
      let amount = Math.abs(tx.amount);

      // If currencies match, compare directly
      if (tx.currencyCode === rule.currencyCode) {
        if (amount < rule.min || amount > rule.max) {
          matchesAllRules = false;
          break;
        }
        continue;
      }

      // Cross-currency: convert transaction amount to rule's currency
      try {
        const converted = await calculateRefAmount({
          amount: asCents(amount) as CentsAmount,
          userId,
          date: tx.time,
          baseCode: tx.currencyCode,
          quoteCode: rule.currencyCode,
        });
        amount = converted;
      } catch {
        // If conversion fails, rule doesn't match
        matchesAllRules = false;
        break;
      }

      // Apply tolerance (same as matching-engine.ts)
      const tolerantMin = Math.floor(rule.min * (1 - CROSS_CURRENCY_TOLERANCE));
      const tolerantMax = Math.ceil(rule.max * (1 + CROSS_CURRENCY_TOLERANCE));

      if (amount < tolerantMin || amount > tolerantMax) {
        matchesAllRules = false;
        break;
      }
    }

    if (matchesAllRules) {
      results.push(tx);
    }
  }

  return results;
}
