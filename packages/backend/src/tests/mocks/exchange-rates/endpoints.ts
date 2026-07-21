/**
 * Provider endpoint matchers for MSW handlers and e2e call counters.
 * Test-only – these describe the URLs the exchange-rate providers hit, so they
 * live next to the mock infrastructure rather than in production code.
 */
export const API_LAYER_ENDPOINT_REGEX = /https:\/\/api.apilayer.com\/fixer/;
export const CURRENCY_RATES_API_ENDPOINT_REGEX = /http:\/\/currency-rates-api:8080/;
// fawazahmed0 CDN: jsDelivr primary + Cloudflare Pages mirror.
export const FAWAZ_CURRENCY_API_ENDPOINT_REGEX =
  /(cdn\.jsdelivr\.net\/npm\/@fawazahmed0\/currency-api|currency-api\.pages\.dev)/;
