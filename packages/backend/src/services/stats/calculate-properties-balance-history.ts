import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils';
import Accounts from '@models/accounts.model';
import Properties from '@models/properties.model';
import { findTransactions } from '@models/transactions-query';
import Transactions from '@models/transactions.model';
import UsersCurrencies from '@models/users-currencies.model';
import { computePropertyValue } from '@services/properties/compute-property-value';
import { buildBaseConversionRateLookup } from '@services/stats/build-base-conversion-rate-lookup';
import { endOfDay, format, parseISO } from 'date-fns';
import { Op } from 'sequelize';

const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

interface PropertyAnchor {
  /** yyyy-MM-dd. Either purchaseDate or a revaluation tx date. */
  date: string;
  /** Property value at the anchor moment, in account currency cents. */
  valueCents: number;
}

interface PropertyCompute {
  accountId: string;
  accountCurrencyCode: string;
  purchaseDate: string;
  annualRatePct: number;
  /**
   * Anchor history in chronological order. First entry is always the purchase
   * (purchaseDate, purchasePrice). Subsequent entries are manual revaluations
   * (transfer_out_wallet txs), each with the post-revaluation value
   * reconstructed from the previous anchor plus the signed tx amount.
   */
  anchors: PropertyAnchor[];
}

const propertyValueAtDate = (property: PropertyCompute, dateStr: string): number => {
  if (property.purchaseDate > dateStr) return 0;

  let activeAnchor = property.anchors[0]!;
  for (const anchor of property.anchors) {
    if (anchor.date <= dateStr) activeAnchor = anchor;
    else break;
  }

  const value = computePropertyValue({
    anchorValue: Money.fromCents(activeAnchor.valueCents),
    anchorDate: parseISO(activeAnchor.date),
    asOf: parseISO(dateStr),
    annualRatePct: property.annualRatePct,
  });

  return value.toCents();
};

/**
 * Day-by-day projected value of all property accounts for a user, in base.
 *
 * Why we don't read `Balances` for properties: those rows are sparse — written
 * only on create, on manual revaluation, and on the lazy refresh. Filling
 * forward from those snapshots makes the chart show a flat property value
 * across the entire range. Instead, we recompute the appreciation curve for
 * each chart date using the same pure function the live read path uses.
 *
 * Anchor handling mirrors what `refresh-property-value.service` does at write
 * time: start from (purchaseDate, purchasePrice), then each manual revaluation
 * (`transfer_out_wallet` tx on the property's account) resets the anchor to
 * (tx.time, projected_value_at_tx + signed_tx_amount). For dates before a
 * property's purchase, it contributes 0 — it didn't exist in net worth yet.
 */
export const calculatePropertiesBalanceHistory = async ({
  userId,
  maxDate,
  uniqueDates,
  userBaseCurrencyPromise,
}: {
  userId: number;
  maxDate: string;
  uniqueDates: string[];
  userBaseCurrencyPromise: Promise<Pick<UsersCurrencies, 'currencyCode'> | null>;
}): Promise<Map<string, number> | null> => {
  const [userBaseCurrency, properties] = await Promise.all([
    userBaseCurrencyPromise,
    Properties.findAll({
      where: { userId },
      include: [{ model: Accounts, as: 'account', attributes: ['id', 'currencyCode', 'excludeFromStats'] }],
    }),
  ]);

  if (!userBaseCurrency?.currencyCode || properties.length === 0) {
    return null;
  }

  const activeProperties = properties.filter((p) => p.account && !p.account.excludeFromStats);

  if (activeProperties.length === 0) {
    return null;
  }

  const accountIds = activeProperties.map((p) => p.accountId);

  // Revaluations are written by the balance-adjustment flow, which stamps them as adjustments —
  // excluding those (the boundary's default) would erase every anchor after the purchase.
  const overrideTxs = await findTransactions({
    planned: 'exclude',
    access: { accountOwner: userId },
    balanceAdjustments: 'include',
    transfers: { natures: [TRANSACTION_TRANSFER_NATURE.transfer_out_wallet] },
    completeness: 'all',
    where: {
      accountId: { [Op.in]: accountIds },
      time: { [Op.lte]: endOfDay(parseISO(maxDate)) },
    },
    order: [
      ['accountId', 'ASC'],
      ['time', 'ASC'],
      ['createdAt', 'ASC'],
    ],
    attributes: ['accountId', 'time', 'amount', 'transactionType'],
  });

  const txsByAccount = new Map<string, Transactions[]>();
  for (const tx of overrideTxs) {
    const list = txsByAccount.get(tx.accountId);
    if (list) list.push(tx);
    else txsByAccount.set(tx.accountId, [tx]);
  }

  const propertyComputes: PropertyCompute[] = activeProperties.map((property) => {
    const compute: PropertyCompute = {
      accountId: property.accountId,
      accountCurrencyCode: property.account.currencyCode,
      purchaseDate: property.purchaseDate,
      annualRatePct: Number(property.annualAppreciationRatePct),
      anchors: [{ date: property.purchaseDate, valueCents: property.purchasePrice.toCents() }],
    };

    const txs = txsByAccount.get(property.accountId) ?? [];
    for (const tx of txs) {
      const txDateStr = formatDate(tx.time);
      const lastAnchor = compute.anchors[compute.anchors.length - 1]!;

      const preTxValue = computePropertyValue({
        anchorValue: Money.fromCents(lastAnchor.valueCents),
        anchorDate: parseISO(lastAnchor.date),
        asOf: parseISO(txDateStr),
        annualRatePct: compute.annualRatePct,
      });

      const signedAmountCents =
        tx.transactionType === TRANSACTION_TYPES.income ? tx.amount.toCents() : -tx.amount.toCents();

      compute.anchors.push({ date: txDateStr, valueCents: preTxValue.toCents() + signedAmountCents });
    }

    return compute;
  });

  const minRangeDate = uniqueDates[0] ?? maxDate;

  const { getExchangeRate, missingRateCurrencies } = await buildBaseConversionRateLookup({
    userId,
    currencyCodes: propertyComputes.map((p) => p.accountCurrencyCode),
    baseCurrencyCode: userBaseCurrency.currencyCode,
    minDate: minRangeDate,
    maxDate,
  });

  const propertyValuesByDate = new Map<string, number>();
  for (const dateStr of uniqueDates) {
    let totalInBaseCents = 0;
    for (const property of propertyComputes) {
      const valueInAccountCents = propertyValueAtDate(property, dateStr);
      if (valueInAccountCents === 0) continue;
      const rate = getExchangeRate(property.accountCurrencyCode, dateStr);
      totalInBaseCents += Math.round(valueInAccountCents * rate);
    }
    propertyValuesByDate.set(dateStr, totalInBaseCents);
  }

  if (missingRateCurrencies.size > 0) {
    logger.warn('Property history exchange rate fallback to 1:1', {
      userId,
      baseCurrency: userBaseCurrency.currencyCode,
      currencies: Array.from(missingRateCurrencies),
      dateRange: { from: minRangeDate, to: maxDate },
    });
  }

  return propertyValuesByDate;
};
