# Bank Data Providers - Architecture Overview

## System Purpose

The bank-data-providers system is a modular framework for connecting users' bank accounts and syncing financial data. It supports multiple providers (Monobank, Enable Banking) through a unified interface using the Provider Pattern and Registry Pattern.

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
┌────────────────────┐  ┌─────────────────────────┐              │
│  MONOBANK PROVIDER │  │  ENABLE BANKING PROVIDER│              │
│                    │  │                         │              │
│ • Simple API token │  │ • OAuth2 + JWT flow     │              │
│ • BullMQ queue     │  │ • Direct sync           │              │
│ • 60s rate limit   │  │ • Consent tracking      │              │
└────────────────────┘  └─────────────────────────┘              │
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

## Provider Comparison

| Feature           | Monobank        | Enable Banking      |
| ----------------- | --------------- | ------------------- |
| Authentication    | API Token       | OAuth2 + JWT        |
| Connection Flow   | Single-step     | Multi-step OAuth    |
| Session Expiry    | Never           | 90-360 days         |
| Transaction Sync  | Queue (BullMQ)  | Direct              |
| Rate Limit        | 60s per request | Generous            |
| Account IDs       | Stable          | Change on reconnect |
| Matching Strategy | By externalId   | By IBAN + currency  |
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

Transactions are checked against `originalId` before creation.

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
├── types.ts                      # Shared interfaces
├── base-provider.ts              # Abstract base class
├── registry.ts                   # Provider registry singleton
└── initialize-providers.ts       # App startup registration
```

---

## API Endpoints Summary

| Endpoint                                  | Method | Purpose                        |
| ----------------------------------------- | ------ | ------------------------------ |
| `/:providerType/connect`                  | POST   | Start connection               |
| `/connections`                            | GET    | List user connections          |
| `/connections/:id`                        | GET    | Connection details             |
| `/connections/:id`                        | DELETE | Disconnect                     |
| `/connections/:id/reauthorize`            | POST   | Renew consent (Enable Banking) |
| `/connections/:id/available-accounts`     | GET    | List accounts for selection    |
| `/connections/:id/sync-selected-accounts` | POST   | Create accounts + sync         |
| `/connections/:id/sync-transactions`      | POST   | Sync single account            |
| `/sync/trigger`                           | POST   | Trigger full sync              |
| `/sync/status`                            | GET    | Get all sync statuses          |
| `/enablebanking/oauth-callback`           | POST   | OAuth completion               |
| `/enablebanking/countries`                | POST   | List available countries       |
| `/enablebanking/banks`                    | POST   | List banks by country          |
