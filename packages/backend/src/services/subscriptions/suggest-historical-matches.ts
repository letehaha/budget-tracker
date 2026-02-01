import { SubscriptionMatchingRule } from '@bt/shared/types';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import Transactions from '@models/Transactions.model';
import { serializeTransactions } from '@root/serializers/transactions.serializer';
import { subMonths } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

const HISTORICAL_MONTHS = 12;
const MAX_SUGGESTIONS = 100;

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

  // Build WHERE clause from matching rules (AND logic)
  // NOTE: This builds Sequelize WHERE clauses for the same rule types that
  // matching-engine.ts evaluates at runtime via `evaluateRule`. Keep in sync.
  const ruleConditions = buildWhereFromRules({ rules: matchingRules.rules });

  if (ruleConditions.length === 0) {
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
    [Op.and]: ruleConditions,
    ...(excludedIds.length > 0 && { id: { [Op.notIn]: excludedIds } }),
    ...(subscription.accountId && { accountId: subscription.accountId }),
  };

  const transactions = await Transactions.findAll({
    where: baseWhere,
    order: [['time', 'DESC']],
    limit: MAX_SUGGESTIONS,
  });

  return serializeTransactions(transactions);
};

function buildWhereFromRules({ rules }: { rules: SubscriptionMatchingRule[] }): WhereOptions[] {
  const conditions: WhereOptions[] = [];

  for (const rule of rules) {
    switch (rule.field) {
      case 'note': {
        if (rule.operator === 'contains_any' && Array.isArray(rule.value)) {
          const patterns = (rule.value as string[]).map((v) => ({
            [Op.iLike]: `%${v}%`,
          }));
          conditions.push({ note: { [Op.or]: patterns } });
        }
        break;
      }
      case 'amount': {
        if (rule.operator === 'between' && typeof rule.value === 'object' && !Array.isArray(rule.value)) {
          const { min, max } = rule.value as { min: number; max: number };
          conditions.push({
            amount: { [Op.between]: [min, max] },
          });
        }
        break;
      }
      case 'transactionType': {
        if (rule.operator === 'equals') {
          conditions.push({ transactionType: rule.value as string });
        }
        break;
      }
      case 'accountId': {
        if (rule.operator === 'equals') {
          conditions.push({ accountId: rule.value as number });
        }
        break;
      }
    }
  }

  return conditions;
}
