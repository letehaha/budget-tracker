/**
 * Resolve AI-parsed symbol strings to Security rows + normalise currencies.
 *
 * Pure-ish helpers (the symbol part hits the DB and the provider). Designed
 * to be testable in isolation from the rest of the import pipeline.
 */
import { ASSET_CLASS, SECURITY_PROVIDER, type SecuritySearchResult } from '@bt/shared/types/investments';
import type { ResolvedSecurityRef, SymbolResolutionConfidence } from '@bt/shared/types/investments';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { dataProviderFactory } from '@services/investments/data-providers';

/**
 * USD-pegged stablecoins. Trades quoted in any of these are accounted as USD
 * cash. The user can override per row in the UI if they want to track a
 * specific stable separately.
 */
const USD_STABLECOINS = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FDUSD', 'PYUSD']);

/**
 * Currencies that always exist in our `Currencies` reference table. Anything
 * else falls into the "user must fix" bucket.
 *
 * We don't query the table here — keep this resolver synchronous + cheap.
 * If a fiat ever isn't in our DB the executor will catch it at commit time.
 */
const KNOWN_FIATS = new Set([
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'CNY',
  'HKD',
  'SGD',
  'INR',
  'BRL',
  'MXN',
  'ZAR',
  'KRW',
  'TRY',
  'AED',
  'PLN',
  'UAH',
  'CZK',
  'SEK',
  'NOK',
  'DKK',
  'HUF',
  'ILS',
  'THB',
]);

/**
 * Normalise the AI's quote-currency literal into an ISO-style code, or null
 * if we can't make sense of it (crypto-quoted pair, unknown token).
 *
 * Returning null is the "row is invalid" signal — the executor will refuse
 * to commit such rows and the UI will block until the user picks a currency.
 */
export function normaliseCurrency({ raw }: { raw: string | null | undefined }): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (!upper) return null;
  if (USD_STABLECOINS.has(upper)) return 'USD';
  if (KNOWN_FIATS.has(upper)) return upper;
  return null;
}

interface ResolveSymbolsParams {
  userId: number;
  /** Unique uppercased symbols the AI returned (e.g. ["BTC", "ETH", "SOL"]). */
  symbols: string[];
  /** Drives provider selection — crypto goes to CoinGecko, stocks to FMP/Yahoo. */
  assetClass: ASSET_CLASS;
  /** Used to set `hasExistingHolding: true` when the resolved security already
   * lives in this portfolio — that drives the "will merge" indicator in the UI. */
  defaultPortfolioId: string;
}

interface ResolvedSymbol {
  parsedSymbol: string;
  resolvedSecurity: ResolvedSecurityRef | null;
  resolvedConfidence: SymbolResolutionConfidence;
  /** True iff the resolved security already has a holding in `defaultPortfolio`. */
  hasExistingHolding: boolean;
}

interface SymbolResolutionResult {
  bySymbol: Map<string, ResolvedSymbol>;
  /** Human-readable issues that the UI should surface (e.g. provider failure
   * for a specific ticker). Empty when the resolver had a clean run. */
  warnings: string[];
}

/**
 * Lookup priority for each parsed symbol:
 *
 *   1. The user already has a Security with this ticker in their portfolios.
 *      Use it — covers the most common "incremental import" case where the
 *      user has been tracking BTC for months and just dropped in a new CSV.
 *
 *   2. Otherwise ask the provider (CoinGecko for crypto). If exactly one exact-
 *      symbol match comes back and it has a market-cap rank (i.e. real coin,
 *      not a dust token), take it. Otherwise leave unresolved — there's no
 *      safe way to pick BTC vs Wrapped-BTC vs the dozens of scam tokens that
 *      share the BTC ticker without showing the user.
 */
