# Exchange Rates System

## Overview

Modular provider system with priority-based fallback:

1. **Currency Rates API** (primary): 38 currencies (ECB + NBU data), self-hosted
2. **Frankfurter** (fallback): 31 major currencies, self-hosted
3. **ApiLayer** (tertiary): 150+ currencies, paid service with multiple API keys

**Historical Data**: Auto-loads from 1999-01-04 on startup (background, non-blocking)

## Architecture

```
providers/
├── types.ts                    # Provider interfaces & types
├── base-provider.ts            # Abstract base class
├── registry.ts                 # Provider registry singleton
├── initialize-providers.ts     # Startup registration
├── currency-rates-api/         # Primary provider
├── frankfurter/                # Secondary fallback
└── api-layer/                  # Tertiary fallback
```

## Key Services

| Service         | Location                                 | Purpose                                           |
| --------------- | ---------------------------------------- | ------------------------------------------------- |
| Provider System | `providers/`                             | Modular provider architecture with fallback chain |
| Fetch Rates     | `fetch-exchange-rates-for-date.ts`       | Uses registry for priority-based fetching         |
| Historical Init | `initialize-historical-rates.service.ts` | Load 1999-present on startup using Frankfurter    |
| Daily Cron      | `crons/exchange-rates/index.ts`          | Daily sync at 00:05 UTC                           |

**Fetch Flow:** Check DB → Currency Rates API → Frankfurter → ApiLayer → Filter valid currencies → Bulk insert

## Supported Currencies

- **Currency Rates API (38):** AUD, BGN, BRL, CAD, CHF, CNY, CZK, DKK, EGP, EUR, GBP, GEL, HKD, HUF, IDR, ILS, INR, ISK, JPY, KRW, KZT, LBP, MDL, MXN, MYR, NOK, NZD, PHP, PLN, RON, SAR, SEK, SGD, THB, TRY, UAH, VND, ZAR
- **Frankfurter (31):** AUD, BGN, BRL, CAD, CHF, CNY, CZK, DKK, EUR, GBP, HKD, HUF, IDR, ILS, INR, ISK, JPY, KRW, MXN, MYR, NOK, NZD, PHP, PLN, RON, SEK, SGD, THB, TRY, USD, ZAR
- **ApiLayer (150+):** All major and minor currencies

## Configuration

**Required:**

```bash
API_LAYER_API_KEYS=key1,key2,key3  # Comma-separated (for ApiLayer fallback)
```

**Docker Services:**

```yaml
# In docker-compose.yml
currency-rates-api:
  image: letehaha/currency-rates-api:latest
  ports: ['8102:8080']

frankfurter:
  image: lineofflight/frankfurter
```

## Startup Behavior

- **First Run:** loads data from 1999 year
- **Subsequent:** ~5-10s (all duplicates, idempotent)
- Non-blocking (app starts immediately)

## Adding a New Provider

1. Create provider directory: `providers/new-provider/`
2. Implement `IExchangeRateProvider` interface
3. Register in `initialize-providers.ts`

## Troubleshooting

| Issue                   | Solution                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| No rates after startup  | Check logs → Verify services are running → Check `Currencies` table → Restart |
| All providers failing   | Check Docker services → Verify network connectivity → Check API keys          |
| Missing historical data | Restart server (idempotent) or manually: `await initializeHistoricalRates()`  |
| FK constraint violation | Currencies must exist in DB first (auto-filtered, check logs)                 |
