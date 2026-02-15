# Bank Data Providers - Architecture Overview

## System Purpose

The bank-data-providers system is a modular framework for connecting users' bank accounts and syncing financial data. It supports multiple providers (Monobank, Enable Banking, LunchFlow) through a unified interface using the Provider Pattern and Registry Pattern.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           API ROUTES                            │
│                    (bank-data-providers.route.ts)               │
└────┬────────────────────────────────────────────────────────────┘
     │
     ├─ POST /:providerType/connect
     ├─ GET/DELETE /connections/:connectionId
     ├─ GET /connections/:connectionId/available-accounts
     ├─ POST /connections/:connectionId/sync-selected-accounts
     ├─ POST /connections/:connectionId/sync-transactions
     ├─ POST /sync/trigger
     ├─ GET /sync/status
     └─ POST /enablebanking/oauth-callback
     │
┌────▼────────────────────────────────────────────────────────────┐
│                      CONTROLLERS LAYER                          │
│          (src/controllers/bank-data-providers/)                 │
└────┬────────────────────────────────────────────────────────────┘
     │
┌────▼────────────────────────────────────────────────────────────┐
│                       SERVICES LAYER                            │
│        (src/services/bank-data-providers/)                      │
│                                                                 │
│  ┌─ CONNECTION SERVICES ────┐  ┌─ SYNC SERVICES ─────────────┐ │
│  │ connect-provider         │  │ sync-manager                │ │
│  │ list-external-accounts   │  │ sync-status-tracker (Redis) │ │
│  │ connect-selected-accounts│  │ account-prioritizer         │ │
│  │ disconnect-provider      │  └─────────────────────────────┘ │
│  │ sync-transactions        │                                  │
│  └──────────────────────────┘                                  │
│                                                                 │
│  ┌─ PROVIDER INTERFACE ─────────────────────────────────────┐  │
│  │ IBankDataProvider (types.ts)                             │  │
│  │ BaseBankDataProvider (abstract base class)               │  │
│  │ BankProviderRegistry (singleton)                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────┬────────────────────────────────────────────────────────────┘
     │
     ├─────────────────────────────┬──────────────────────────────┐
     ▼                             ▼                              │
┌────────────────────┐  ┌─────────────────────────┐  ┌──────────────────┐
│  MONOBANK PROVIDER │  │  ENABLE BANKING PROVIDER│  │ LUNCHFLOW PROVIDER│
│                    │  │                         │  │                  │
│ • Simple API token │  │ • OAuth2 + JWT flow     │  │ • API key auth   │
│ • BullMQ queue     │  │ • Direct sync           │  │ • Direct sync    │
│ • 60s rate limit   │  │ • Consent tracking      │  │ • No date filter │
└────────────────────┘  └─────────────────────────┘  └──────────────────┘
```

## Core Concepts

### Provider Registry (Singleton)

All providers register at app startup via `initializeBankProviders()`. Services look up providers dynamically:

```typescript
const provider = bankProviderRegistry.get(BANK_PROVIDER_TYPE.MONOBANK);
await provider.fetchAccounts(connectionId);
```

### Database Models

| Model                         | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `BankDataProviderConnections` | Stores connection metadata, encrypted credentials, consent info |
| `Accounts`                    | User accounts linked via `bankDataProviderConnectionId`         |
| `Transactions`                | Transactions with `originalId` for deduplication                |

### Sync Status (Redis)

```
account:{accountId}:sync-status → { status, startedAt, completedAt, error }

States: IDLE → QUEUED → SYNCING → COMPLETED
                  ↓
               FAILED
```

---

## Flow 1: Connection

### Monobank (Simple Token)

```
User provides API token
       ↓
POST /monobank/connect
       ↓
MonobankProvider.connect()
  • Validate token via API call
  • Encrypt and store credentials
  • Return connectionId
       ↓
Connection immediately ACTIVE
```

### Enable Banking (OAuth2)

```
User provides: appId, privateKey, bankName, bankCountry
       ↓
POST /enablebanking/connect
       ↓
EnableBankingProvider.connect()
  • Validate private key format
  • Generate OAuth state (CSRF protection)
  • Call startAuthorization() → returns auth URL
  • Store pending connection (isActive = false)
  • Return connectionId
       ↓
Frontend redirects user to auth URL
       ↓
User authorizes at bank
       ↓
POST /enablebanking/oauth-callback
       ↓
EnableBankingProvider.handleOAuthCallback()
  • Validate state parameter
  • Exchange code for session
  • Store sessionId in credentials
  • Set isActive = true
       ↓
