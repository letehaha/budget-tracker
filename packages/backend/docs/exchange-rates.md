# Exchange Rates System

## Overview

Hybrid system using ApiLayer (primary) with Frankfurter fallback:

- **ApiLayer**: 150+ currencies, multiple API keys with retry logic
- **Frankfurter**: 31 major currencies (self-hosted, no rate limits)
- **Historical Data**: Auto-loads from 1999-01-04 on startup (background, non-blocking)

**Frankfurter Currencies (31):** AUD, BGN, BRL, CAD, CHF, CNY, CZK, DKK, EUR, GBP, HKD, HUF, IDR, ILS, INR, ISK, JPY, KRW, MXN, MYR, NOK, NZD, PHP, PLN, RON, SEK, SGD, THB, TRY, USD, ZAR

## Key Services

| Service         | Location                                 | Purpose                                                          |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Frankfurter     | `frankfurter.service.ts`                 | Fetch rates (single date or time series)                         |
| Fetch Rates     | `fetch-exchange-rates-for-date.ts`       | Hybrid fetch: ApiLayer → Frankfurter fallback                    |
| Historical Init | `initialize-historical-rates.service.ts` | Load 1999-present on startup (background) using only Frankfurter |
| Daily Cron      | `crons/exchange-rates/index.ts`          | Daily sync at 00:05 UTC                                          |

**Fetch Flow:** Check DB → ApiLayer (retry multiple keys) → Frankfurter (on 429/5xx) → Filter valid currencies → Bulk insert

## Configuration

**Required:**

```bash
API_LAYER_API_KEYS=key1,key2,key3  # Comma-separated
```

**Optional:**

```bash
FRANKFURTER_BASE_URL=http://frankfurter:8080  # Default value
```

**Docker:** Frankfurter included in `docker/dev|prod/docker-compose.yml` (image: `lineofflight/frankfurter`)

## Startup Behavior

- **First Run:** loads data from 1999 year
- **Subsequent:** ~5-10s (all duplicates, idempotent)
- Non-blocking (app starts immediately)

## Troubleshooting

| Issue                   | Solution                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| No rates after startup  | Check logs → Verify Frankfurter (`curl http://frankfurter:8080/v1/latest`) → Check `Currencies` table → Restart |
| ApiLayer rate limits    | Add more keys to `API_LAYER_API_KEYS` (auto-fallback to Frankfurter)                                            |
| Missing historical data | Restart server (idempotent) or manually: `await initializeHistoricalRates()`                                    |
| FK constraint violation | Currencies must exist in DB first (auto-filtered, check logs)                                                   |
