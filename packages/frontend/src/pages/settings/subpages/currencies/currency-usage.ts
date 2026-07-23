/**
 * Tallies how many accounts hold each currency, keyed by currency code.
 * A currency with no accounts is simply absent from the map — callers treat a
 * missing key as zero, so the "unused" state falls out of a lookup default.
 */
export const buildCurrencyUsageMap = ({
  accounts,
}: {
  accounts: { currencyCode: string }[];
}): Record<string, number> => {
  const usage: Record<string, number> = {};

  for (const account of accounts) {
    const code = account.currencyCode;
    if (!code) continue;
    usage[code] = (usage[code] ?? 0) + 1;
  }

  return usage;
};
