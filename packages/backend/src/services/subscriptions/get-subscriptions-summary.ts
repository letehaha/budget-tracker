import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, asCents, toDecimal } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Subscriptions from '@models/Subscriptions.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

const MONTHLY_MULTIPLIERS: Record<SUBSCRIPTION_FREQUENCIES, number> = {
  [SUBSCRIPTION_FREQUENCIES.weekly]: 4.33,
  [SUBSCRIPTION_FREQUENCIES.biweekly]: 2.17,
  [SUBSCRIPTION_FREQUENCIES.monthly]: 1,
  [SUBSCRIPTION_FREQUENCIES.quarterly]: 1 / 3,
  [SUBSCRIPTION_FREQUENCIES.semiAnnual]: 1 / 6,
  [SUBSCRIPTION_FREQUENCIES.annual]: 1 / 12,
};

interface GetSubscriptionsSummaryParams {
  userId: number;
  type?: SUBSCRIPTION_TYPES;
}

const getSubscriptionsSummaryImpl = async ({ userId, type }: GetSubscriptionsSummaryParams) => {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    expectedAmount: { [Op.ne]: null },
    expectedCurrencyCode: { [Op.ne]: null },
  };
  if (type) where.type = type;

  const subscriptions = await Subscriptions.findAll({
    where,
    attributes: ['id', 'expectedAmount', 'expectedCurrencyCode', 'frequency'],
    raw: true,
  });

  const userCurrency = await UsersCurrencies.getCurrency({
    userId,
    isDefaultCurrency: true,
  });

  const baseCurrencyCode = userCurrency.currency.code;

  let totalMonthlyCents = 0;

  for (const sub of subscriptions) {
    try {
      const refAmount = await calculateRefAmount({
        amount: asCents(sub.expectedAmount!),
        userId,
        date: new Date(),
        baseCode: sub.expectedCurrencyCode!,
      });

      const multiplier = MONTHLY_MULTIPLIERS[sub.frequency] ?? 1;
      totalMonthlyCents += refAmount * multiplier;
    } catch (e) {
      logger.warn(`Skipping subscription ${sub.id} in summary: currency conversion failed`);
    }
  }

  const monthlyCents = Math.round(totalMonthlyCents);
  const yearlyCents = monthlyCents * 12;

  return {
    estimatedMonthlyCost: toDecimal(asCents(monthlyCents)),
    projectedYearlyCost: toDecimal(asCents(yearlyCents)),
    activeCount: subscriptions.length,
    currencyCode: baseCurrencyCode,
  };
};

export const getSubscriptionsSummary = withTransaction(getSubscriptionsSummaryImpl);
