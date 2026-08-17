import Accounts from '@models/accounts.model';
import { getBaseCurrency } from '@models/users-currencies.model';
import { isRevaluedAccount, scheduleBalanceRevalue } from '@services/balances/revalue-balance-history.service';

/**
 * A manual rate for `X → base` prices every past day of an account held in X, so a
 * rate edit or removal moves the whole stored history, not only the spot balances
 * `remeasureRefBalances` re-anchors.
 */
export const revalueAccountsInCurrencies = async ({
  userId,
  pairs,
}: {
  userId: number;
  pairs: { baseCode: string; quoteCode: string }[];
}): Promise<void> => {
  const currencyCodes = [...new Set(pairs.flatMap((pair) => [pair.baseCode, pair.quoteCode]))];
  if (!currencyCodes.length) return;

  const baseCurrency = await getBaseCurrency({ userId });
  if (!baseCurrency) return;

  const accounts = await Accounts.findAll({ where: { userId, currencyCode: currencyCodes } });

  for (const account of accounts) {
    if (!isRevaluedAccount({ account, baseCurrencyCode: baseCurrency.currencyCode })) continue;

    await scheduleBalanceRevalue({ accountId: account.id });
  }
};
