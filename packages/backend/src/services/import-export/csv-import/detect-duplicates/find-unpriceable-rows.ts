import type { ParsedTransactionRow } from '@bt/shared/types';
import ExchangeRates from '@models/exchange-rates.model';
import { getBaseCurrency } from '@models/users-currencies.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import { Op } from 'sequelize';

/**
 * Returns rows whose currency cannot be priced by the exchange-rate layer.
 *
 * Priceable currencies: USD (the internal base), the user's own base currency,
 * and any currency that has at least one ExchangeRates row stored (existence
 * implies a fallback rate is available, making the check date-independent).
 *
 * Rows whose currency meets none of those criteria are "unprocessable" from a
 * pricing standpoint and must be skipped or abort the import. Note: this check
 * is conservative — a never-stored currency that a provider could resolve on
 * the current date will also be flagged. Users consent to this via skip/abort.
 */
export async function findUnpriceableRows({
  userId,
  validRows,
}: {
  userId: number;
  validRows: ParsedTransactionRow[];
}): Promise<{ rowIndex: number; currencyCode: string }[]> {
  if (validRows.length === 0) return [];

  // Collect distinct currency codes referenced by the rows.
  const distinctCodes = [...new Set(validRows.map((r) => r.currencyCode))];

  // The two always-priceable codes that need no DB check.
  const baseCurrencyRecord = await getBaseCurrency({ userId });
  const userBaseCurrencyCode = baseCurrencyRecord?.currency?.code ?? null;

  const alwaysPriceable = new Set<string>([API_LAYER_BASE_CURRENCY_CODE]);
  if (userBaseCurrencyCode) alwaysPriceable.add(userBaseCurrencyCode);

  // Only query for codes not already covered by the always-priceable set.
  const codesToCheck = distinctCodes.filter((c) => !alwaysPriceable.has(c));

  const priceableSet = new Set<string>(alwaysPriceable);

  if (codesToCheck.length > 0) {
    // One batched existence query: which of the candidate codes have at least
    // one ExchangeRates row stored under the USD base?
    const rows = await ExchangeRates.findAll({
      attributes: ['quoteCode'],
      where: {
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: { [Op.in]: codesToCheck },
      },
      group: ['quoteCode'],
      raw: true,
    });

    for (const row of rows) {
      priceableSet.add((row as { quoteCode: string }).quoteCode);
    }
  }

  return validRows
    .filter((row) => !priceableSet.has(row.currencyCode))
    .map((row) => ({ rowIndex: row.rowIndex, currencyCode: row.currencyCode }));
}
