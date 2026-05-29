import type { AbstractQueryInterface } from '@sequelize/core';
import { DataTypes } from '@sequelize/core';

const TABLE = 'ExchangeRates';
const COLUMN = 'source';
const CHECK_CONSTRAINT = 'ExchangeRates_source_valid';

// Values MUST stay in sync with EXCHANGE_RATE_PROVIDER_TYPE in
// src/services/exchange-rates/providers/types.ts. Migrations run in plain Node
// and cannot import app code, so the strings are duplicated here.
const PROVIDER_CURRENCY_RATES_API = 'currency-rates-api';
const PROVIDER_FRANKFURTER = 'frankfurter';
const PROVIDER_API_LAYER = 'api-layer';
const PROVIDER_UNKNOWN = 'unknown';

const ALL_PROVIDERS = [
  PROVIDER_CURRENCY_RATES_API,
  PROVIDER_FRANKFURTER,
  PROVIDER_API_LAYER,
  PROVIDER_UNKNOWN,
] as const;

// Only currency-rates-api quotes these (NBU-only currencies).
// Used to distinguish currency-rates-api writes from frankfurter writes
// when the per-date row count is below the api-layer threshold.
const CURRENCY_RATES_API_EXCLUSIVE_QUOTES = ['UAH', 'EGP', 'GEL', 'KZT', 'LBP', 'MDL', 'SAR', 'VND'];

// Per-date row count at or above which we attribute the date to api-layer.
// Currency-rates-api supplies ~37 quotes/day, frankfurter ~31, api-layer ~170.
const API_LAYER_ROW_COUNT_THRESHOLD = 100;

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        TABLE,
        COLUMN,
        {
          type: DataTypes.STRING(32),
          allowNull: true,
          defaultValue: PROVIDER_UNKNOWN,
        },
        { transaction },
      );

      // Generate :ex0, :ex1, ... placeholders to parameterize the exclusive list.
      const exclusivePlaceholders = CURRENCY_RATES_API_EXCLUSIVE_QUOTES.map((_, i) => `:ex${i}`).join(', ');
      const exclusiveReplacements = Object.fromEntries(
        CURRENCY_RATES_API_EXCLUSIVE_QUOTES.map((code, i) => [`ex${i}`, code]),
      );

      await queryInterface.sequelize.query(
        `
        WITH per_date AS (
          SELECT
            date,
            COUNT(*) AS cnt,
            BOOL_OR("quoteCode" IN (${exclusivePlaceholders})) AS has_exclusive
          FROM "${TABLE}"
          GROUP BY date
        )
        UPDATE "${TABLE}" er
        SET "${COLUMN}" = CASE
          WHEN pd.cnt >= :apiLayerThreshold THEN :apiLayer
          WHEN pd.has_exclusive THEN :currencyRatesApi
          ELSE :frankfurter
        END
        FROM per_date pd
        WHERE er.date = pd.date;
        `,
        {
          transaction,
          replacements: {
            apiLayerThreshold: API_LAYER_ROW_COUNT_THRESHOLD,
            apiLayer: PROVIDER_API_LAYER,
            currencyRatesApi: PROVIDER_CURRENCY_RATES_API,
            frankfurter: PROVIDER_FRANKFURTER,
            ...exclusiveReplacements,
          },
        },
      );

      // Fail loudly if any rows were missed by the backfill, instead of letting
      // the changeColumn() below throw a cryptic NOT NULL constraint error.
      const [nullRows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS cnt FROM "${TABLE}" WHERE "${COLUMN}" IS NULL;`,
        { transaction },
      );
      const nullCount = (nullRows as { cnt: number }[])[0]?.cnt ?? 0;
      if (nullCount > 0) {
        throw new Error(
          `Backfill left ${nullCount} ${TABLE} row(s) with NULL ${COLUMN}; aborting before NOT NULL flip.`,
        );
      }

      await queryInterface.changeColumn(
        TABLE,
        COLUMN,
        {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: PROVIDER_UNKNOWN,
        },
        { transaction },
      );

      // DB-level guard so raw queries / bad code paths cannot poison the column
      // with values outside the EXCHANGE_RATE_PROVIDER_TYPE enum.
      const checkPlaceholders = ALL_PROVIDERS.map((_, i) => `:p${i}`).join(', ');
      const checkReplacements = Object.fromEntries(ALL_PROVIDERS.map((value, i) => [`p${i}`, value]));
      await queryInterface.sequelize.query(
        `ALTER TABLE "${TABLE}" ADD CONSTRAINT "${CHECK_CONSTRAINT}" CHECK ("${COLUMN}" IN (${checkPlaceholders}));`,
        { transaction, replacements: checkReplacements },
      );
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "${CHECK_CONSTRAINT}";`, {
        transaction,
      });
      await queryInterface.removeColumn(TABLE, COLUMN, { transaction });
    });
  },
};
