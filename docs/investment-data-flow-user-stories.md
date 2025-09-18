# Investment Data Flow User Stories

## Overview

This document outlines user stories for the search-based investment data system that:

- **Always searches providers** for real-time results (no local DB dependency)
- **Single provider approach** - Alpha Vantage for all markets (US, EU, global)
- **Minimal data storage** - only essential fields, provider-specific data can be NULL
- **Provider abstraction** - designed for easy addition of new providers by developers
- **Bulk sync preserved** in Polygon provider for future use but not actively used

## Current System Analysis

- Uses bulk sync for securities and prices (Polygon-based) - **TO BE DEPRECATED**
- Has search functionality that only queries the database - **TO BE REPLACED**
- New approach: Always query providers directly, store minimal security data on-demand

---

## 1. Securities Search User Stories

### Success Stories

#### US1.1: User searches for US stock

- **Action**: User types "AAPL" in search
- **Expected**:
  - System calls Alpha Vantage search API directly
  - Returns Apple Inc. with basic info (symbol, name, type, region, currency)
  - Additional fields in Securities table can be NULL initially

#### US1.2: User searches for EU stock

- **Action**: User types "ASML" (Dutch company)
- **Expected**:
  - System calls Alpha Vantage search API directly (same provider)
  - Returns ASML Holding NV with basic info (symbol, name, type, region, currency)
  - Other Securities table fields remain NULL until needed
  - User can select to add to their portfolio

#### US1.3: User searches with partial name

- **Action**: User types "micro"
- **Expected**:
  - System calls Alpha Vantage search API
  - Returns Microsoft, Micron, etc. from global results
  - No local DB dependency for search results

### Negative Stories

#### UN1.1: Provider API rate limit exceeded

- **Action**: User searches for any stock
- **Problem**: Provider returns 429 rate limit error
- **Expected**:
  - System shows: "Search rate limit exceeded, please wait a moment and try again"
  - User must cool down before making another search

#### UN1.2: Invalid search query

- **Action**: User enters very short query (1 char) or special chars
- **Expected**:
  - System validates input locally
  - Returns error without making external API call

#### UN1.3: No results found anywhere

- **Action**: User searches for non-existent symbol "XYZABC"
- **Expected**:
  - Alpha Vantage returns empty results
  - System shows: "No securities found matching your search"

---

## 2. Price Data Handling Requirements

### Core Price Loading Scenarios

#### P1: Initial security price fetch

- **Trigger**: User adds a new security to their watchlist/portfolio
- **Action**:
  - System calls Alpha Vantage `getLatestPrice()` for the security
  - Stores current "close" price in SecurityPricing table
  - Ensures even empty portfolios can display current security prices
- **Purpose**: Provide immediate price context for any security user interacts with

#### P2: Historical price backfill on transaction creation

- **Trigger**: User adds transaction dated in the past
- **Example**: Today is 05.07.2025, user adds transaction from 02.02.2024
- **Action**:
  - System checks SecurityPricing table for date range (02.02.2024 to 05.07.2025)
  - Identifies missing price dates for this security
  - Calls Alpha Vantage `getHistoricalPrices(symbol, startDate, endDate)`
  - Backfills all missing daily prices in SecurityPricing table
- **Purpose**: Enable accurate portfolio value calculations for any historical date

#### P3: Daily price updates for held securities

- **Trigger**: Scheduled daily job (e.g., 7 PM after markets close)
- **Action**:
  - Query all unique securities from user transactions/holdings
  - For each security, call Alpha Vantage `getLatestPrice()`
  - Update/insert latest close price in SecurityPricing table
- **Purpose**: Keep portfolio values current without manual intervention

#### P4: Gap filling for existing securities

- **Trigger**: System detects missing dates in SecurityPricing for held security
- **Example**: Security has prices for Jan 1-15, then Jan 20-31, missing Jan 16-19
- **Action**:
  - System calls Alpha Vantage `getHistoricalPrices()` for missing date range
  - Fills gaps in SecurityPricing table
- **Purpose**: Ensure continuous price history for portfolio analytics

### Price Data Requirements Summary

**Provider Interface Needs:**

1. `getLatestPrice(symbol)` - Single current price
2. `getHistoricalPrices(symbol, startDate, endDate)` - Date range prices
3. Both methods return: symbol, date, close price, (optionally: open, high, low, volume)

**Database Strategy:**

- Store prices on-demand (no bulk sync)
- Trigger price fetching based on user actions
- Fill gaps reactively when detected
- Daily updates only for securities user actually holds

---

## 3. End-to-End User Workflows

### W1: Complete "Add Transaction" Flow

1. **User starts**: "I want to add a transaction for BMW from 2024-03-15"
2. **Search phase**:
   - User types "BMW" in security search
   - System calls Alpha Vantage search API
   - Returns BMW AG (BMW.DE) in results
3. **Selection phase**:
   - User selects BMW AG from search results
   - System creates Security record (symbol, name, type, region, currency)
   - Other Security fields remain NULL initially
4. **Price backfill phase**:
   - System checks SecurityPricing for BMW.DE from 2024-03-15 to today
   - Finds missing prices, calls `getHistoricalPrices("BMW.DE", "2024-03-15", "2025-01-15")`
   - Stores all historical prices in SecurityPricing table
5. **Transaction creation**:
   - Creates transaction record linked to BMW security
   - Portfolio can now calculate accurate historical values

### W2: "View Portfolio" Flow

1. **User opens portfolio dashboard**
2. **Portfolio display**:
   - System uses existing data from Securities and SecurityPricing tables
   - Shows portfolio values based on available price data
   - No real-time price fetching during portfolio view (for performance)
3. **Background consideration**:
   - Price updates handled by daily scheduled jobs or triggered by user actions
   - Portfolio view is read-only from existing database state

---

## 4. Migration Strategy

### Simple Direct Migration (Single User System)

#### Implementation Approach

- Implement Alpha Vantage provider with required interface methods
- Update search functionality to use Alpha Vantage directly
- Replace bulk sync jobs with on-demand price fetching
- Deploy complete solution when ready (no gradual rollout needed)

#### Code Changes Required

1. **Implement Alpha Vantage provider**: `searchSecurities()`, `getLatestPrice()`, `getHistoricalPrices()`
2. **Update search service**: Replace DB-only search with Alpha Vantage API calls
3. **Update price sync logic**: Replace bulk `syncDailyPrices()` with individual security price fetching
4. **Disable Polygon jobs**: Stop `syncAllSecurities()` and `syncDailyPrices()` scheduled jobs

#### Data Handling

- **Existing Securities table**: Leave all data as-is, system continues working
- **Existing SecurityPricing table**: Leave all historical data as-is
- **No data cleanup needed**: Historical Polygon data remains valid for portfolio calculations
- **Future data source**: New securities and prices come from Alpha Vantage

#### Simple Rollback (if needed)

- Re-enable Polygon bulk sync jobs
- Revert search service to use local DB
- Alpha Vantage data remains in system (no conflicts with Polygon data)