export async function resolveSymbols({
  userId,
  symbols,
  assetClass,
  defaultPortfolioId,
}: ResolveSymbolsParams): Promise<SymbolResolutionResult> {
  const out = new Map<string, ResolvedSymbol>();
  const warnings: string[] = [];
  if (symbols.length === 0) return { bySymbol: out, warnings };

  const uniqUpper = Array.from(new Set(symbols.map((s) => s.toUpperCase())));

  // Step 1: securities the user already holds anywhere — keyed by ticker.
  //
  // Two queries instead of one big nested include: easier to keep the
  // sequelize-typescript association aliases correct, and the working set is
  // small (one row per symbol the AI returned).
  const userPortfolios = await Portfolios.findAll({ where: { userId }, attributes: ['id'] });
  const userPortfolioIds = userPortfolios.map((p) => p.id);

  const userByTicker = new Map<string, { security: Securities; hasExistingHolding: boolean }>();

  if (userPortfolioIds.length > 0) {
    const userHoldings = await Holdings.findAll({
      where: { portfolioId: userPortfolioIds },
      attributes: ['portfolioId', 'securityId'],
    });
    if (userHoldings.length > 0) {
      const securityIds = Array.from(new Set(userHoldings.map((h) => h.securityId)));
      const securities = await Securities.findAll({
        where: { id: securityIds, assetClass, symbol: uniqUpper },
      });
      const portfoliosBySecurityId = new Map<string, Set<string>>();
      for (const h of userHoldings) {
        const set = portfoliosBySecurityId.get(h.securityId);
        if (set) set.add(h.portfolioId);
        else portfoliosBySecurityId.set(h.securityId, new Set([h.portfolioId]));
      }
      for (const sec of securities) {
        const ticker = sec.symbol?.toUpperCase();
        if (!ticker) continue;
        const portfolios = portfoliosBySecurityId.get(sec.id) ?? new Set<string>();
        const inDefault = portfolios.has(defaultPortfolioId);
        const existing = userByTicker.get(ticker);
        if (!existing) {
          userByTicker.set(ticker, { security: sec, hasExistingHolding: inDefault });
        } else if (!existing.hasExistingHolding && inDefault) {
          userByTicker.set(ticker, { security: sec, hasExistingHolding: true });
        }
      }
    }
  }

  // Step 2: provider search for the symbols that didn't resolve from the user's
  // own securities. Stocks go through this path too once supported.
  const unresolvedTickers = uniqUpper.filter((t) => !userByTicker.has(t));
  const providerHits = new Map<string, SecuritySearchResult[]>();
  if (unresolvedTickers.length > 0) {
    const provider = dataProviderFactory.getProvider();
    await Promise.all(
      unresolvedTickers.map(async (ticker) => {
        try {
          const results = await provider.searchSecurities(ticker, { assetClass });
          providerHits.set(
            ticker,
            results.filter((r) => r.assetClass === assetClass),
          );
        } catch (error) {
          // Provider failures (network blip, rate limit) used to be silently
          // converted to "unmapped" — now we record the symbol + reason so the
          // UI can show "couldn't reach CoinGecko for SOL, try again later"
          // instead of misleadingly suggesting SOL doesn't exist.
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Provider lookup failed for "${ticker}": ${message}.`);
          providerHits.set(ticker, []);
        }
      }),
    );
  }

  for (const ticker of uniqUpper) {
    const fromUser = userByTicker.get(ticker);
    if (fromUser) {
      out.set(ticker, {
        parsedSymbol: ticker,
        resolvedSecurity: {
          securityId: fromUser.security.id,
          providerSymbol: fromUser.security.providerSymbol,
          symbol: fromUser.security.symbol ?? ticker,
          name: fromUser.security.name ?? ticker,
          alreadyInDb: true,
        },
        resolvedConfidence: 'auto',
        hasExistingHolding: fromUser.hasExistingHolding,
      });
      continue;
    }

    const hits = providerHits.get(ticker) ?? [];
    // Only count hits that *exactly* match the parsed ticker — partial matches
    // are too noisy for an auto-pick (e.g. searching "OP" surfaces Polygon
    // results for every coin whose name contains "Op…").
    const exact = hits.filter((h) => h.symbol.toUpperCase() === ticker);
    const ranked = exact
      .filter((h) => h.marketCapRank != null)
      .toSorted(
        (a, b) => (a.marketCapRank ?? Number.POSITIVE_INFINITY) - (b.marketCapRank ?? Number.POSITIVE_INFINITY),
      );

    if (ranked.length === 1) {
      const hit = ranked[0]!;
      out.set(ticker, {
        parsedSymbol: ticker,
        resolvedSecurity: {
          securityId: null,
          providerSymbol: hit.providerSymbol,
          symbol: hit.symbol.toUpperCase(),
          name: hit.name,
          alreadyInDb: false,
        },
        resolvedConfidence: 'auto',
        hasExistingHolding: false,
      });
      continue;
    }

    if (ranked.length > 1) {
      out.set(ticker, {
        parsedSymbol: ticker,
        resolvedSecurity: null,
        resolvedConfidence: 'ambiguous',
        hasExistingHolding: false,
      });
      continue;
    }

    out.set(ticker, {
      parsedSymbol: ticker,
      resolvedSecurity: null,
      resolvedConfidence: 'unmapped',
      hasExistingHolding: false,
    });
  }

  return { bySymbol: out, warnings };
}

/**
 * For tests / future stocks branch: provider preference matrix lookup.
 * Returns the SECURITY_PROVIDER that should be used for an asset class —
 * exported so e2e tests can assert wiring without spinning up the composite.
 */
export function providerForAssetClass({ assetClass }: { assetClass: ASSET_CLASS }): SECURITY_PROVIDER {
  if (assetClass === ASSET_CLASS.crypto) return SECURITY_PROVIDER.coingecko;
  return SECURITY_PROVIDER.composite;
}