Connection now ACTIVE
```

### LunchFlow (API Key)

```
User provides API key
       ↓
POST /lunchflow/connect
       ↓
LunchFlowProvider.connect()
  • Validate API key via test connection
  • Encrypt and store credentials
  • Return connectionId
       ↓
Connection immediately ACTIVE
```

---

## Flow 2: Account Selection & Creation

This is a **two-stage process**:

### Stage 1: List Available Accounts

```
GET /connections/{connectionId}/available-accounts
       ↓
listExternalAccounts() service
       ↓
provider.fetchAccounts(connectionId)
       ↓
Returns account list (NOT saved to DB)
       ↓
Frontend displays for user selection
```

### Stage 2: Connect Selected Accounts

```
POST /connections/{connectionId}/sync-selected-accounts
Body: { accountExternalIds: ["acc1", "acc2"] }
       ↓
connectSelectedAccounts() service
       ↓
For each selected account:
  • Check if exists (by externalId + connectionId)
  • If exists: re-enable (isEnabled = true)
  • If new: create Accounts record with:
    - Proper ref amounts (calculateRefAmount)
    - Link to connection
    - Balance, currency, metadata
       ↓
Trigger transaction sync for each account
       ↓
Return created accounts
```

**Key file:** `connection/connect-selected-accounts.ts`

This is where accounts are actually created with proper `refInitialBalance` and `refCurrentBalance` calculations.

---

## Flow 3: Transaction Sync

### Monobank: Queue-Based (BullMQ)

```
syncTransactionsForAccount()
       ↓
MonobankProvider.syncTransactions()
       ↓
Set status = QUEUED
       ↓
Calculate 31-day batches (rate limit constraint)
       ↓
Queue jobs via BullMQ (1 job per batch)
       ↓
Return immediately: { jobGroupId, totalBatches }
       ↓
BACKGROUND (BullMQ Worker):
  For each batch:
    • Fetch transactions from API
    • Check duplicates by originalId
    • Create Transaction records
    • Update account balance
  When done: status = COMPLETED
```

**Why queue-based?**

- Monobank has 1 request per 60 seconds rate limit
- Historical sync can need 10+ requests
- Can't block HTTP response for 10+ minutes

### Enable Banking: Direct Sync

```
syncTransactionsForAccount()
       ↓
EnableBankingProvider.syncTransactions()
       ↓
Set status = SYNCING
       ↓
Fetch all transactions in one API call
       ↓
For each transaction:
  • Generate deterministic externalId (SHA256 hash)
  • Check duplicates by originalId
  • Create Transaction record
       ↓
Update account balance
       ↓
Set status = COMPLETED
```

**Why direct?**

- Enable Banking has generous rate limits
- Single request returns all data
- Completes within HTTP timeout

### LunchFlow: Direct Sync (Post-Fetch Filtering)

```
syncTransactionsForAccount()
       ↓
LunchFlowProvider.syncTransactions()
       ↓
Set status = SYNCING
       ↓
Fetch ALL transactions (API has no date-range support)
       ↓
Filter out pending transactions (null IDs)
       ↓
Post-fetch date filtering:
  • Find latest existing transaction date in DB
  • Discard API transactions older than that date
       ↓
For each remaining transaction:
  • Primary dedup: check by originalId
  • Secondary dedup: check externalData.originalSource.originalId
  • Create Transaction record
       ↓
Update account balance
       ↓
Set status = COMPLETED
```

**Why post-fetch filtering?**

- LunchFlow API does NOT support date-range query parameters
- Without filtering, every sync re-processes all historical transactions
- Post-fetch filtering avoids duplicates when manual transactions exist (see Flow 6)

---

## Flow 4: Auto-Sync

```
POST /sync/trigger (or scheduled trigger)
       ↓
syncAllUserAccounts()
       ↓
Fetch all user's bank-connected accounts
       ↓
Set all to QUEUED
       ↓
Schedule via Bottleneck (max 5 concurrent)
       ↓
Each account syncs independently
       ↓
Frontend polls GET /sync/status for progress
```

---

## Flow 5: Disconnect Provider

**CRITICAL**: Disconnecting a provider MUST reset all linked accounts to `system` type. Without this, accounts retain their provider-specific type (e.g. `lunchflow`) and cannot be relinked because the UI only shows the "Link" button for `system`-type accounts.

### With `removeAssociatedAccounts=false` (default)

```
DELETE /connections/{connectionId}?removeAssociatedAccounts=false
       ↓
