/**
 * Commit a reviewed batch of parsed investment transactions to the DB.
 *
 * For each holding row:
 *   1. Ensure the Security exists (create from the provider snapshot if not).
 *   2. Ensure the Holding for (portfolio, security) exists — create or merge.
 *   3. Insert each child transaction via the canonical
 *      `createInvestmentTransaction` service so cash balance, refAmount, and
 *      holding recalculation all run.
 *
 * Wrapping the whole thing in one transaction would deadlock against
 * `createInvestmentTransaction`'s own withTransaction usage — and partial
 * imports are a legitimate outcome anyway (one bad row shouldn't bin the rest).
 * Instead we collect per-row errors and return them.
 */
import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import type { InvestmentImportExecuteResponse, InvestmentImportHolding } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { addOrUpdateFromProvider } from '@services/investments/securities-manage';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';
import { createInvestmentTransaction } from '@services/investments/transactions/create.service';

import { providerForAssetClass } from './symbol-resolution.service';

interface ExecuteImportParams {
  userId: number;
  assetClass: ASSET_CLASS;
  holdings: InvestmentImportHolding[];
  /** tempIds of transactions the user opted to skip (possible duplicates). */
  skipTempIds: string[];
}

export async function executeInvestmentImport({
  userId,
  assetClass,
  holdings,
  skipTempIds,
}: ExecuteImportParams): Promise<InvestmentImportExecuteResponse> {
  const skipSet = new Set(skipTempIds);
  const providerName = providerForAssetClass({ assetClass });

  let createdSecurities = 0;
  let createdHoldings = 0;
  let mergedHoldings = 0;
  let createdTransactions = 0;
  let skippedPossibleDuplicates = 0;
  let skippedHoldings = 0;
  let failedTransactions = 0;
  const warnings: string[] = [];

  const newSecurityIds = new Set<string>();

  for (const holding of holdings) {
    // Guard rails — UI is meant to block these but the API contract still has
    // to defend itself. Same for the per-row validation below. Each guard
    // bumps `skippedHoldings` and pushes a warning so the response actually
    // tells the user why N rows didn't land.
    if (!holding.resolvedSecurity) {
      const reason = `Skipped "${holding.parsedSymbol}": no resolved security.`;
      logger.warn(reason);
      warnings.push(reason);
      skippedHoldings += 1;
      continue;
    }
    if (!holding.currencyCode) {
      const reason = `Skipped "${holding.parsedSymbol}": no currency selected.`;
      logger.warn(reason);
      warnings.push(reason);
      skippedHoldings += 1;
      continue;
    }

    // Verify the target portfolio belongs to this user. Important — the API
    // shape lets the client pass arbitrary portfolio ids.
    const portfolio = await Portfolios.findOne({
      where: { id: holding.portfolioId, userId },
    });
    if (!portfolio) {
      const reason = `Skipped "${holding.parsedSymbol}": target portfolio not found.`;
      logger.warn(reason);
      warnings.push(reason);
      skippedHoldings += 1;
      continue;
    }

    // 1. Resolve or create Security.
    let security: Securities | null = null;
    if (holding.resolvedSecurity.securityId) {
      security = await Securities.findByPk(holding.resolvedSecurity.securityId);
    }
    if (!security) {
      // Build a minimal SecuritySearchResult from the resolved provider data.
      // The provider-specific name/exchange details aren't needed for crypto.
      await addOrUpdateFromProvider([
        {
          symbol: holding.resolvedSecurity.symbol.toUpperCase(),
          providerSymbol: holding.resolvedSecurity.providerSymbol,
          name: holding.resolvedSecurity.name,
          assetClass,
          providerName,
          currencyCode: holding.currencyCode,
          cryptoCurrencyCode:
            assetClass === ASSET_CLASS.crypto ? holding.resolvedSecurity.symbol.toUpperCase() : undefined,
          exchangeName: assetClass === ASSET_CLASS.crypto ? 'CoinGecko' : undefined,
        },
      ]);
      security = await Securities.findOne({
        where: { providerName, providerSymbol: holding.resolvedSecurity.providerSymbol },
      });
      if (!security) {
        const reason = `Skipped "${holding.parsedSymbol}": failed to create security row.`;
        logger.error(reason);
        warnings.push(reason);
        skippedHoldings += 1;
        continue;
      }
      createdSecurities += 1;
      newSecurityIds.add(security.id);
    }

    // 2. Resolve or create Holding for (portfolio, security).
    await addUserCurrencies([{ userId, currencyCode: holding.currencyCode }]);

    let dbHolding = await Holdings.findOne({
      where: { portfolioId: holding.portfolioId, securityId: security.id },
    });
    if (dbHolding) {
      mergedHoldings += 1;
    } else {
      dbHolding = await Holdings.create({
        portfolioId: holding.portfolioId,
        securityId: security.id,
        currencyCode: holding.currencyCode,
        quantity: '0',
        costBasis: '0',
        refCostBasis: '0',
        value: '0',
        refValue: '0',
      });
      createdHoldings += 1;
    }

    // 3. Insert child transactions one by one through the canonical service
    // — it handles refAmount, recalculation, and cash-balance updates.
    for (const tx of holding.transactions) {
      if (skipSet.has(tx.tempId)) {
        skippedPossibleDuplicates += 1;
        continue;
      }

      try {
        await createInvestmentTransaction({
          userId,
          portfolioId: holding.portfolioId,
          securityId: security.id,
          category: tx.side === 'buy' ? INVESTMENT_TRANSACTION_CATEGORY.buy : INVESTMENT_TRANSACTION_CATEGORY.sell,
          date: tx.date,
          quantity: tx.quantity,
          price: tx.price,
          fees: tx.fees,
          name: '',
        });
        createdTransactions += 1;
      } catch (error) {
        // Don't abort the whole batch — surface the failure in the response so
        // the user knows N rows didn't actually land despite the 200.
        const message = error instanceof Error ? error.message : String(error);
        const reason = `Failed to import a "${holding.parsedSymbol}" ${tx.side} on ${tx.date}: ${message}`;
        logger.error({
          message: `Failed to import transaction (tempId=${tx.tempId}, symbol=${holding.parsedSymbol})`,
          error: error as Error,
        });
        warnings.push(reason);
        failedTransactions += 1;
      }
    }
  }

  // Fire historical price sync for any newly-created securities. Fire-and-forget,
  // lock-protected per security inside the service — mirrors createHolding.
  for (const securityId of newSecurityIds) {
    syncHistoricalPrices(securityId).catch((error) => {
      logger.error({
        message: `Background historical price sync failed after import for securityId: ${securityId}`,
        error: error as Error,
      });
    });
  }

  return {
    createdSecurities,
    createdHoldings,
    mergedHoldings,
    createdTransactions,
    skippedPossibleDuplicates,
    skippedHoldings,
    failedTransactions,
    warnings,
  };
}
