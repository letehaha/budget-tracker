import type { AbstractQueryInterface, Transaction } from '@sequelize/core';
import { QueryTypes } from '@sequelize/core';

/**
 * Convert legacy Yahoo-format crypto Securities (BTC-USD, ETH-USD, etc.) to
 * CoinGecko-slug rows so the crypto sync pipeline can fetch their prices.
 *
 * Background: the migration that introduced `providerSymbol`
 * (20260522000000-coingecko-crypto-support) blindly backfilled
 * `providerSymbol := symbol`. For crypto Securities that pre-dated CoinGecko
 * support, `symbol` was a Yahoo ticker like "BTC-USD" — but CoinGecko's API
 * expects coin slugs like "bitcoin". The hourly crypto sync routes every
 * `assetClass = 'crypto'` row to CoinGecko by design, so those legacy rows
 * fail every run and flood Sentry with "no price data" errors.
 *
 * For each known Yahoo crypto symbol this migration:
 *   1. If a coingecko row already exists for the target slug, re-points
 *      Holdings / InvestmentTransactions / SecurityPricings to the existing
 *      coingecko row and deletes the yahoo row. SecurityPricings rows that
 *      would collide on the unique (securityId, date) index are dropped in
 *      favour of the coingecko-originated price.
 *   2. Otherwise rewrites the yahoo row in place: providerName -> coingecko,
 *      providerSymbol -> slug. `symbol` (display ticker) is left untouched
 *      so existing UI references keep working.
 *
 * Symbols not in the mapping table are surfaced via a console.warn so the
 * mapping can be extended without further code changes.
 */
const LEGACY_YAHOO_CRYPTO_TO_COINGECKO_SLUG: Record<string, string> = {
  // The four symbols actively erroring in Sentry as of 2026-05-26.
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'SOL-USD': 'solana',
  'XAUT-USD': 'tether-gold',
  // Top-cap coins likely to have been recorded under the previous Yahoo
  // provider. Safe to over-include: entries that don't match any row are
  // no-ops.
  'BNB-USD': 'binancecoin',
  'USDT-USD': 'tether',
  'USDC-USD': 'usd-coin',
  'ADA-USD': 'cardano',
  'XRP-USD': 'ripple',
  'DOGE-USD': 'dogecoin',
  'DOT-USD': 'polkadot',
  'AVAX-USD': 'avalanche-2',
  'MATIC-USD': 'matic-network',
  'LINK-USD': 'chainlink',
  'LTC-USD': 'litecoin',
  'BCH-USD': 'bitcoin-cash',
  'TRX-USD': 'tron',
  'SHIB-USD': 'shiba-inu',
  'NEAR-USD': 'near',
  'ATOM-USD': 'cosmos',
  'XLM-USD': 'stellar',
  'ETC-USD': 'ethereum-classic',
  'UNI-USD': 'uniswap',
  'APT-USD': 'aptos',
};

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      for (const [legacySymbol, slug] of Object.entries(LEGACY_YAHOO_CRYPTO_TO_COINGECKO_SLUG)) {
        const yahooRows = (await queryInterface.sequelize.query(
          `SELECT id FROM "Securities"
             WHERE "providerName" = 'yahoo'
               AND "assetClass" = 'crypto'
               AND "providerSymbol" = :legacySymbol`,
          { type: QueryTypes.SELECT, replacements: { legacySymbol }, transaction: t },
        )) as Array<{ id: string }>;

        if (yahooRows.length === 0) continue;

        const coingeckoRows = (await queryInterface.sequelize.query(
          `SELECT id FROM "Securities"
             WHERE "providerName" = 'coingecko'
               AND "providerSymbol" = :slug`,
          { type: QueryTypes.SELECT, replacements: { slug }, transaction: t },
        )) as Array<{ id: string }>;

        const targetCoingeckoId = coingeckoRows[0]?.id ?? null;

        for (const { id: yahooId } of yahooRows) {
          if (targetCoingeckoId) {
            await queryInterface.sequelize.query(
              `UPDATE "Holdings" SET "securityId" = :coingeckoId WHERE "securityId" = :yahooId`,
              { replacements: { coingeckoId: targetCoingeckoId, yahooId }, transaction: t },
            );
            await queryInterface.sequelize.query(
              `UPDATE "InvestmentTransactions" SET "securityId" = :coingeckoId WHERE "securityId" = :yahooId`,
              { replacements: { coingeckoId: targetCoingeckoId, yahooId }, transaction: t },
            );
            // Drop yahoo pricing rows whose `date` already has a coingecko row —
            // the coingecko row is provider-of-record and takes precedence.
            await queryInterface.sequelize.query(
              `DELETE FROM "SecurityPricings" yp
                 WHERE yp."securityId" = :yahooId
                   AND EXISTS (
                     SELECT 1 FROM "SecurityPricings" cg
                      WHERE cg."securityId" = :coingeckoId
                        AND cg."date" = yp."date"
                   )`,
              { replacements: { coingeckoId: targetCoingeckoId, yahooId }, transaction: t },
            );
            await queryInterface.sequelize.query(
              `UPDATE "SecurityPricings" SET "securityId" = :coingeckoId WHERE "securityId" = :yahooId`,
              { replacements: { coingeckoId: targetCoingeckoId, yahooId }, transaction: t },
            );
            await queryInterface.sequelize.query(`DELETE FROM "Securities" WHERE id = :yahooId`, {
              replacements: { yahooId },
              transaction: t,
            });
          } else {
            await queryInterface.sequelize.query(
              `UPDATE "Securities"
                  SET "providerName" = 'coingecko',
                      "providerSymbol" = :slug
                WHERE id = :yahooId`,
              { replacements: { slug, yahooId }, transaction: t },
            );
          }
        }
      }

      const unmapped = (await queryInterface.sequelize.query(
        `SELECT DISTINCT "providerSymbol" FROM "Securities"
           WHERE "providerName" = 'yahoo'
             AND "assetClass" = 'crypto'`,
        { type: QueryTypes.SELECT, transaction: t },
      )) as Array<{ providerSymbol: string }>;

      if (unmapped.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          '[migration 20260526000000] Legacy yahoo crypto Securities without a CoinGecko mapping ' +
            `(will continue to fail the sync until mapped): ${unmapped.map((r) => r.providerSymbol).join(', ')}`,
        );
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // The up migration merges pricing rows on collision, so it cannot be undone
  // deterministically — reverting would amount to lossy guesswork. Throw
  // rather than offer a misleading no-op.
  down: async (): Promise<void> => {
    throw new Error(
      'Reverting 20260526000000-migrate-legacy-yahoo-crypto-to-coingecko is not supported: ' +
        'the up migration merges pricing rows on collision, so it cannot be undone deterministically.',
    );
  },
};