disconnectProvider() service
       ↓
For each linked account:
  unlinkAccountFromBankConnection()
    • Account type → system
    • bankDataProviderConnectionId → null
    • externalId → null
    • Store connection history in externalData
    • All transactions: accountType → system, originalId → null
    • Preserve originalId in externalData.originalSource (for relink dedup)
       ↓
provider.disconnect(connectionId)
  • Provider-specific cleanup (e.g. revoke OAuth session)
  • Delete BankDataProviderConnections record
```

### With `removeAssociatedAccounts=true`

```
DELETE /connections/{connectionId}?removeAssociatedAccounts=true
       ↓
Permanently delete all linked accounts (and their transactions via CASCADE)
       ↓
provider.disconnect(connectionId)
```

**Key file:** `connection/disconnect-provider.ts`, `accounts/unlink-from-bank-connection.ts`

---

## Flow 6: Unlink → Manual Edits → Relink (Account-Level)

This is the per-account unlink/relink flow (distinct from full provider disconnect).

```
1. User unlinks a single account (POST /accounts/{id}/unlink)
       ↓
   unlinkAccountFromBankConnection()
     • Account type → system
     • externalId → null, bankDataProviderConnectionId → null
     • Store connection history in externalData.connectionHistory
     • Transactions: originalId → null, accountType → system
     • Preserve originalId in externalData.originalSource
       ↓
2. User may add manual transactions while account is unlinked
       ↓
3. User relinks account (POST /accounts/{id}/link)
       ↓
   linkAccountToBankConnection()
     • Account type → provider type (e.g. lunchflow)
     • Set externalId and bankDataProviderConnectionId
       ↓
4. Transaction sync runs
       ↓
   Two-tier deduplication prevents duplicates:
     Primary: check by originalId (fast path)
     Secondary: check externalData.originalSource.originalId (covers unlink→relink)
       ↓
   Date-based filtering (all providers):
     Find latest existing transaction date → skip older API transactions
     This ensures manual transactions added during unlink period are preserved
     and only truly new bank transactions are imported
     Note: Monobank/Enable Banking filter via API params; LunchFlow filters post-fetch
```

### Why Two-Tier Dedup?

When an account is unlinked, `originalId` is set to `null` on all transactions. The original value is preserved in `externalData.originalSource.originalId`. On relink + sync:

1. **Primary dedup** (by `originalId`) won't match — the field is null
2. **Secondary dedup** checks `externalData.originalSource.originalId` via JSONB query
3. If found, restores `originalId` so future syncs use the fast primary path

### Why Date-Based Filtering Matters

If a user unlinks, adds a manual transaction dated today, then relinks — without date filtering, the sync would re-process all historical transactions from the API. With filtering:

- System finds the latest transaction date (the manual one)
- Only processes API transactions on or after that date
- Old bank transactions are skipped (they already exist via secondary dedup or are too old)
- New bank transactions after the manual one are imported normally

---

## Flow 7: Auth Failure Tracking

Providers that use API keys (LunchFlow) track consecutive authentication failures:

```
API call fails with ForbiddenError
       ↓
handleAuthError()
  • Increment consecutiveAuthFailures in metadata
  • If failures >= 2: deactivate connection (isActive = false)
  • Store deactivationReason = 'auth_failure'
       ↓
On next successful API call:
  resetAuthFailures()
  • Reset counter to 0
```

User can reactivate by updating credentials via `refreshCredentials()`.

---

## Provider Comparison

| Feature           | Monobank        | Enable Banking      | LunchFlow            |
| ----------------- | --------------- | ------------------- | -------------------- |
| Authentication    | API Token       | OAuth2 + JWT        | API Key              |
| Connection Flow   | Single-step     | Multi-step OAuth    | Single-step          |
| Session Expiry    | Never           | 90-360 days         | Never                |
| Transaction Sync  | Queue (BullMQ)  | Direct              | Direct               |
| Rate Limit        | 60s per request | Generous            | Generous             |
| Account IDs       | Stable          | Change on reconnect | Stable               |
| Matching Strategy | By externalId   | By IBAN + currency  | By externalId        |
| Date Filtering    | API-supported   | API-supported       | Post-fetch (runtime) |
| Period Sync       | Supported       | Supported           | Not supported        |
| Webhook Support   | Planned         | Not available       |

---

## Key Implementation Details

### Transaction Amount Handling

Amounts are **always stored as positive values**. The `transactionType` field determines expense vs income:

```typescript
// Monobank - API returns signed amounts
amount: Math.abs(data.amount),
transactionType: data.amount > 0 ? 'income' : 'expense',

