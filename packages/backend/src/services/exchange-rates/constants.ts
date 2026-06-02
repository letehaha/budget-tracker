/**
 * Shared exchange-rate constants.
 *
 * NOTE on the `API_LAYER_` prefix: these are NOT ApiLayer-specific. They are the
 * global base currency and date format used across the whole exchange-rate
 * subsystem (all rates are stored as `USD → X`). The prefix is historical; the
 * values are provider-agnostic. Kept as-is to avoid a wide rename across the
 * stats/investments call sites that already import them.
 */

/** Every rate in the `ExchangeRates` table is stored against this base. */
export const API_LAYER_BASE_CURRENCY_CODE = 'USD';

/** Canonical `yyyy-MM-dd` date format used for provider requests and keys. */
export const API_LAYER_DATE_FORMAT = 'yyyy-MM-dd';