// Enable Banking - uses credit_debit_indicator
const isExpense = tx.credit_debit_indicator === CreditDebitIndicator.DBIT;
amount: Math.abs(tx.amount),
transactionType: isExpense ? 'expense' : 'income',
```

### Transaction Deduplication

Each provider generates a unique `externalId` for transactions:

- **Monobank:** Uses API-provided `id`
- **Enable Banking:** SHA256 hash of transaction data (booking_date, amount, currency, references)
- **LunchFlow:** Uses API-provided `id` (pending transactions with null IDs are filtered out)

**Two-tier dedup** (applies to all providers during sync):

1. **Primary:** Check `originalId` column — fast, covers normal re-sync
2. **Secondary:** Check `externalData.originalSource.originalId` via JSONB query — covers unlink→relink flow where `originalId` was cleared to null but the value was preserved in `externalData`

If secondary dedup finds a match, it restores `originalId` so future syncs use the fast primary path.

### Enable Banking Reconnection

When consent expires and user reauthorizes:

1. Enable Banking assigns **new account UUIDs**
2. System matches accounts by **IBAN + currency** (stable identifiers)
3. Updates `externalId` on existing Accounts records
4. Transactions continue to link correctly

### Credential Security

```
Raw credentials → encryptCredentials() → Stored in DB (JSONB)
                                              ↓
                      getDecryptedCredentials() → Used in provider methods
```

---

## File Structure

```
bank-data-providers/
├── docs/
│   └── architecture.md           # This file
├── connection/
│   ├── connect-provider.ts       # Initial connection
│   ├── list-external-accounts.ts # Stage 1: list accounts
│   ├── connect-selected-accounts.ts # Stage 2: create accounts
│   ├── sync-transactions-for-account.ts
│   ├── disconnect-provider.ts
│   └── get-connection-details.ts
├── sync/
│   ├── sync-manager.ts           # Auto-sync orchestration
│   ├── sync-status-tracker.ts    # Redis status tracking
│   └── account-prioritizer.ts    # Sync priority scoring
├── utils/
│   └── credential-encryption.ts
├── monobank/
│   ├── monobank.provider.ts      # Provider implementation
│   ├── api-client.ts             # HTTP client + caching
│   ├── transaction-sync-queue.ts # BullMQ queue + worker
│   ├── types.ts
│   └── docs/details.md
├── enablebanking/
│   ├── enablebanking.provider.ts # Provider implementation
│   ├── api-client.ts             # HTTP client + JWT
│   ├── jwt-utils.ts              # JWT generation
│   ├── aspsp.service.ts          # Bank listing
│   ├── types.ts
│   └── docs/details.md
├── lunchflow/
│   ├── lunchflow.provider.ts     # Provider implementation
│   ├── api-client.ts             # HTTP client
│   ├── types.ts
│   └── lunchflow-flow.e2e.ts     # E2E tests
├── types.ts                      # Shared interfaces
├── base-provider.ts              # Abstract base class
├── registry.ts                   # Provider registry singleton
└── initialize-providers.ts       # App startup registration
```

---

## API Endpoints Summary

| Endpoint                                  | Method | Purpose                                     |
| ----------------------------------------- | ------ | ------------------------------------------- |
| `/:providerType/connect`                  | POST   | Start connection                            |
| `/connections`                            | GET    | List user connections                       |
| `/connections/:id`                        | GET    | Connection details                          |
| `/connections/:id`                        | DELETE | Disconnect (see Flow 5)                     |
| `/connections/:id/reauthorize`            | POST   | Renew consent (Enable Banking)              |
| `/connections/:id/available-accounts`     | GET    | List accounts for selection                 |
| `/connections/:id/sync-selected-accounts` | POST   | Create accounts + sync                      |
| `/connections/:id/sync-transactions`      | POST   | Sync single account                         |
| `/sync/trigger`                           | POST   | Trigger full sync                           |
| `/sync/status`                            | GET    | Get all sync statuses                       |
| `/enablebanking/oauth-callback`           | POST   | OAuth completion                            |
| `/enablebanking/countries`                | POST   | List available countries                    |
| `/enablebanking/banks`                    | POST   | List banks by country                       |
| `/accounts/:id/unlink`                    | POST   | Unlink account from connection (see Flow 6) |
| `/accounts/:id/link`                      | POST   | Link system account to connection           |
